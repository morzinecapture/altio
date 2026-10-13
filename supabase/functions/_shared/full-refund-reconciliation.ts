type Receipt = { charge_id: string; payment_intent_id: string | null; livemode: boolean };
const objectId = (value: any): string | null => typeof value === 'string' ? value : value?.id || null;
const cents = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || Math.abs(parsed * 100 - Math.round(parsed * 100)) > 0.00001) throw new Error('Montant de facture invalide');
  return Math.round(parsed * 100);
};

/** Reconciliation only: no capture, refund or transfer mutation is performed. */
export async function reconcileFullRefund(db: any, stripe: any, receipt: Receipt) {
  const charge = await stripe.charges.retrieve(receipt.charge_id);
  if (charge.id !== receipt.charge_id || charge.livemode !== receipt.livemode || charge.currency !== 'eur' ||
      objectId(charge.payment_intent) !== receipt.payment_intent_id || !receipt.payment_intent_id ||
      !Number.isSafeInteger(charge.amount) || charge.amount <= 0) throw new Error('Référence de remboursement incohérente');
  if (!charge.refunded || charge.amount_refunded !== charge.amount) return { completed: false, reason: 'Remboursement partiel : ventilation des avoirs à finaliser' };
  const { data: invoices, error } = await db.from('invoices').select('id,invoice_type,amount_ttc,stripe_pi_id')
    .eq('stripe_pi_id', receipt.payment_intent_id).neq('invoice_type', 'credit_note');
  if (error || !Array.isArray(invoices)) throw new Error('Factures indisponibles');
  const service = invoices.filter((i: any) => ['service', 'displacement'].includes(i.invoice_type));
  const fees = invoices.filter((i: any) => i.invoice_type === 'service_fee');
  const commissions = invoices.filter((i: any) => i.invoice_type === 'commission');
  if (invoices.length !== 3 || service.length !== 1 || fees.length !== 1 || commissions.length !== 1 ||
      invoices.some((i: any) => i.stripe_pi_id !== receipt.payment_intent_id) ||
      cents(service[0].amount_ttc) + cents(fees[0].amount_ttc) !== charge.amount) throw new Error('Factures et paiement à rapprocher');
  const transferId = objectId(charge.transfer);
  const applicationFeeId = objectId(charge.application_fee);
  const expectedFees = cents(fees[0].amount_ttc) + cents(commissions[0].amount_ttc);
  if (!transferId || (expectedFees > 0 && !applicationFeeId)) throw new Error('Références Connect manquantes');
  const transfer = await stripe.transfers.retrieve(transferId);
  if (transfer.id !== transferId || transfer.currency !== charge.currency || transfer.livemode !== charge.livemode || !Number.isSafeInteger(transfer.amount) || transfer.amount <= 0 ||
      transfer.amount_reversed !== transfer.amount || objectId(transfer.source_transaction) !== charge.id) {
    throw new Error('Contrepassation Connect non confirmée');
  }
  if (applicationFeeId) {
    const fee = await stripe.applicationFees.retrieve(applicationFeeId);
    if (fee.id !== applicationFeeId || (objectId(fee.originating_transaction) || objectId(fee.charge)) !== charge.id ||
        fee.currency !== charge.currency || fee.livemode !== charge.livemode || fee.amount !== expectedFees || fee.amount_refunded !== fee.amount) {
      throw new Error('Remboursement des frais Connect non confirmé');
    }
  }
  for (const invoice of invoices) {
    if (cents(invoice.amount_ttc) === 0) continue;
    const { data, error: creditError } = await db.functions.invoke('generate-credit-note', {
      body: { invoiceId: invoice.id, reason: `Remboursement intégral confirmé — ${charge.id}` },
    });
    if (creditError || data?.success !== true) throw new Error('Émission des avoirs incomplète');
  }
  const { error: markError } = await db.from('stripe_refund_events').update({ reconciliation_state: 'completed', reconciled_at: new Date().toISOString(), last_error: null })
    .eq('charge_id', charge.id).eq('livemode', receipt.livemode);
  if (markError) throw new Error('Confirmation du rapprochement indisponible');
  return { completed: true };
}
