import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth } from '../_shared/auth.ts'
import { assertUUID, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const FN = 'mark-intervention-arrived'

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
  if (e?.type === 'StripeInvalidRequestError') return "Le paiement de déplacement ne peut pas être capturé. Contactez le support."
  if (e?.type === 'StripeCardError') return "La banque du propriétaire a refusé la capture du déplacement."
  if (e?.type === 'StripeAPIError') return "Service de paiement temporairement indisponible. Réessayez."
  return e?.message || "Erreur lors de la capture du déplacement."
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id, 'mark_intervention_arrived', 10, 60_000)

    const body = await req.json()
    const interventionId = assertUUID(body.interventionId, 'interventionId')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    // 1. Fetch intervention + check assigned provider + phase
    const { data: iv, error: ivErr } = await db
      .from('interventions')
      .select('id, owner_id, assigned_provider_id, phase, displacement_payment_id, payment_mode')
      .eq('id', interventionId)
      .single()
    if (ivErr || !iv) {
      return respond({ success: false, error: "Intervention introuvable" }, 404)
    }
    if (iv.assigned_provider_id !== user.id) {
      log('warn', 'unauthorized', { userId: user.id, providerId: iv.assigned_provider_id })
      return respond({ success: false, error: "Vous n'êtes pas le prestataire de cette intervention" }, 403)
    }
    if (iv.phase !== 'visit_paid') {
      log('warn', 'invalid_phase', { phase: iv.phase })
      return respond({ success: false, error: "Vous ne pouvez signaler votre arrivée qu'après l'acceptation du déplacement" }, 409)
    }

    // 2. Capture the displacement pre-auth (if there is one)
    if (iv.displacement_payment_id && iv.payment_mode === 'in_app') {
      try {
        const intent = await stripe.paymentIntents.capture(iv.displacement_payment_id)
        log('info', 'displacement_captured', { pi: iv.displacement_payment_id, status: intent.status })
      } catch (err) {
        const e = err as { code?: string; type?: string; message?: string }
        // If already captured, continue; otherwise abort.
        if (e?.code === 'payment_intent_unexpected_state') {
          log('warn', 'displacement_already_captured', { pi: iv.displacement_payment_id })
        } else {
          log('error', 'stripe_capture_failed', { err: e?.message, code: e?.code })
          return respond({ success: false, error: mapStripeError(err) }, 502)
        }
      }
    }

    // 3. Update phase visit_paid → on_site (guarded by phase check)
    const nowIso = new Date().toISOString()
    const { data: updatedIv, error: upErr } = await db
      .from('interventions')
      .update({ phase: 'on_site', on_site_at: nowIso })
      .eq('id', interventionId)
      .eq('phase', 'visit_paid')
      .select('*')
      .single()
    if (upErr || !updatedIv) {
      log('error', 'intervention_update_failed', { err: upErr?.message })
      return respond({ success: false, error: "Mise à jour de l'intervention échouée" }, 500)
    }

    // 4. Invoice generation for the displacement leg.
    // Fire-and-forget: arrival must not fail if invoice generation is temporarily down.
    db.functions.invoke('generate-invoice', {
      body: { interventionId, invoiceType: 'displacement' },
      headers: { 'x-service-key': Deno.env.get('INTERNAL_SERVICE_KEY') || '' },
    }).catch((e: unknown) => log('warn', 'invoice_displacement_skipped', {
      err: e instanceof Error ? e.message : String(e),
    }))

    // Owner push is handled by the DB trigger `notify_intervention_status_change`
    // when phase flips to 'on_site' ("Prestataire arrivé"). No manual push needed.

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
