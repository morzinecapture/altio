type RefundNotification = {
  id: string; created: number; livemode: boolean;
  data: { object: {
    id: string; payment_intent?: string | { id: string } | null;
    amount: number; amount_refunded: number; currency: string; refunded: boolean;
  } };
};

/** Called only after webhook signature, account scope and mode verification. */
export function refundReceipt(event: RefundNotification) {
  const charge = event.data.object;
  const paymentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent : charge.payment_intent?.id || null;
  if (!event.id.startsWith('evt_') || !charge.id.startsWith('ch_') ||
      (paymentId !== null && !paymentId.startsWith('pi_')) ||
      !Number.isSafeInteger(charge.amount) || !Number.isSafeInteger(charge.amount_refunded) ||
      charge.amount_refunded < 0 || charge.amount < charge.amount_refunded ||
      !/^[a-z]{3}$/.test(charge.currency) || !Number.isSafeInteger(event.created) ||
      typeof charge.refunded !== 'boolean' || typeof event.livemode !== 'boolean') {
    throw new Error('Invalid refund notification');
  }
  return {
    event_id: event.id, charge_id: charge.id, payment_intent_id: paymentId,
    amount_refunded_cents: charge.amount_refunded, charge_amount_cents: charge.amount,
    currency: charge.currency, fully_refunded: charge.refunded, livemode: event.livemode,
    event_created_at: new Date(event.created * 1000).toISOString(),
  };
}

export async function recordRefundEvent(db: { from: (table: string) => any }, event: RefundNotification) {
  // Duplicate delivery must not reset a reconciliation already completed.
  // Persistence failure propagates to the webhook's retry response.
  const { error } = await db.from('stripe_refund_events')
    .upsert(refundReceipt(event), { onConflict: 'event_id', ignoreDuplicates: true });
  if (error) throw new Error('Refund notification could not be persisted');
}
