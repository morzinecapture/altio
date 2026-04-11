/**
 * Constantes de commission Altio — source de vérité unique.
 *
 * Modèle (opaque) :
 *  - Le prestataire touche son tarif diminué de 10 % (commission plateforme)
 *  - Le propriétaire paie le tarif prestataire majoré de 10 % (frais de service)
 *
 * Aucun écran ne doit afficher la commission totale (20 %).
 */

/** Commission prélevée sur chaque partie (propriétaire ET prestataire) */
export const COMMISSION_RATE = 0.10;

/** Le propriétaire paie : base × OWNER_MARKUP_RATE (1.10) */
export const OWNER_MARKUP_RATE = 1 + COMMISSION_RATE;

/** Le prestataire reçoit : base × PROVIDER_PAYOUT_RATE (0.90) */
export const PROVIDER_PAYOUT_RATE = 1 - COMMISSION_RATE;

/** Montant net perçu par le prestataire pour un tarif donné */
export const computeProviderPayout = (base: number): number =>
  Math.round(base * PROVIDER_PAYOUT_RATE * 100) / 100;

/** Montant tout compris payé par le propriétaire pour un tarif donné */
export const computeOwnerTotal = (base: number): number =>
  Math.round(base * OWNER_MARKUP_RATE * 100) / 100;

/** Frais de service Altio payés par le propriétaire pour un tarif donné */
export const computeOwnerFee = (base: number): number =>
  Math.round(base * COMMISSION_RATE * 100) / 100;
