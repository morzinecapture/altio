import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { requireConnectSplit } from '../_shared/connect-split.ts'
import { connectStripe } from '../_shared/stripe-connect.ts'
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth } from '../_shared/auth.ts'
import { assertUUID, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const FN = 'accept-intervention-quote'

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
  if (e?.type === 'StripeCardError') return "Paiement refusé par votre banque. Réessayez avec une autre carte."
  if (e?.type === 'StripeInvalidRequestError') return "Paramètres de paiement invalides. Réessayez dans un instant."
  if (e?.type === 'StripeAPIError') return "Service de paiement temporairement indisponible. Réessayez."
  return e?.message || "Erreur lors de la pré-autorisation du devis."
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id, 'accept_intervention_quote', 10, 60_000)

    const body = await req.json()
    const interventionId = assertUUID(body.interventionId, 'interventionId')
    const quoteId = assertUUID(body.quoteId, 'quoteId')

    // Signature électronique (Phase 7.2) — FLOW.md §3.A.4.
    // Le client envoie une data URL PNG et le texte de consentement ; on les
    // stocke dans mission_quotes (owner_signature_png/_text/_at/_ip). La
    // présence d'une signature est requise pour que le devis soit
    // juridiquement opposable, mais on laisse passer les clients legacy (ou
    // flux migration) en fallback silencieux pour ne pas bloquer.
    const rawSignature =
      typeof body.signatureBase64 === 'string' ? body.signatureBase64.trim() : ''
    const signaturePng =
      rawSignature.startsWith('data:image/') && rawSignature.length < 2_000_000
        ? rawSignature
        : null
    const signatureText =
      typeof body.signatureText === 'string' && body.signatureText.trim()
        ? body.signatureText.trim().slice(0, 500)
        : null
    const signatureIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    // 1. Fetch intervention, check ownership + phase
    const { data: iv, error: ivErr } = await db
      .from('interventions')
      .select('id, owner_id, assigned_provider_id, phase, payment_mode, quote_amount')
      .eq('id', interventionId)
      .single()
    if (ivErr || !iv) {
      return respond({ success: false, error: "Intervention introuvable" }, 404)
    }
    if (iv.owner_id !== user.id) {
      log('warn', 'unauthorized', { userId: user.id, ownerId: iv.owner_id })
      return respond({ success: false, error: "Vous n'êtes pas le propriétaire de cette intervention" }, 403)
    }
    if (iv.phase !== 'quote_sent') {
      log('warn', 'invalid_phase', { phase: iv.phase })
      return respond({ success: false, error: "Ce devis n'est plus en attente d'acceptation" }, 409)
    }
    if (!iv.assigned_provider_id) {
      return respond({ success: false, error: "Aucun prestataire assigné à cette intervention" }, 500)
    }

    // 2. Fetch quote, verify it belongs to this intervention + still pending
    const { data: quote, error: qErr } = await db
      .from('mission_quotes')
      .select('id, intervention_id, provider_id, status, repair_cost, total_ht')
      .eq('id', quoteId)
      .single()
    if (qErr || !quote) {
      return respond({ success: false, error: "Devis introuvable" }, 404)
    }
    if (quote.intervention_id !== interventionId) {
      return respond({ success: false, error: "Devis incompatible avec cette intervention" }, 400)
    }
    if (quote.status !== 'pending') {
      return respond({ success: false, error: "Ce devis n'est plus en attente" }, 409)
    }

    const quoteTotal = Number(quote.total_ht ?? quote.repair_cost ?? iv.quote_amount ?? 0)
    if (!Number.isFinite(quoteTotal) || quoteTotal <= 0) {
      return respond({ success: false, error: "Montant du devis invalide" }, 400)
    }

    // 3. Pre-authorize Stripe for quote total IF in_app
    let clientSecret: string | null = null
    let paymentIntentId: string | null = null

    if (iv.payment_mode === 'in_app') {
      // Altio 10%+10% model: owner pays quote * 1.10 (quote amount already includes 10% service fee)
      // For this MVP we pre-authorize the displayed quote total. The 3-invoice split is
      // computed at capture-time via application_fee_amount = amount * 2/11.
      const amountCents = Math.round(quoteTotal * 100)
      if (amountCents < 50) {
        return respond({ success: false, error: "Montant minimum de 0,50 € pour un paiement en ligne" }, 400)
      }

      const { data: profile } = await db
        .from('provider_profiles')
        .select('stripe_account_id')
        .eq('provider_id', iv.assigned_provider_id)
        .single()

      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency: 'eur',
        capture_method: 'manual',
        metadata: {
          interventionId,
          quoteId,
          ownerId: user.id,
          providerId: iv.assigned_provider_id,
          purpose: 'quote',
        },
      }

      Object.assign(intentParams, await requireConnectSplit(connectStripe, profile?.stripe_account_id, amountCents))

      try {
        const pi = await stripe.paymentIntents.create(intentParams)
        clientSecret = pi.client_secret
        paymentIntentId = pi.id
        log('info', 'quote_preauth_created', { paymentIntentId, amount: amountCents })
      } catch (err) {
        log('error', 'stripe_preauth_failed', { err: err instanceof Error ? err.message : String(err) })
        return respond({ success: false, error: mapStripeError(err) }, 502)
      }
    }

    // 4. Mark quote accepted
    const nowIso = new Date().toISOString()
    const quoteUpdate: Record<string, unknown> = {
      status: 'accepted',
      accepted_at: nowIso,
      accepted_by: user.id,
      owner_signature_at: nowIso,
    }
    if (signaturePng) quoteUpdate.owner_signature_png = signaturePng
    if (signatureText) quoteUpdate.owner_signature_text = signatureText
    if (signatureIp) quoteUpdate.owner_signature_ip = signatureIp

    const { error: qUpErr } = await db
      .from('mission_quotes')
      .update(quoteUpdate)
      .eq('id', quoteId)
      .eq('status', 'pending')
    if (qUpErr) {
      log('error', 'quote_update_failed', { err: qUpErr.message })
      return respond({ success: false, error: "Impossible d'accepter le devis" }, 500)
    }

    // 5. Flip intervention phase quote_sent → quote_accepted (guarded)
    const updatePayload: Record<string, unknown> = { phase: 'quote_accepted' }
    if (paymentIntentId) updatePayload.quote_payment_id = paymentIntentId

    const { data: updatedIv, error: upErr } = await db
      .from('interventions')
      .update(updatePayload)
      .eq('id', interventionId)
      .eq('phase', 'quote_sent')
      .select('*')
      .single()
    if (upErr || !updatedIv) {
      log('error', 'intervention_update_failed', { err: upErr?.message })
      return respond({ success: false, error: "Mise à jour de l'intervention échouée" }, 500)
    }

    // Provider push is sent by the DB trigger `notify_intervention_status_change`
    // when phase flips to 'quote_accepted' ("Devis accepté"). No manual push needed.

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
    log('error', 'unhandled', { err: msg })
    return respond({ success: false, error: isAuth ? "Session expirée, veuillez vous reconnecter" : msg }, isAuth ? 401 : 400)
  }
})
