/**
 * Constantes de commission Altio — source de vérité unique.
 *
 * Modèle (opaque) :
 *  - Altio prélève 10 % du prix HT du prestataire de chaque côté
 *  - Le propriétaire paie le prix TTC + 10 % du HT (frais de service)
 *  - Le prestataire reçoit le prix TTC − 10 % du HT (commission plateforme)
 *
 * Aucun écran ne doit afficher la commission totale (20 %), ni à une partie
 * la commission prélevée sur l'autre.
 * Miroir de supabase/functions/_shared/billing.ts : le serveur refuse tout
 * paiement dont le montant diffère.
 */

/** Commission prélevée sur chaque partie (propriétaire ET prestataire) */
export const COMMISSION_RATE = 0.10;

/** Taux appliqué quand le prix sans TVA est égal au HT (franchise de base) */
export const OWNER_MARKUP_RATE = 1 + COMMISSION_RATE;

/** Idem côté prestataire */
export const PROVIDER_PAYOUT_RATE = 1 - COMMISSION_RATE;

/** Taux de TVA d'un prestataire non exonéré pour un prix saisi TTC */
export const providerVatRate = (isVatExempt?: boolean | null) => (isVatExempt === true ? 0 : 0.20);

/** Décomposition d'un prix à partir des centimes TTC et HT du prestataire. */
export function priceFromCents(serviceCents: number, htCents: number) {
  const feeCents = Math.round(htCents * COMMISSION_RATE);
  return {
    service: serviceCents / 100,
    ht: htCents / 100,
    fee: feeCents / 100,
    total: (serviceCents + feeCents) / 100,
    payout: (serviceCents - feeCents) / 100,
  };
}

/** Décomposition d'un prix saisi TTC (mission, déplacement + diagnostic). */
export function priceFromTtc(ttc: number, vatRate: number) {
  const serviceCents = Math.round(ttc * 100);
  return priceFromCents(serviceCents, vatRate === 0 ? serviceCents : Math.round(serviceCents / (1 + vatRate)));
}

/** Montant net perçu par le prestataire pour un prix TTC */
export const computeProviderPayout = (base: number, vatRate = 0): number => priceFromTtc(base, vatRate).payout;

/** Montant tout compris payé par le propriétaire pour un prix TTC */
export const computeOwnerTotal = (base: number, vatRate = 0): number => priceFromTtc(base, vatRate).total;

/** Frais de service Altio payés par le propriétaire pour un prix TTC */
export const computeOwnerFee = (base: number, vatRate = 0): number => priceFromTtc(base, vatRate).fee;
