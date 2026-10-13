import { ValidationError } from './validate.ts';
import { HT_PRICING_VERSION } from './billing.ts';

export function verifyCaptureOrder(userId: string, source: Record<string, any>, intent: Record<string, any>, ids: { missionId?: string; emergencyId?: string }, amount?: number) {
  const fail = (message: string): never => { throw new ValidationError(message); };
  if (Boolean(ids.missionId) === Boolean(ids.emergencyId)) fail('Une seule mission ou urgence est obligatoire');
  if (source.owner_id !== userId && (source.assigned_provider_id || source.accepted_provider_id) !== userId) fail('Vous ne participez pas à cette mission');
  const kind = ids.missionId ? 'missionId' : 'emergencyId';
  if (intent.metadata?.[kind] !== ids[kind]) fail('Ce paiement ne correspond pas à cette mission');
  if (intent.metadata?.interventionId) fail('Utilisez le parcours dédié aux interventions');
  if (intent.metadata?.ownerId && intent.metadata.ownerId !== source.owner_id) fail('Propriétaire du paiement incorrect');
  const storedId = ids.missionId ? source.payment_intent_id || source.stripe_payment_intent_id : source.quote_payment_id;
  if (storedId && storedId !== intent.id) fail('Le paiement enregistré est différent');
  const validStates = ids.missionId ? ['validated', 'paid'] : ['quote_accepted', 'in_progress', 'completed'];
  if (!validStates.includes(source.status)) fail('La mission ne permet pas encore la capture');
  if (intent.currency !== 'eur') fail('Devise de paiement incorrecte');
  if (amount !== undefined && amount !== intent.amount) fail('La capture partielle n’est pas autorisée dans ce parcours');
  if (!['requires_capture', 'succeeded'].includes(intent.status)) fail('Empreinte bancaire non capturable');
  if (intent.status === 'succeeded' && intent.amount_received !== intent.amount) fail('Montant encaissé incomplet');
  if (intent.status === 'requires_capture' && intent.amount_capturable !== intent.amount) fail('Montant capturable incohérent');
  if (ids.missionId && !intent.metadata?.quoteId && !missionAmountMatches(source, intent)) fail('Le montant ne correspond pas au tarif validé');
}

// HT-model intents record their split; it must still match the validated TTC rate.
function missionAmountMatches(source: Record<string, any>, intent: Record<string, any>) {
  const serviceCents = Math.round(Number(source.fixed_rate) * 100);
  const meta = intent.metadata || {};
  if (meta.pricingVersion === HT_PRICING_VERSION) {
    const feeCents = Number(meta.feeCents);
    return Number(meta.serviceCents) === serviceCents && Number.isSafeInteger(feeCents) && feeCents >= 0 &&
      feeCents <= Math.round(serviceCents * 0.10) && intent.amount === serviceCents + feeCents;
  }
  return intent.amount === (meta.pricingVersion === 'cents-v1' ? Math.round(Number(source.fixed_rate) * 1.10 * 100) : Math.round(Number(source.fixed_rate) * 1.10) * 100);
}
