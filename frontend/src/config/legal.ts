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
  // Identité de l’exploitant confirmée le 08/10/2026 dans l’Annuaire des Entreprises.
  // https://annuaire-entreprises.data.gouv.fr/entreprise/manon-freuchet-freuchet-services-999304736
  // Le champ historique COMPANY_RCS contient ici l’immatriculation au RNE, pas un RCS présumé.
  // — Identité Altio —
  COMPANY_NAME: configured(process.env.EXPO_PUBLIC_ALTIO_COMPANY_NAME, "Manon Freuchet (Freuchet Services)"),
  COMPANY_FORM: configured(process.env.EXPO_PUBLIC_ALTIO_COMPANY_FORM, "Entrepreneur individuel (EI)"),
  COMPANY_SIREN: configured(process.env.EXPO_PUBLIC_ALTIO_SIREN, "999304736"),
  COMPANY_SIRET: configured(process.env.EXPO_PUBLIC_ALTIO_SIRET, "99930473600013"),
  COMPANY_RCS: configured(process.env.EXPO_PUBLIC_ALTIO_RCS, "Immatriculée au RNE sous le numéro 999 304 736"),
  COMPANY_TVA: configured(process.env.EXPO_PUBLIC_ALTIO_TVA),
  COMPANY_VAT_REGIME: configured(process.env.EXPO_PUBLIC_ALTIO_VAT_REGIME, 'franchise'),
  COMPANY_CAPITAL: configured(process.env.EXPO_PUBLIC_ALTIO_CAPITAL),
  COMPANY_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_ADDRESS, "61 chemin de la Vieille Ranche, 74110 Montriond, France"),
  COMPANY_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_EMAIL, 'morzinecapture@gmail.com'),
  COMPANY_PHONE: configured(process.env.EXPO_PUBLIC_ALTIO_PHONE),

  // — DPO / RGPD —
  DPO_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_DPO_EMAIL),
  DPO_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_DPO_ADDRESS),

  // — Médiateur de la consommation —
  // Obligation loi Hamon 2016 — art. L.612-1 Code conso.
  // Sanction si absent : 15 000 € (société)
  MEDIATOR_NAME: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_NAME, 'CM2C — Centre de la Médiation de la Consommation de Conciliateurs de Justice'),
  MEDIATOR_ADDRESS: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_ADDRESS, '49 rue de Ponthieu, 75008 Paris'),
  MEDIATOR_URL: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_URL, 'https://www.cm2c.net/'),
  MEDIATOR_EMAIL: configured(process.env.EXPO_PUBLIC_ALTIO_MEDIATOR_EMAIL),

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
    /^\d{9}$/.test(LEGAL_CONFIG.COMPANY_SIREN.trim()) &&
    /^\d{14}$/.test(LEGAL_CONFIG.COMPANY_SIRET.trim())
  );
}
