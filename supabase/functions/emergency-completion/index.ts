import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'npm:stripe@22.6.0'
import { requireAuth } from '../_shared/auth.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { assertUUID } from '../_shared/validate.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { checkCompletionPayment, processCompletion } from '../_shared/completion-payment.ts'

Deno.serve(async req => {
  const cors = handleCors(req); if (cors) return cors
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id,'emergency_completion',20,60000)
    const input = await req.json()
    const emergencyId = assertUUID(input.emergencyId, 'emergencyId')
    if (!['visit','repair'].includes(input.phase) || !['declare','approve','dispute'].includes(input.action)) return reply({ error: 'Action invalide' },400)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2026-08-26.dahlia' })
    const { data: source, error } = await db.from('emergency_requests').select('*').eq('id', emergencyId).single()
    if (error || !source || ![source.owner_id,source.accepted_provider_id].includes(user.id)) return reply({ error: 'Accès interdit' },403)
    let amount: number | null = null
    const payment = input.phase === 'visit' ? source.displacement_payment_id : source.quote_payment_id
    if (input.action === 'declare') {
      if (source.accepted_provider_id !== user.id) return reply({ error: 'Prestataire requis' },403)
      if (!payment) return reply({ error: 'Autorisation bancaire manquante' },409)
      const pi = await stripe.paymentIntents.retrieve(payment, { expand: ['latest_charge'] })
      const { data: payee, error: payeeError } = await db.from('provider_profiles').select('stripe_account_id').eq('provider_id', source.accepted_provider_id).single()
      if (payeeError) throw payeeError
      // Expired holds may still be declared complete; the worker will require renewal.
      checkCompletionPayment({ emergency_id: emergencyId, phase: input.phase, owner_id: source.owner_id, payment_intent_id: payment, amount_cents: pi.amount },pi,payee?.stripe_account_id)
      amount = pi.amount
    }
    const { data: step, error: actionError } = await db.rpc('emergency_completion_action', {
      p_emergency: emergencyId,p_phase: input.phase,p_action: input.action,p_actor: user.id,
      p_payment: payment,p_amount: amount,p_reason: input.reason || null,p_finish: input.finishEmergency === true,
    }).single()
    if (actionError) throw actionError
    if (input.action === 'declare' && step.paid_at && step.finish_emergency) {
      const { error } = await db.rpc('settle_emergency_completion', { p_id: step.id, p_payment: step.payment_intent_id }); if (error) throw error
    }
    // A failed immediate capture remains queued; the durable worker retries safely.
    if (input.action === 'approve') {
      try { await processCompletion(db,stripe,step.id) } catch (error) {
        console.error('Completion approval failed', step.id, error instanceof Error ? error.message : (error as any)?.message)
        const { data: current } = await db.from('emergency_completion_steps').select('*').eq('id', step.id).single()
        return reply({ step: current || step, paymentPending: true })
      }
    }
    const { data: current, error: refreshError } = await db.from('emergency_completion_steps').select('*').eq('id', step.id).single()
    if (refreshError) throw refreshError
    return reply({ step: current, paymentPending: input.action === 'approve' && !current.paid_at })
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Validation indisponible' },400) }
})
