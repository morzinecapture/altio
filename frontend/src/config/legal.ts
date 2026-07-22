/**
 * Configuration légale centralisée — Altio
 *
 * Toutes les mentions obligatoires (SIREN, TVA, médiateur, DPO…)
 * sont regroupées ici pour éviter les placeholders dispersés.
 *
 * Les identifiants officiels sont injectés via EXPO_PUBLIC_ALTIO_*.
 */

const configured = (value: string | undefined, fallback = ''): string => value ?? fallback;

export const LEGAL_CONFIG = {
  // — Identité Altio —
  COMPANY_NAME: configured(process.env.EXPO_PUBLIC_ALTIO_COMPANY_NAME, 'Altio SAS'),
  COMPANY_FORM: configured(process.env.EXPO_PUBLIC_ALTIO_COMPANY_FORM, 'SAS (Société par Actions Simplifiée)'),
  COMPANY_SIREN: configured(process.env.EXPO_PUBLIC_ALTIO_SIREN),
  COMPANY_SIRET: configured(process.env.EXPO_PUBLIC_ALTIO_SIRET),
  COMPANY_RCS: configured(process.env.EXPO_PUBLIC_ALTIO_RCS),
  COMPANY_TVA: configured(process.env.EXPO_PUBLIC_ALTIO_TVA),
  COMPANY_CAPITAL: configured(process.env.EXPO_PUBLIC_ALTIO_CAPITAL),
  COMPANY_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_ADDRESS, 'Morzine, 74110 Haute-Savoie, France'),
  COMPANY_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_EMAIL, 'contact@altio.app'),
  COMPANY_PHONE: configured(process.env.EXPO_PUBLIC_ALTIO_PHONE),

  // — DPO / RGPD —
  DPO_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_DPO_EMAIL, 'dpo@altio.app'),
  DPO_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_DPO_ADDRESS, 'Altio SAS — Morzine, 74110 Haute-Savoie, France'),

  // — Médiateur de la consommation —
  // Obligation loi Hamon 2016 — art. L.612-1 Code conso.
  // Sanction si absent : 15 000 € (société)
  MEDIATOR_NAME: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_NAME, 'CMAP — Centre de Médiation et d\'Arbitrage de Paris'),
  MEDIATOR_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_ADDRESS, '39 avenue Franklin D. Roosevelt, 75008 Paris'),
  MEDIATOR_URL: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_URL, 'https://www.cmap.fr'),
  MEDIATOR_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_EMAIL, 'consommation@cmap.fr'),

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
    LEGAL_CONFIG.COMPANY_SIREN.trim().length > 0 &&
    LEGAL_CONFIG.COMPANY_TVA.trim().length > 0
  );
}
