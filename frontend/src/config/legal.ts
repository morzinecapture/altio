/**
 * Configuration légale centralisée — Altio
 *
 * Toutes les mentions obligatoires (SIREN, TVA, médiateur, DPO…)
 * sont regroupées ici pour éviter les placeholders dispersés.
 *
 * À METTRE À JOUR dès l'immatriculation de la société.
 */

export const LEGAL_CONFIG = {
  // — Identité Altio —
  COMPANY_NAME: 'Altio SAS',
  COMPANY_FORM: 'SAS (Société par Actions Simplifiée)',
  COMPANY_SIREN: 'XXX_SIREN_XXX', // TODO: renseigner après immatriculation
  COMPANY_SIRET: 'XXX_SIRET_XXX', // TODO: renseigner après immatriculation
  COMPANY_RCS: 'XXX_RCS_XXX', // TODO: confirmer ville du greffe
  COMPANY_TVA: 'XXX_TVA_INTRACOM_XXX', // TODO: renseigner après immatriculation
  COMPANY_CAPITAL: 'XXX_CAPITAL_XXX', // TODO: confirmer capital social
  COMPANY_ADDRESS: 'Morzine, 74110 Haute-Savoie, France',
  COMPANY_EMAIL: 'contact@altio.app',
  COMPANY_PHONE: '', // TODO: renseigner

  // — DPO / RGPD —
  DPO_EMAIL: 'dpo@altio.app',
  DPO_ADDRESS: 'Altio SAS — Morzine, 74110 Haute-Savoie, France',

  // — Médiateur de la consommation —
  // Obligation loi Hamon 2016 — art. L.612-1 Code conso.
  // Sanction si absent : 15 000 € (société)
  MEDIATOR_NAME: 'CMAP — Centre de Médiation et d\'Arbitrage de Paris', // TODO: confirmer le médiateur choisi
  MEDIATOR_ADDRESS: '39 avenue Franklin D. Roosevelt, 75008 Paris',
  MEDIATOR_URL: 'https://www.cmap.fr',
  MEDIATOR_EMAIL: 'consommation@cmap.fr',

  // — Plateforme ODR européenne —
  ODR_URL: 'https://ec.europa.eu/consumers/odr',

  // — Commission —
  COMMISSION_OWNER_PCT: 10,
  COMMISSION_PROVIDER_PCT: 10,
  VAT_RATE_DEFAULT: 20,

  // — Liens administratifs (obligation art. 242 bis CGI) —
  URL_IMPOTS: 'https://www.impots.gouv.fr',
  URL_URSSAF: 'https://www.urssaf.fr',
  URL_CNIL: 'https://www.cnil.fr',

  // — Archivage —
  RETENTION_INVOICES_YEARS: 10,
  RETENTION_QUOTES_YEARS: 5,
  RETENTION_LOGS_YEARS: 5,
  RETENTION_DELETED_ACCOUNT_DAYS: 30,
} as const;

/**
 * Vérifie que les identifiants société sont configurés (pas les placeholders)
 */
export function isCompanyRegistered(): boolean {
  return (
    LEGAL_CONFIG.COMPANY_SIREN !== 'XXX_SIREN_XXX' &&
    LEGAL_CONFIG.COMPANY_TVA !== 'XXX_TVA_INTRACOM_XXX'
  );
}
