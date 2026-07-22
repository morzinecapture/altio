import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth } from '../_shared/auth.ts'
import { assertUUID, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const FN = 'validate-intervention'

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
  const e = err as { type?: string; message?: string }
  if (e?.type === 'StripeInvalidRequestError') return "Le paiement ne peut pas être capturé. Contactez le support."
  if (e?.type === 'StripeCardError') return "Votre banque a refusé la capture. Vérifiez votre moyen de paiement."
  if (e?.type === 'StripeAPIError') return "Service de paiement temporairement indisponible. Réessayez."
  return e?.message || "Erreur lors de la capture du paiement final."
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id, 'validate_intervention', 10, 60_000)

    const body = await req.json()
    const interventionId = assertUUID(body.interventionId, 'interventionId')
    const providedPaymentIntentId =
      typeof body.paymentIntentId === 'string' && body.paymentIntentId.startsWith('pi_')
        ? body.paymentIntentId
        : null

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    // 1. Fetch intervention, check ownership + phase
    const { data: iv, error: ivErr } = await db
      .from('interventions')
      .select('id, owner_id, assigned_provider_id, phase, mode, payment_mode, quote_amount, final_amount, quote_payment_id, stripe_payment_intent_id, service_type, mission_type')
      .eq('id', interventionId)
      .single()
    if (ivErr || !iv) {
      return respond({ success: false, error: "Intervention introuvable" }, 404)
    }
    if (iv.owner_id !== user.id) {
      log('warn', 'unauthorized', { userId: user.id, ownerId: iv.owner_id })
      return respond({ success: false, error: "Vous n'êtes pas le propriétaire de cette intervention" }, 403)
    }
    if (iv.phase !== 'completed') {
      log('warn', 'invalid_phase', { phase: iv.phase })
      return respond({ success: false, error: "L'intervention n'est pas prête à être validée" }, 409)
    }

    // 2. Capture / charge the final amount.
    //    Trois branches :
    //    (a) Quote in_app   : pré-auto créée lors de accept-intervention-quote
    //                         (quote_payment_id). Capture simple.
    //    (b) Inline in_app  : PAS de pré-auto existante (submit-inline-resolution
    //                         n'en crée pas). On crée un PaymentIntent à la
    //                         volée avec capture automatique, sans PaymentSheet
    //                         côté client (déjà validé par l'owner ici).
    //    (c) out_of_app     : rien à capturer côté Stripe (flux hors app).
    const quoteAmount     = Number(iv.quote_amount ?? 0)
    const inlineAmount    = Number(iv.final_amount ?? 0)
    const finalAmount     = quoteAmount > 0 ? quoteAmount : inlineAmount
    let   paymentIntentId = providedPaymentIntentId || iv.quote_payment_id || iv.stripe_payment_intent_id || null
    const isInline        = !iv.quote_payment_id && quoteAmount <= 0 && inlineAmount > 0

    if (providedPaymentIntentId && isInline) {
      const intent = await stripe.paymentIntents.retrieve(providedPaymentIntentId)
      const metadata = intent.metadata || {}
      if (metadata.interventionId !== interventionId || metadata.ownerId !== iv.owner_id) {
        log('warn', 'inline_payment_intent_mismatch', {
          interventionId,
          paymentIntentId: providedPaymentIntentId,
          metadata,
        })
        return respond({ success: false, error: "Paiement invalide pour cette intervention." }, 400)
      }
      if (intent.status !== 'succeeded') {
        log('warn', 'inline_payment_not_succeeded', {
          paymentIntentId: providedPaymentIntentId,
          status: intent.status,
        })
        return respond({ success: false, error: "Le paiement n'est pas confirmé." }, 409)
      }
      paymentIntentId = intent.id
    } else if (iv.payment_mode === 'in_app' && paymentIntentId && !isInline) {
      // (a) Capture d'une pré-autorisation existante (parcours devis).
      try {
        const intent = await stripe.paymentIntents.capture(paymentIntentId)
        log('info', 'quote_captured', { pi: paymentIntentId, status: intent.status })
      } catch (err) {
        const e = err as { code?: string; type?: string; message?: string }
        if (e?.code === 'payment_intent_unexpected_state') {
          log('warn', 'quote_already_captured', { pi: paymentIntentId })
        } else {
          log('error', 'stripe_capture_failed', { err: e?.message, code: e?.code })
          return respond({ success: false, error: mapStripeError(err) }, 502)
        }
      }
    } else if (iv.payment_mode === 'in_app' && isInline && iv.assigned_provider_id) {
      // (b) Parcours inline : création d'un PaymentIntent à confirmer côté app.
      // On renvoie le client_secret pour ouvrir la PaymentSheet. La mission ne
      // passe en paid qu'au second appel, après confirmation Stripe.
      const amountCents = Math.round(inlineAmount * 100)
      if (amountCents < 50) {
        log('warn', 'inline_amount_below_stripe_minimum', { inlineAmount })
        return respond({ success: false, error: "Montant trop faible pour être encaissé (minimum 0,50 €)." }, 400)
      }
      try {
        const { data: profile } = await db
          .from('provider_profiles')
          .select('stripe_account_id')
          .eq('provider_id', iv.assigned_provider_id)
          .single()

        const params: Stripe.PaymentIntentCreateParams = {
          amount: amountCents,
          currency: 'eur',
          capture_method: 'automatic',
          automatic_payment_methods: { enabled: true },
          metadata: {
            interventionId,
            ownerId: iv.owner_id,
            providerId: iv.assigned_provider_id,
            purpose: 'inline_resolution',
          },
        }

        if (profile?.stripe_account_id) {
          try {
            const account = await stripe.accounts.retrieve(profile.stripe_account_id)
            if (account.charges_enabled) {
              params.transfer_data = { destination: profile.stripe_account_id }
              // Modèle 10% + 10% = 2/11 du TTC en application_fee.
              params.application_fee_amount = Math.round(amountCents * 2 / 11)
            } else {
              params.metadata = { ...params.metadata, needs_manual_transfer: 'true' }
            }
          } catch (_e) {
            params.metadata = { ...params.metadata, needs_manual_transfer: 'true' }
          }
        } else {
          params.metadata = { ...params.metadata, needs_manual_transfer: 'true' }
        }

        // Récupérer customer + payment method par défaut pour charger off_session.
        const { data: ownerRow } = await db
          .from('users')
          .select('stripe_customer_id')
          .eq('id', iv.owner_id)
          .single()
        if (ownerRow?.stripe_customer_id) {
          params.customer = ownerRow.stripe_customer_id
        }

        const pi = await stripe.paymentIntents.create(params)
        log('info', 'inline_payment_intent_created', { pi: pi.id, status: pi.status, amountCents })
        return respond({
          success: true,
          data: {
            intervention: iv,
            paymentIntentClientSecret: pi.client_secret,
            paymentIntentId: pi.id,
          },
        })
      } catch (err) {
        log('error', 'stripe_inline_failed', { err: err instanceof Error ? err.message : String(err) })
        return respond({ success: false, error: mapStripeError(err) }, 502)
      }
    }

    // 3. Flip phase completed → paid + stamp timestamps + set final_amount
    const nowIso = new Date().toISOString()
    const { data: updatedIv, error: upErr } = await db
      .from('interventions')
      .update({
        phase: 'paid',
        paid_at: nowIso,
        validated_at: nowIso,
        final_amount: finalAmount > 0 ? finalAmount : null,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq('id', interventionId)
      .eq('phase', 'completed')
      .select('*')
      .single()
    if (upErr || !updatedIv) {
      log('error', 'intervention_update_failed', { err: upErr?.message })
      return respond({ success: false, error: "Mise à jour de l'intervention échouée" }, 500)
    }

    // 4. Generate the invoice set.
    //    - in_app    : service (mandat presta → owner) + service_fee + commission
    //    - out_of_app: service_fee + commission UNIQUEMENT (Altio n'émet pas de
    //      mandat puisque le règlement presta transite hors plateforme).
    // Dedup est géré côté generate-invoice via (intervention_id, invoice_type).
    const invoiceHeaders = { 'x-service-key': Deno.env.get('INTERNAL_SERVICE_KEY') || '' }
    const invoiceTypes = iv.payment_mode === 'out_of_app'
      ? ['service_fee', 'commission']
      : ['service', 'service_fee', 'commission']
    Promise.all(
      invoiceTypes.map((invoiceType) =>
        db.functions.invoke('generate-invoice', {
          body: { interventionId, invoiceType, stripePaymentIntentId: paymentIntentId },
          headers: invoiceHeaders,
        })
      )
    ).catch((e: unknown) => log('warn', 'invoice_generation_error', {
      err: e instanceof Error ? e.message : String(e),
    }))

    // 5. Rappel fiscal Art. 242 bis CGI — ciblé PRESTATAIRE.
    //    Art. 242 bis CGI vise les vendeurs/prestataires (utilisateurs percevant
    //    des revenus via la plateforme) : c'est à eux que la notice annuelle
    //    d'information sur les obligations fiscales et sociales est due. La
    //    sanction (50 000 €) frappe Altio en tant que plateforme opératrice.
    //    Si la spec produit demande en plus un push d'information côté owner
    //    (ex. "Conservez votre facture pour déclarer"), ajouter une seconde
    //    notification distincte — ne pas rediriger celle-ci.
    // Le trigger DB `notify_intervention_status_change` envoie déjà le push
    // "Paiement reçu" quand phase → paid ; on ajoute ici la notice fiscale.
    if (iv.assigned_provider_id) {
      db.functions.invoke('send-push', {
        body: {
          userId: iv.assigned_provider_id,
          title: '📋 Rappel fiscal',
          body: "Les revenus perçus via Altio sont imposables et soumis aux cotisations sociales. Consultez impots.gouv.fr.",
          data: { type: 'fiscal_reminder', interventionId },
          notifType: 'fiscal_reminder',
          referenceId: interventionId,
        },
      }).catch((e: unknown) => log('warn', 'fiscal_push_failed', {
        err: e instanceof Error ? e.message : String(e),
      }))
    }

    return respond({ success: true, data: { intervention: updatedIv } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond({ success: false, error: err.message }, 400)
    }
    const msg = err instanceof Error ? err.message : String(err)
    const isAuth = /authorization|token/i.test(msg)
    log('error', 'unhandled', { err: msg })
    return respond({ success: false, error: isAuth ? "Session expirée, veuillez vous reconnecter" : msg }, isAuth ? 401 : 400)
  }
})
