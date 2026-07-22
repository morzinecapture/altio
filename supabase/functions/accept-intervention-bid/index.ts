import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth } from '../_shared/auth.ts'
import { assertUUID, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const FN = 'accept-intervention-bid'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

function log(level: string, msg: string, context: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, fn: FN, ...context }))
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function mapStripeError(err: unknown): string {
  const e = err as { type?: string; message?: string; code?: string }
  if (e?.type === 'StripeCardError') return "Paiement refusé par votre banque. Réessayez avec une autre carte."
  if (e?.type === 'StripeInvalidRequestError') return "Paramètres de paiement invalides. Réessayez dans un instant."
  if (e?.type === 'StripeAPIError') return "Service de paiement temporairement indisponible. Réessayez."
  if (e?.type === 'StripeAuthenticationError') return "Configuration Stripe incorrecte côté serveur. Contactez le support Altio."
  if (e?.type === 'StripeConnectionError') return "Connexion à Stripe impossible. Vérifiez votre réseau puis réessayez."
  return e?.message || "Erreur lors de la pré-autorisation du paiement."
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id, 'accept_intervention_bid', 10, 60_000)

    const body = await req.json()
    const interventionId = assertUUID(body.interventionId, 'interventionId')
    const bidId = assertUUID(body.bidId, 'bidId')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseService) {
      log('error', 'missing_supabase_secrets', { hasUrl: !!supabaseUrl, hasKey: !!supabaseService })
      return respond({
        success: false,
        error: "Configuration serveur incomplète (clé service manquante). Contactez le support Altio.",
      }, 500)
    }
    const db = createClient(supabaseUrl, supabaseService)
    log('info', 'accept_bid_start', { userId: user.id, interventionId, bidId })

    // 1. Fetch intervention + check ownership + phase
    const { data: iv, error: ivErr } = await db
      .from('interventions')
      .select('id, owner_id, phase, mode, payment_mode, scheduled_at, assigned_provider_id, displacement_payment_id')
      .eq('id', interventionId)
      .single()
    if (ivErr || !iv) {
      log('warn', 'intervention_not_found', { interventionId, err: ivErr?.message })
      return respond({ success: false, error: "Intervention introuvable" }, 404)
    }
    if (iv.owner_id !== user.id) {
      log('warn', 'unauthorized', { userId: user.id, ownerId: iv.owner_id })
      return respond({ success: false, error: "Vous n'êtes pas autorisé à accepter cette offre" }, 403)
    }

    // ── Idempotency (Phase 7.3 §7) ────────────────────────────────────
    // Si l'owner a cancel le PaymentSheet côté client, phase est déjà
    // visit_paid mais le PI n'est pas confirmé. Un second call ne doit
    // pas créer un nouveau PI si l'ancien est encore utilisable — sinon
    // double-débit possible.
    if (iv.phase === 'visit_paid' && iv.displacement_payment_id && iv.assigned_provider_id) {
      // Check que le bid ciblé est bien celui déjà accepté pour cette
      // intervention, sinon on rejette (owner essaie de changer de
      // presta après coup → non autorisé).
      const { data: existingBid } = await db
        .from('intervention_bids')
        .select('id, provider_id, intervention_id, status')
        .eq('id', bidId)
        .maybeSingle()
      const sameProvider =
        existingBid?.provider_id === iv.assigned_provider_id &&
        existingBid?.intervention_id === interventionId
      if (!sameProvider) {
        log('warn', 'idempotent_bid_mismatch', { bidId, assignedProviderId: iv.assigned_provider_id })
        return respond(
          {
            success: false,
            error: "Cette intervention a déjà un prestataire attribué.",
          },
          409,
        )
      }

      try {
        const existingPi = await stripe.paymentIntents.retrieve(iv.displacement_payment_id)
        log('info', 'idempotent_retrieve_pi', {
          paymentIntentId: existingPi.id,
          status: existingPi.status,
        })

        if (
          existingPi.status === 'requires_payment_method' ||
          existingPi.status === 'requires_confirmation' ||
          existingPi.status === 'requires_action'
        ) {
          return respond({
            success: true,
            data: {
              intervention: iv,
              paymentIntentClientSecret: existingPi.client_secret,
              paymentIntentId: existingPi.id,
              alreadyConfirmed: false,
            },
          })
        }

        if (existingPi.status === 'requires_capture' || existingPi.status === 'succeeded') {
          return respond({
            success: true,
            data: {
              intervention: iv,
              paymentIntentClientSecret: null,
              paymentIntentId: existingPi.id,
              alreadyConfirmed: true,
            },
          })
        }

        if (existingPi.status === 'canceled') {
          // PI mort — on recrée un PI identique à partir des frais déjà
          // copiés sur l'intervention, sans retoucher au bid (déjà
          // accepté) ni aux autres (déjà rejetés).
          const { data: ivFees } = await db
            .from('interventions')
            .select('displacement_fee, first_hour_fee')
            .eq('id', interventionId)
            .single()
          const dispCents = Math.round(Number(ivFees?.displacement_fee ?? 0) * 100)
          const firstCents = Math.round(Number(ivFees?.first_hour_fee ?? 0) * 100)
          const recreateAmount = dispCents + firstCents
          if (recreateAmount < 50) {
            return respond(
              { success: false, error: "Montant insuffisant pour recréer le paiement." },
              400,
            )
          }
          const recreated = await stripe.paymentIntents.create({
            amount: recreateAmount,
            currency: 'eur',
            capture_method: 'manual',
            metadata: {
              interventionId,
              bidId,
              ownerId: user.id,
              providerId: iv.assigned_provider_id,
              purpose: 'displacement_retry',
            },
          })
          await db
            .from('interventions')
            .update({ displacement_payment_id: recreated.id })
            .eq('id', interventionId)
          log('info', 'idempotent_pi_recreated', { paymentIntentId: recreated.id })
          return respond({
            success: true,
            data: {
              intervention: { ...iv, displacement_payment_id: recreated.id },
              paymentIntentClientSecret: recreated.client_secret,
              paymentIntentId: recreated.id,
              alreadyConfirmed: false,
            },
          })
        }

        // Statut intermédiaire inattendu (processing) : on refuse pour
        // éviter le double-débit.
        log('warn', 'idempotent_pi_unexpected_status', {
          paymentIntentId: existingPi.id,
          status: existingPi.status,
        })
        return respond(
          { success: false, error: "Paiement en cours de traitement. Réessayez dans un instant." },
          409,
        )
      } catch (e) {
        // Retrieve Stripe raté — on ne peut pas garantir l'idempotence.
        // On refuse plutôt que de créer un potentiel doublon.
        log('error', 'idempotent_pi_retrieve_failed', {
          paymentIntentId: iv.displacement_payment_id,
          err: e instanceof Error ? e.message : String(e),
        })
        return respond(
          { success: false, error: "Impossible de vérifier le paiement existant. Réessayez dans un instant." },
          502,
        )
      }
    }

    if (iv.phase !== 'visit_pending') {
      log('warn', 'invalid_phase', { phase: iv.phase })
      return respond({ success: false, error: "Cette intervention n'accepte plus d'offres" }, 409)
    }

    // Règle FLOW.md §6.3 : la pré-autorisation Stripe ne se déclenche à
    // l'acceptation d'un bid QUE si l'intervention est urgente (asap)
    // ou planifiée à moins de 48h. Pour scheduled > 48h, le paiement
    // n'arrive qu'à l'acceptation du devis émis sur place.
    const SCHEDULED_MIN_LEAD_MS = 48 * 60 * 60 * 1000
    const scheduledAtMs = iv.scheduled_at ? new Date(iv.scheduled_at).getTime() : null
    const isUnder48h =
      iv.mode === 'asap' ||
      (scheduledAtMs !== null && scheduledAtMs < Date.now() + SCHEDULED_MIN_LEAD_MS)

    // 2. Fetch bid
    const { data: bid, error: bidErr } = await db
      .from('intervention_bids')
      .select('id, intervention_id, provider_id, displacement_fee, diagnostic_fee, first_hour_fee, hourly_rate, status')
      .eq('id', bidId)
      .single()
    if (bidErr || !bid) {
      return respond({ success: false, error: "Offre introuvable" }, 404)
    }
    if (bid.intervention_id !== interventionId) {
      return respond({ success: false, error: "Offre incompatible avec cette intervention" }, 400)
    }
    if (bid.status !== 'pending') {
      return respond({ success: false, error: "Cette offre n'est plus disponible" }, 409)
    }

    // 3. Pre-authorize Stripe for displacement + 1re heure (FLOW.md §3.A.2)
    // Manual capture : capturé à l'arrivée sur place (mark-intervention-arrived).
    // Skip entirely si scheduled > 48h : la pré-auto se fera à l'acceptation
    // du devis émis sur place (cf. accept-intervention-quote).
    let clientSecret: string | null = null
    let paymentIntentId: string | null = null
    const displacementCents = Math.round(Number(bid.displacement_fee ?? 0) * 100)
    const firstHourCents = Math.round(Number(bid.first_hour_fee ?? 0) * 100)
    const preauthCents = displacementCents + firstHourCents

    if (isUnder48h && preauthCents >= 50) {
      // Fetch provider Stripe account for Connect split.
      // La colonne peut ne pas exister sur un environnement fraîchement
      // provisionné : on récupère l'erreur explicitement plutôt que de
      // swallow silencieusement.
      let providerStripeAccountId: string | null = null
      const { data: profile, error: profileErr } = await db
        .from('provider_profiles')
        .select('stripe_account_id')
        .eq('provider_id', bid.provider_id)
        .maybeSingle()
      if (profileErr) {
        log('warn', 'provider_profile_lookup_failed', {
          providerId: bid.provider_id,
          code: profileErr.code,
          msg: profileErr.message,
        })
      } else {
        providerStripeAccountId = (profile as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
      }

      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: preauthCents,
        currency: 'eur',
        capture_method: 'manual',
        metadata: {
          interventionId,
          bidId,
          ownerId: user.id,
          providerId: bid.provider_id,
          purpose: 'displacement',
        },
      }

      if (providerStripeAccountId) {
        try {
          const account = await stripe.accounts.retrieve(providerStripeAccountId)
          if (account.charges_enabled) {
            intentParams.transfer_data = { destination: providerStripeAccountId }
            // 10% + 10% model: application_fee_amount = amount * 2/11
            intentParams.application_fee_amount = Math.round(preauthCents * 2 / 11)
            log('info', 'connect_split_enabled', { providerStripeAccountId })
          } else {
            intentParams.metadata = { ...intentParams.metadata, needs_manual_transfer: 'true' }
            log('info', 'connect_not_ready', { providerStripeAccountId })
          }
        } catch (e) {
          // Account retrieve raté : on loggue puis on fallback sur un PI sans
          // transfer_data pour ne pas bloquer l'acceptation.
          log('warn', 'connect_account_retrieve_failed', {
            providerStripeAccountId,
            err: e instanceof Error ? e.message : String(e),
          })
          intentParams.metadata = { ...intentParams.metadata, needs_manual_transfer: 'true' }
        }
      } else {
        // Aucune configuration Connect : le PI est créé SANS transfer_data
        // pour permettre les tests end-to-end avant onboarding KYC du presta.
        // La commission sera réconciliée manuellement via needs_manual_transfer.
        intentParams.metadata = { ...intentParams.metadata, needs_manual_transfer: 'true' }
        log('info', 'connect_skipped_no_account', { providerId: bid.provider_id })
      }

      try {
        const pi = await stripe.paymentIntents.create(intentParams)
        clientSecret = pi.client_secret
        paymentIntentId = pi.id
        log('info', 'displacement_preauth_created', { paymentIntentId, amount: preauthCents })
      } catch (err) {
        log('error', 'stripe_preauth_failed', {
          err: err instanceof Error ? err.message : String(err),
          type: (err as { type?: string })?.type,
          code: (err as { code?: string })?.code,
        })
        return respond({
          success: false,
          error: mapStripeError(err),
          details: { step: 'stripe_preauth', amountCents: preauthCents },
        }, 502)
      }
    } else {
      log('info', 'displacement_preauth_skipped', {
        isUnder48h,
        preauthCents,
        reason: !isUnder48h ? 'scheduled_over_48h' : 'amount_below_50_cents',
      })
    }

    // 4. Reject all other pending bids, accept this one
    const { error: rejErr } = await db
      .from('intervention_bids')
      .update({ status: 'rejected' })
      .eq('intervention_id', interventionId)
      .eq('status', 'pending')
      .neq('id', bidId)
    if (rejErr) log('warn', 'reject_others_failed', { err: rejErr.message, code: rejErr.code })
    else log('info', 'other_bids_rejected', { interventionId })

    const { error: accErr } = await db
      .from('intervention_bids')
      .update({ status: 'accepted' })
      .eq('id', bidId)
    if (accErr) {
      log('error', 'accept_bid_failed', { err: accErr.message, code: accErr.code })
      return respond({
        success: false,
        error: "Impossible d'accepter cette offre. Réessayez ou contactez le support.",
        details: { step: 'accept_bid_update', code: accErr.code },
      }, 500)
    }
    log('info', 'bid_accepted', { bidId })

    // 5. Assign provider + copy fees + move phase, guarded by phase check (CAS-like)
    const { data: updatedIv, error: upErr } = await db
      .from('interventions')
      .update({
        assigned_provider_id: bid.provider_id,
        displacement_fee: bid.displacement_fee,
        diagnostic_fee: bid.diagnostic_fee,
        first_hour_fee: bid.first_hour_fee,
        hourly_rate: bid.hourly_rate,
        phase: 'visit_paid',
        displacement_payment_id: paymentIntentId,
        payment_mode: 'in_app',
      })
      .eq('id', interventionId)
      .eq('phase', 'visit_pending')
      .select('*')
      .single()

    if (upErr || !updatedIv) {
      log('error', 'intervention_update_failed', { err: upErr?.message, code: upErr?.code })
      return respond({
        success: false,
        error: "Mise à jour de l'intervention échouée. Réessayez ou contactez le support.",
        details: { step: 'intervention_update', code: upErr?.code },
      }, 500)
    }
    log('info', 'intervention_moved_to_visit_paid', { interventionId, paymentIntentId })

    // 6. Notify rejected providers (the DB trigger only notifies the accepted one)
    const { data: rejected } = await db
      .from('intervention_bids')
      .select('provider_id')
      .eq('intervention_id', interventionId)
      .eq('status', 'rejected')

    const seen = new Set<string>()
    for (const r of rejected ?? []) {
      if (!r.provider_id || r.provider_id === bid.provider_id || seen.has(r.provider_id)) continue
      seen.add(r.provider_id)
      db.functions.invoke('send-push', {
        body: {
          userId: r.provider_id,
          title: 'Offre non retenue',
          body: 'Le propriétaire a choisi une autre offre pour cette intervention.',
          data: { interventionId, type: 'bid_rejected' },
          notifType: 'intervention',
          referenceId: interventionId,
        },
      }).catch((e: unknown) => log('warn', 'push_rejected_failed', { err: e instanceof Error ? e.message : String(e) }))
    }

    return respond({
      success: true,
      data: {
        intervention: updatedIv,
        paymentIntentClientSecret: clientSecret,
        paymentIntentId,
      },
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond({ success: false, error: err.message }, 400)
    }
    const msg = err instanceof Error ? err.message : String(err)
    const isAuth = /authorization|token/i.test(msg)
    log('error', 'unhandled', { err: msg, stack: err instanceof Error ? err.stack : undefined })
    return respond({
      success: false,
      error: isAuth
        ? "Session expirée, veuillez vous reconnecter"
        : "Erreur interne serveur. Réessayez dans un instant.",
      details: { step: 'unhandled', raw: msg.slice(0, 200) },
    }, isAuth ? 401 : 500)
  }
})
