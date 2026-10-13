/** Mission fixed_rate is the TTC service price already charged by payment-order.
 * Preserve historical whole-euro payment rounding and reconcile both fee invoices
 * against the exact Stripe application_fee_amount used by create-payment-intent.
 */
export function missionInvoiceAmounts(rate: number, type: string, vatExempt: boolean, actualChargedCents?: number, actualPlatformCents?: number, serviceVatRate = 20, serviceHtCents?: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tarif de mission invalide')
  const serviceCents = Math.round(rate * 100)
  const chargedCents = actualChargedCents ?? Math.round(rate * 1.10) * 100
  const ownerFeeCents = chargedCents - serviceCents
  const platformCents = actualPlatformCents ?? Math.round(chargedCents * 2 / 11)
  if (!Number.isSafeInteger(chargedCents) || !Number.isSafeInteger(platformCents) || chargedCents < serviceCents || platformCents < ownerFeeCents || platformCents > chargedCents) throw new Error('Montants encaissés incohérents')
  const isService = type === 'service' || type === 'displacement'
  const ttcCents = isService ? serviceCents : type === 'service_fee' ? ownerFeeCents : platformCents - ownerFeeCents
  const exempt = isService && vatExempt
  const effectiveVat = isService ? (exempt ? 0 : serviceVatRate) : 20
  if (!Number.isFinite(effectiveVat) || effectiveVat < 0 || effectiveVat > 100) throw new Error('Taux de TVA invalide')
  const htCents = isService && serviceHtCents !== undefined ? serviceHtCents : effectiveVat === 0 ? ttcCents : Math.round(ttcCents / (1 + effectiveVat / 100))
  if (!Number.isSafeInteger(htCents) || htCents < 0 || htCents > ttcCents) throw new Error('Montant HT incohérent')
  return { amountHt: htCents / 100, amountTtc: ttcCents / 100, vatRate: effectiveVat, vatExempt: exempt }
}
