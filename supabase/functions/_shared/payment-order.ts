import { ValidationError, assertUUID } from './validate.ts'
import { HT_PRICING_VERSION, htCentsFromTtc, htPricing } from './billing.ts'

type Row = Record<string, any>
type ReadOrder = (table: string, id: string) => Promise<Row | null>
const fail = (message: string): never => { throw new ValidationError(message) }
const money = (value: unknown): number => {
  const amount = Number(value)
  if (value == null || !Number.isFinite(amount) || amount < 0) fail('Tarif enregistré invalide')
  return amount
}

// Only persisted business data determines the price, payee and capture mode.
export async function resolvePaymentOrder(userId: string, input: Row, read: ReadOrder, now = Date.now()) {
  const supplied = input.metadata || {}
  const ids: Record<string, string> = {}
  for (const key of ['missionId', 'emergencyId', 'bidId', 'quoteId', 'interventionId']) {
    if (supplied[key] !== undefined) ids[key] = assertUUID(supplied[key], key)
  }
  if (ids.interventionId) fail('Utilisez le parcours de paiement dédié aux interventions')
  if (ids.bidId && ids.quoteId) fail('Références de paiement ambiguës')
  const get = async (table: string, id: string) => (await read(table, id)) || fail('Commande introuvable')
  const owned = (row: Row) => {
    if (row.owner_id !== userId) fail('Cette commande ne vous appartient pas')
    if (['cancelled', 'rejected', 'expired', 'paid', 'completed'].includes(row.status)) fail('Commande non payable')
  }
  const providerVatRate = async (id: string) => (await get('users', id)).is_vat_exempt === true ? 0 : 0.20
  let price: ReturnType<typeof htPricing>
  let providerId: string
  let captureMethod: 'manual' | 'automatic' = 'automatic'
  if (ids.quoteId) {
    const quote = await get('mission_quotes', ids.quoteId)
    if (quote.intervention_id) fail('Utilisez le parcours dédié aux interventions')
    if (quote.status !== 'pending' || quote.stripe_payment_intent_id) fail('Devis déjà traité')
    const expiry = quote.valid_until
    if (expiry) {
      const date = new Date(expiry.length === 10 ? `${expiry}T23:59:59.999Z` : expiry).getTime()
      if (!Number.isFinite(date) || date < now) fail('Devis expiré')
    }
    if (ids.missionId && ids.missionId !== quote.mission_id || ids.emergencyId && ids.emergencyId !== quote.emergency_request_id) fail('Devis sans rapport avec la commande')
    const parentId = quote.emergency_request_id || quote.mission_id
    if (!parentId) fail('Devis sans commande')
    const parent = await get(quote.emergency_request_id ? 'emergency_requests' : 'missions', parentId)
    owned(parent)
    if ((parent.accepted_provider_id || parent.assigned_provider_id) !== quote.provider_id) fail('Prestataire non retenu')
    ids[quote.emergency_request_id ? 'emergencyId' : 'missionId'] = parentId
    const lines = quote.line_items || []
    const subtotal = lines.length ? lines.reduce((sum: number, line: Row) => sum + money(line.quantity ?? 1) * money(line.unit_price_ht ?? line.unit_price), 0) : money(quote.repair_cost)
    const vat = quote.is_vat_exempt === true ? 0 : money(quote.tva_rate ?? 0.20)
    if (vat > 1) fail('Taux de TVA invalide')
    const htCents = Math.round(subtotal * 100)
    price = htPricing(htCents + Math.round(subtotal * vat * 100), htCents)
    providerId = quote.provider_id
    captureMethod = 'manual'
  } else if (ids.bidId) {
    const bid = await get('emergency_bids', ids.bidId)
    if (!ids.emergencyId || ids.missionId || bid.emergency_request_id !== ids.emergencyId) fail('Offre sans rapport avec cette urgence')
    if (bid.status !== 'pending' || bid.stripe_phase1_payment_id) fail('Offre déjà traitée')
    const emergency = await get('emergency_requests', ids.emergencyId)
    owned(emergency)
    if (emergency.displacement_payment_id || emergency.accepted_provider_id) fail('Déplacement déjà accepté')
    // Displacement and diagnostic prices are TTC under the provider's VAT regime.
    const serviceCents = Math.round((money(bid.travel_cost) + money(bid.diagnostic_cost)) * 100)
    price = htPricing(serviceCents, htCentsFromTtc(serviceCents, await providerVatRate(bid.provider_id)))
    providerId = bid.provider_id
    captureMethod = 'manual'
  } else if (ids.missionId && !ids.emergencyId) {
    const mission = await get('missions', ids.missionId)
    owned(mission)
    if (mission.status !== 'validated' || mission.paid_at) fail('Mission non validée ou déjà payée')
    // fixed_rate is TTC; legacy captured payments keep their own metadata.
    const serviceCents = Math.round(money(mission.fixed_rate) * 100)
    price = htPricing(serviceCents, htCentsFromTtc(serviceCents, await providerVatRate(mission.assigned_provider_id)))
    providerId = mission.assigned_provider_id
  } else {
    fail('Une mission, une offre ou un devis est obligatoire')
  }
  const amount = price!.amount
  if (!providerId! || providerId! === userId) fail('Prestataire invalide')
  if (!Number.isSafeInteger(amount) || amount < 50 || amount > 99999900) fail('Montant hors limites')
  if (input.amount !== amount) fail('Le montant a changé. Actualisez la commande avant de payer.')
  if (input.captureMethod && input.captureMethod !== captureMethod) fail('Mode de paiement invalide')
  return {
    amount, applicationFee: price!.applicationFee, providerId: providerId!, captureMethod,
    metadata: {
      ...ids, ownerId: userId, pricingVersion: HT_PRICING_VERSION,
      serviceCents: String(price!.serviceCents), htCents: String(price!.htCents), feeCents: String(price!.feeCents),
      ...(ids.emergencyId ? { completionFlow: 'v1' } : {}),
    },
  }
}
