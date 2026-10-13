import { assertConnectIntent } from './connect-split.ts'

export function checkCompletionPayment(step: { emergency_id: string; phase: string; owner_id: string; payment_intent_id: string; amount_cents: number }, pi: any, account: string, now = Date.now()) {
  if (pi.id !== step.payment_intent_id || pi.metadata?.emergencyId !== step.emergency_id || pi.metadata?.ownerId !== step.owner_id ||
    pi.metadata?.completionFlow !== 'v1' || (step.phase === 'visit' ? !pi.metadata.bidId || pi.metadata.quoteId : !pi.metadata.quoteId || pi.metadata.bidId) ||
    pi.currency !== 'eur' || pi.amount !== step.amount_cents) throw new Error('Référence ou montant du paiement incohérent')
  assertConnectIntent(pi, account)
  if (pi.status === 'succeeded') {
    if (pi.amount_received !== step.amount_cents) throw new Error('Encaissement incomplet')
    return 'paid'
  }
  const deadline = pi.latest_charge?.payment_method_details?.card?.capture_before
  if (pi.status !== 'requires_capture' || pi.amount_capturable !== step.amount_cents || (deadline && deadline * 1000 <= now)) return 'payment_required'
  return 'capture'
}

// Claim and dispute are serialized by PostgreSQL. A dispute arriving after the
// capture has begun remains visible even if Stripe has already debited the card.
export async function processCompletion(db: any, stripe: any, id: string) {
  const { data: rows, error } = await db.rpc('claim_emergency_completion', { p_id: id, p_token: crypto.randomUUID() })
  if (error) throw error
  const step = rows?.[0]
  if (!step) return { status: 'unchanged' }
  const { data: payee, error: payeeError } = await db.from('provider_profiles').select('stripe_account_id').eq('provider_id', step.provider_id).single()
  if (payeeError) throw payeeError
  const pi = await stripe.paymentIntents.retrieve(step.payment_intent_id, { expand: ['latest_charge'] })
  const action = checkCompletionPayment(step, pi, payee?.stripe_account_id)
  if (action === 'payment_required') {
    await db.from('emergency_completion_steps').update({ status: 'payment_required', payment_error: 'Autorisation bancaire expirée ou non capturable ; nouveau paiement à organiser.' })
      .eq('id', id).eq('claim_token', step.claim_token).is('disputed_at', null).throwOnError()
    const { error: notifyError } = await db.rpc('_send_push', { p_user_id: step.owner_id, p_title: 'Paiement à régulariser', p_body: 'La prestation n’a pas été débitée. Contactez le support pour renouveler l’autorisation bancaire.', p_reference_id: step.emergency_id, p_ref_type: 'emergency' })
    if (notifyError) throw notifyError
    return { status: 'payment_required' }
  }
  if (action === 'capture') {
    const { data: current, error: readError } = await db.from('emergency_completion_steps').select('status,disputed_at,claim_token').eq('id', id).single()
    if (readError) throw readError
    if (current.disputed_at || current.status !== 'processing' || current.claim_token !== step.claim_token) return { status: 'disputed' }
    const captured = await stripe.paymentIntents.capture(pi.id, {}, { idempotencyKey: `completion-v1:${id}:${pi.id}` })
    if (checkCompletionPayment(step, captured, payee.stripe_account_id) !== 'paid') throw new Error('Encaissement non confirmé')
  }
  const { error: settleError } = await db.rpc('settle_emergency_completion', { p_id: id, p_payment: pi.id })
  if (settleError) throw settleError
  return { status: 'paid' }
}
