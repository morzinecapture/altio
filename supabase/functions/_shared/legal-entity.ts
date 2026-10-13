/** Explicit operator identity. Never infer incorporation, VAT or a mediator contract. */
export function requireLegalEntity(get: (name: string) => string | undefined, options: { requireMediator?: boolean } = {}) {
  const required = (key: string) => {
    const value = get(key)?.trim()
    if (!value) throw new Error(`Configuration légale Altio incomplète : ${key}`)
    return value
  }
  const name = required('ALTIO_COMPANY_NAME')
  const form = required('ALTIO_COMPANY_FORM')
  const siren = required('ALTIO_SIREN')
  const siret = required('ALTIO_SIRET')
  if (!/^\d{9}$/.test(siren) || !/^\d{14}$/.test(siret) || !siret.startsWith(siren)) throw new Error('Identifiants Altio invalides')
  const vatRegime = required('ALTIO_VAT_REGIME')
  if (!['franchise', 'liable'].includes(vatRegime)) throw new Error('Régime TVA Altio invalide')
  // Invoice issuance is independent of the separate launch-readiness mediation check.
  const mediator = (key: string) => options.requireMediator === false ? get(key)?.trim() || '' : required(key)
  return {
    name, form, siren, siret,
    address: required('ALTIO_ADDRESS'),
    email: required('ALTIO_EMAIL'),
    rcs: required('ALTIO_RCS'),
    capital: /^(EI\b|entrepreneur individuel|micro[- ]entrepreneur)/i.test(form) ? '' : get('ALTIO_CAPITAL')?.trim() || '',
    vatExempt: vatRegime === 'franchise',
    vat: vatRegime === 'liable' ? required('ALTIO_TVA_NUMBER') : '',
    mediatorName: mediator('ALTIO_MEDIATOR_NAME'),
    mediatorAddress: mediator('ALTIO_MEDIATOR_ADDRESS'),
    mediatorUrl: mediator('ALTIO_MEDIATOR_URL'),
  }
}
