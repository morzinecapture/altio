import { HT_PRICING_VERSION, htCentsFromTtc, htPricing } from './billing.ts'

/** Reconcile each document to one captured payment, never the whole intervention. */
export function completionInvoiceAmounts(step: any, payment: any, source: any, type: string, providerVatExempt: boolean) {
  if (!step.paid_at || payment.status !== 'succeeded' || payment.id !== step.payment_intent_id ||
    payment.currency !== 'eur' || payment.amount_received !== step.amount_cents || payment.amount !== step.amount_cents ||
    payment.metadata?.completionFlow !== 'v1' || payment.metadata.emergencyId !== step.emergency_id || payment.metadata.ownerId !== step.owner_id) {
    throw new Error('Paiement de cette étape non confirmé')
  }
  const expectedServiceType = step.phase === 'visit' ? 'displacement' : 'service'
  if (![expectedServiceType, 'service_fee', 'commission'].includes(type)) throw new Error('Type de facture incompatible avec cette étape')
  if (source.provider_id !== step.provider_id || source.emergency_request_id !== step.emergency_id ||
    source.id !== (step.phase === 'visit' ? payment.metadata.bidId : payment.metadata.quoteId)) throw new Error('Prestation sans rapport avec ce paiement')
  let serviceCents: number
  let htCents: number
  let vatRate: number
  if (step.phase === 'visit') {
    serviceCents = Math.round((Number(source.travel_cost) + Number(source.diagnostic_cost)) * 100)
    vatRate = providerVatExempt ? 0 : 20
    htCents = htCentsFromTtc(serviceCents, vatRate / 100)
  } else {
    const subtotal = source.line_items?.length
      ? source.line_items.reduce((sum: number, line: any) => sum + Number(line.quantity ?? 1) * Number(line.unit_price_ht ?? line.unit_price), 0)
      : Number(source.repair_cost)
    const rate = source.is_vat_exempt === true ? 0 : Number(source.tva_rate ?? 0.20)
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('TVA du devis invalide')
    htCents = Math.round(subtotal * 100)
    serviceCents = htCents + Math.round(subtotal * rate * 100)
    vatRate = rate * 100
  }
  if (!Number.isSafeInteger(serviceCents) || serviceCents <= 0) throw new Error('Montants des factures incohérents avec le paiement')
  // Legacy payments took 10 % of the TTC price on each side; HT-model payments take 10 % of the HT price.
  const expected = payment.metadata.pricingVersion === HT_PRICING_VERSION
    ? htPricing(serviceCents, htCents)
    : { amount: serviceCents + Math.round(serviceCents * 0.10), applicationFee: Math.round((serviceCents + Math.round(serviceCents * 0.10)) * 2 / 11) }
  const ownerFee = payment.amount_received - serviceCents
  const providerFee = payment.application_fee_amount - ownerFee
  if (payment.amount_received !== expected.amount || payment.application_fee_amount !== expected.applicationFee ||
      !Number.isSafeInteger(providerFee) || providerFee < 0) {
    throw new Error('Montants des factures incohérents avec le paiement')
  }
  const service = type === expectedServiceType
  const cents = service ? serviceCents : type === 'service_fee' ? ownerFee : providerFee
  if (!service) vatRate = 20 // The operator’s configured VAT regime is applied by the issuer.
  // The service invoice reuses the quote's HT so it matches the quote to the cent.
  const amountHtCents = service ? htCents : Math.round(cents / (1 + vatRate / 100))
  return { amountTtc: cents / 100, amountHt: amountHtCents / 100, vatRate, vatExempt: vatRate === 0 }
}

export async function generateCompletionInvoices(db: any, step: any) {
  if (!step.paid_at) throw new Error('Étape non encaissée')
  if (step.invoiced_at) return
  const types = [step.phase === 'visit' ? 'displacement' : 'service', 'service_fee', 'commission']
  for (const invoiceType of types) {
    const { data, error } = await db.functions.invoke('generate-invoice', {
      body: { emergencyId: step.emergency_id, completionStepId: step.id, stripePaymentIntentId: step.payment_intent_id, invoiceType },
    })
    if (error || data?.error || !(data?.success || data?.ok)) throw new Error(`Facture ${invoiceType} indisponible`)
  }
  await db.from('emergency_completion_steps').update({ invoiced_at: new Date().toISOString(), invoice_error: null, invoice_retry_at: null }).eq('id', step.id).throwOnError()
}
