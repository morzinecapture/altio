import { completionInvoiceAmounts } from '../_shared/completion-invoices.ts'
import { assertConnectIntent } from '../_shared/connect-split.ts'
import { missionInvoiceAmounts } from '../_shared/mission-invoice-amounts.ts'
import { HT_PRICING_VERSION, htPricing } from '../_shared/billing.ts'
import { requireLegalEntity } from '../_shared/legal-entity.ts'
import { escapeDocumentText, escapePartyFields } from '../_shared/document-text.ts'
import Stripe from 'npm:stripe@^14.0.0'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getFrenchServiceLabel } from '../_shared/serviceLabels.ts'
import { assertUUID, assertOneOf, assertOptionalString, ValidationError } from '../_shared/validate.ts'
import { requireAuthOrServiceKey } from '../_shared/auth.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, isServiceCall } = await requireAuthOrServiceKey(req)

    const supabaseUrl     = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    const reqBody = await req.json()

    // ── Input validation ──
    const missionId = reqBody.missionId ? assertUUID(reqBody.missionId, 'missionId') : undefined
    const emergencyId = reqBody.emergencyId ? assertUUID(reqBody.emergencyId, 'emergencyId') : undefined
    const interventionId = reqBody.interventionId ? assertUUID(reqBody.interventionId, 'interventionId') : undefined
    if ([missionId, emergencyId, interventionId].filter(Boolean).length !== 1) {
      throw new ValidationError('missionId, emergencyId or interventionId is required')
    }
    const invoiceType = assertOneOf(reqBody.invoiceType, 'invoiceType', ['service', 'displacement', 'service_fee', 'commission'] as const)
    const isMandateInvoice = invoiceType === 'service' || invoiceType === 'displacement'
    let stripePaymentIntentId = assertOptionalString(reqBody.stripePaymentIntentId, 'stripePaymentIntentId')

    // Check source ownership before using the privileged database client for documents.
    const sourceTable = missionId ? 'missions' : emergencyId ? 'emergency_requests' : 'interventions'
    const sourceRef = missionId || emergencyId || interventionId
    const { data: authorizedSource, error: sourceError } = await db.from(sourceTable).select('*').eq('id', sourceRef).single()
    if (sourceError || !authorizedSource) throw new ValidationError('Source de facture introuvable')
    if (!isServiceCall && user?.id !== authorizedSource.owner_id && user?.id !== (authorizedSource.assigned_provider_id || authorizedSource.accepted_provider_id)) {
      return new Response(JSON.stringify({ error: 'Accès interdit' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const completionStepId = reqBody.completionStepId ? assertUUID(reqBody.completionStepId, 'completionStepId') : undefined
    let completionStep: any = null
    let completionPayment: any = null
    let completionSource: any = null
    let verifiedPayment: any = null
    if (completionStepId) {
      if (!emergencyId) throw new ValidationError('Une étape nécessite une intervention')
      const { data: step, error } = await db.from('emergency_completion_steps').select('*').eq('id', completionStepId).single()
      if (error || !step || step.emergency_id !== emergencyId || !step.paid_at ||
          step.owner_id !== authorizedSource.owner_id || step.provider_id !== authorizedSource.accepted_provider_id ||
          (stripePaymentIntentId && stripePaymentIntentId !== step.payment_intent_id)) throw new ValidationError('Étape payée introuvable')
      completionStep = step
      stripePaymentIntentId = step.payment_intent_id
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2022-11-15', httpClient: Stripe.createFetchHttpClient() })
      completionPayment = await stripe.paymentIntents.retrieve(step.payment_intent_id)
      const { data: payee, error: payeeError } = await db.from('provider_profiles').select('stripe_account_id').eq('provider_id', step.provider_id).single()
      if (payeeError) throw payeeError
      assertConnectIntent(completionPayment, payee?.stripe_account_id)
      const { data: source, error: orderError } = await db.from(step.phase === 'visit' ? 'emergency_bids' : 'mission_quotes')
        .select('*').eq('id', step.phase === 'visit' ? completionPayment.metadata.bidId : completionPayment.metadata.quoteId).single()
      if (orderError || !source) throw new ValidationError('Prestation facturable introuvable')
      completionSource = source
    } else {
      if (emergencyId) {
        const { data: steps, error } = await db.from('emergency_completion_steps').select('id').eq('emergency_id', emergencyId).limit(1)
        if (error) throw error
        if (steps?.length) throw new ValidationError('Facturation par étape requise pour cette intervention')
      }
      // Neither a service call nor a client may issue an unpaid invoice.
      if (!['paid', 'completed'].includes(authorizedSource.status) && invoiceType !== 'displacement') throw new ValidationError('Paiement non confirmé pour cette facture')
      let recordedPayment = missionId
        ? authorizedSource.stripe_payment_intent_id || authorizedSource.payment_intent_id
        : invoiceType === 'displacement'
          ? authorizedSource.displacement_payment_id || authorizedSource.phase1_payment_id
          : authorizedSource.quote_payment_id || authorizedSource.stripe_payment_intent_id
      if (!recordedPayment && emergencyId && invoiceType !== 'displacement' && authorizedSource.status === 'completed') {
        const { data: quotes, error } = await db.from('mission_quotes').select('id').eq('emergency_request_id', emergencyId).eq('status', 'accepted').limit(1)
        if (error || !quotes) throw new ValidationError('Vérification du devis indisponible')
        if (quotes.length === 0) recordedPayment = authorizedSource.displacement_payment_id
      }
      if (!recordedPayment || (stripePaymentIntentId && stripePaymentIntentId !== recordedPayment)) throw new ValidationError('Référence de paiement non confirmée')
      stripePaymentIntentId = recordedPayment
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2022-11-15', httpClient: Stripe.createFetchHttpClient() })
      const payment = await stripe.paymentIntents.retrieve(recordedPayment)
      verifiedPayment = payment
      const metadataKey = missionId ? 'missionId' : emergencyId ? 'emergencyId' : 'interventionId'
      if (payment.status !== 'succeeded' || payment.metadata[metadataKey] !== sourceRef || payment.currency !== 'eur') throw new ValidationError('Encaissement non confirmé')
    }

    // ── 0. Dedup: skip if invoice already exists for this source + type ────────
    const dedupQuery = db.from('invoices').select('id').eq('invoice_type', invoiceType)
    if (completionStepId) dedupQuery.eq('completion_step_id', completionStepId)
    else dedupQuery.is('completion_step_id', null)
    if (missionId)   dedupQuery.eq('mission_id', missionId)
    if (emergencyId) dedupQuery.eq('emergency_id', emergencyId)
    if (interventionId) dedupQuery.eq('intervention_id', interventionId)
    const { data: existing, error: dedupError } = await dedupQuery.limit(1)
    if (dedupError) throw dedupError
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, message: 'Invoice already exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // ── 1. Fetch mission OR emergency + parties ────────────────────────────────
    interface InvoiceParty {
      id?: string;
      name?: string;
      email?: string;
      company_name?: string;
      siren?: string;
      siret?: string;
      vat_number?: string;
      billing_address?: string;
      address?: string;
      is_vat_exempt?: boolean;
      mandate_accepted_at?: string;
      is_auto_entrepreneur?: boolean;
      insurance_name?: string;
      insurance_policy?: string;
      qualifications?: string;
    }
    let owner: InvoiceParty | null, provider: InvoiceParty | null, amount: number, propertyName: string, propertyAddress: string, serviceType: string, sourceId: string, serviceDate: string, sourceKind: 'mission' | 'emergency' | 'intervention'

    if (missionId) {
      const { data: mission, error: mErr } = await db
        .from('missions')
        .select('*, property:properties(name, address), owner:users!missions_owner_id_fkey(*), provider:users!missions_assigned_provider_id_fkey(*)')
        .eq('id', missionId)
        .single()
      if (mErr || !mission) throw new Error('Mission not found')

      owner    = mission.owner
      provider = mission.provider
      amount   = Number(mission.fixed_rate ?? 0)
      propertyName    = mission.property?.name || '\u2014'
      propertyAddress = mission.property?.address || ''
      serviceType     = getFrenchServiceLabel(mission.mission_type, mission.services)
      serviceDate     = mission.completed_at ? new Date(mission.completed_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
      sourceId        = missionId
      sourceKind      = 'mission'
    } else if (emergencyId) {
      const { data: emergency, error: eErr } = await db
        .from('emergency_requests')
        .select('*, property:properties(name, address), owner:users!emergency_requests_owner_id_fkey(*), provider:users!emergency_requests_accepted_provider_id_fkey(*)')
        .eq('id', emergencyId)
        .single()
      if (eErr || !emergency) throw new Error('Emergency not found')

      const { data: quote } = await db
        .from('mission_quotes')
        .select('repair_cost')
        .eq('emergency_request_id', emergencyId)
        .eq('status', 'accepted')
        .single()

      owner    = emergency.owner
      provider = emergency.provider
      const displacementAmount = (Number(emergency.displacement_fee ?? 0)) + (Number(emergency.diagnostic_fee ?? 0))
      amount   = invoiceType === 'displacement'
        ? displacementAmount
        : displacementAmount + (Number(quote?.repair_cost ?? 0))
      propertyName    = emergency.property?.name || '\u2014'
      propertyAddress = emergency.property?.address || ''
      serviceType     = getFrenchServiceLabel(emergency.service_type || 'emergency')
      serviceDate     = emergency.completed_at ? new Date(emergency.completed_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
      sourceId        = emergencyId
      sourceKind      = 'emergency'
    } else {
      const { data: intervention, error: iErr } = await db
        .from('interventions')
        .select('*')
        .eq('id', interventionId)
        .single()
      if (iErr || !intervention) throw new Error('Intervention not found')

      const { data: ownerRow } = await db
        .from('users')
        .select('*')
        .eq('id', intervention.owner_id)
        .single()
      const { data: providerRow } = intervention.assigned_provider_id
        ? await db
          .from('users')
          .select('*')
          .eq('id', intervention.assigned_provider_id)
          .single()
        : { data: null }
      const { data: property } = intervention.property_id
        ? await db
          .from('properties')
          .select('name, address')
          .eq('id', intervention.property_id)
          .single()
        : { data: null }

      owner    = ownerRow
      provider = providerRow
      const visitAmount = Number(intervention.displacement_fee ?? 0) + Number(intervention.first_hour_fee ?? intervention.diagnostic_fee ?? 0)
      const serviceAmount = Number(intervention.quote_amount ?? 0) > 0
        ? Number(intervention.quote_amount)
        : Number(intervention.final_amount ?? intervention.fixed_price ?? 0)
      amount = invoiceType === 'displacement' ? visitAmount : serviceAmount
      propertyName    = property?.name || '\u2014'
      propertyAddress = property?.address || ''
      serviceType     = getFrenchServiceLabel(intervention.service_type || intervention.mission_type || 'intervention')
      serviceDate     = (intervention.paid_at || intervention.validated_at || intervention.completed_at || intervention.on_site_at)
        ? new Date(intervention.paid_at || intervention.validated_at || intervention.completed_at || intervention.on_site_at).toLocaleDateString('fr-FR')
        : new Date().toLocaleDateString('fr-FR')
      sourceId        = interventionId as string
      sourceKind      = 'intervention'
    }

    const originalOwner = owner
    const originalProvider = provider
    owner = escapePartyFields(owner)
    provider = escapePartyFields(provider)
    propertyName = escapeDocumentText(propertyName)
    propertyAddress = escapeDocumentText(propertyAddress)
    serviceType = escapeDocumentText(serviceType)

    if (!owner?.id && invoiceType !== 'commission') throw new Error('Owner not found')
    if (!provider?.id && invoiceType !== 'service_fee') throw new Error('Provider not found')
    if (isMandateInvoice && !provider?.mandate_accepted_at) throw new Error('Mandat de facturation non accepté par le prestataire')

    const legalEntity = requireLegalEntity((key) => Deno.env.get(key), { requireMediator: false })
    // ── 2. Determine seller / buyer / amounts ──────────────────────────────────
    const COMMISSION_RATE = 0.10
    let sellerId: string, buyerId: string
    let amountHt: number, vatRate: number, amountTtc: number, vatExempt: boolean

    if (invoiceType === 'commission') {
      // Commission = 10% TTC du montant de la prestation (calcul inverse TVA)
      sellerId  = null as unknown as string
      buyerId   = provider?.id
      amountTtc = parseFloat((amount * COMMISSION_RATE).toFixed(2))
      vatExempt = false
      vatRate   = 20
      amountHt  = parseFloat((amountTtc / 1.20).toFixed(2))
    } else if (invoiceType === 'service_fee') {
      // Commission = 10% TTC du montant de la prestation (calcul inverse TVA)
      sellerId  = null as unknown as string
      buyerId   = owner?.id
      amountTtc = parseFloat((amount * 0.10).toFixed(2))
      vatExempt = false
      vatRate   = 20
      amountHt  = parseFloat((amountTtc / 1.20).toFixed(2))
    } else {
      // service invoice: provider → owner (via mandat)
      sellerId  = provider?.id
      buyerId   = owner?.id
      vatExempt = provider?.is_vat_exempt === true
      amountHt  = amount
      vatRate   = vatExempt ? 0 : 20
      amountTtc = vatExempt ? amountHt : parseFloat((amountHt * 1.20).toFixed(2))
    }

    if (sourceKind === 'mission') {
      let invoiceVatExempt = provider?.is_vat_exempt === true
      let invoiceVatRate = 20
      let quoteHtCents: number | undefined
      if (verifiedPayment?.metadata?.quoteId) {
        const { data: quote, error: quoteError } = await db.from('mission_quotes').select('*, line_items:quote_line_items(*)').eq('id', verifiedPayment.metadata.quoteId).single()
        if (quoteError || !quote || quote.mission_id !== missionId || quote.provider_id !== provider?.id || quote.status !== 'accepted') throw new Error('Devis facturé introuvable')
        const subtotal = quote.line_items?.length ? quote.line_items.reduce((sum: number, line: any) => sum + Number(line.quantity ?? 1) * Number(line.unit_price_ht ?? line.unit_price), 0) : Number(quote.repair_cost)
        const vat = quote.is_vat_exempt === true ? 0 : Number(quote.tva_rate ?? 0.20)
        if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(vat) || vat < 0 || vat > 1) throw new Error('Montants du devis invalides')
        quoteHtCents = Math.round(subtotal * 100)
        const serviceCents = quoteHtCents + Math.round(subtotal * vat * 100)
        const charged = verifiedPayment.metadata?.pricingVersion === HT_PRICING_VERSION ? htPricing(serviceCents, quoteHtCents).amount : serviceCents + Math.round(serviceCents * 0.10)
        if (charged !== verifiedPayment.amount_received) throw new Error('Devis et encaissement incohérents')
        amount = serviceCents / 100
        invoiceVatExempt = vat === 0
        invoiceVatRate = vat * 100
      }
      const amounts = missionInvoiceAmounts(amount, invoiceType,
        invoiceVatExempt, verifiedPayment?.amount_received, verifiedPayment?.application_fee_amount, invoiceVatRate, quoteHtCents)
      amountHt = amounts.amountHt
      amountTtc = amounts.amountTtc
      vatRate = amounts.vatRate
      vatExempt = amounts.vatExempt
    }

    if (completionStep) {
      const amounts = completionInvoiceAmounts(completionStep, completionPayment, completionSource, invoiceType, provider?.is_vat_exempt === true)
      ;({ amountHt, amountTtc, vatRate, vatExempt } = amounts)
      serviceDate = new Date(completionStep.declared_at).toLocaleDateString('fr-FR')
    }

    // Altio's own VAT regime is independent from the provider's legal form.
    if (invoiceType === 'commission' || invoiceType === 'service_fee') {
      vatExempt = legalEntity.vatExempt
      vatRate = vatExempt ? 0 : 20
      amountHt = vatExempt ? amountTtc : Math.round(amountTtc * 100 / 1.2) / 100
    }

    // ── 3. Invoice numbering — 3 separate sequences ───────────────────────────
    const year = new Date().getFullYear()
    let invoiceNumber: string

    const sequence = isMandateInvoice
      ? await db.rpc('next_mandate_invoice_number', { p_provider_id: provider.id, p_year: year }).single()
      : await db.rpc('nextval', { seq: invoiceType === 'service_fee' ? 'invoice_seq_prop' : 'invoice_seq_prest' }).single()
    const sequenceValue = Number(sequence.data)
    if (sequence.error || !Number.isSafeInteger(sequenceValue) || sequenceValue < 1) throw new Error('Numérotation des factures indisponible')
    const prefix = isMandateInvoice
      ? `MAN-${(provider?.siren || provider?.siret || provider.id.substring(0, 8)).replace(/\s/g, '').slice(0, 9)}`
      : invoiceType === 'service_fee' ? 'ALTIO-PROP' : 'ALTIO-PREST'
    invoiceNumber = `${prefix}-${year}-${String(sequenceValue).padStart(4, '0')}`

    // ── 4. Generate HTML invoice ─────────────────────────────────────────────
    const emissionDate = new Date().toLocaleDateString('fr-FR')
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')

    const altioName = escapeDocumentText(legalEntity.name)
    const altioForm = escapeDocumentText(legalEntity.form)
    const altioSiren = legalEntity.siren
    const altioSiret = legalEntity.siret
    const altioVat = escapeDocumentText(legalEntity.vat)
    const altioRcs = escapeDocumentText(legalEntity.rcs)
    const altioAddress = escapeDocumentText(legalEntity.address)
    const altioCapital = escapeDocumentText(legalEntity.capital)
    const altioInfo = {
      name: altioName,
      siren: altioSiren,
      siret: altioSiret,
      vat_number: altioVat,
      billing_address: altioAddress,
      company_name: altioName,
      rcs: altioRcs,
      capital: altioCapital,
    }

    const sellerUser = (invoiceType === 'commission' || invoiceType === 'service_fee') ? altioInfo : (provider ?? {})
    const buyerUser  = invoiceType === 'commission' ? (provider ?? {}) : (owner ?? {})
    const sourceLabel = sourceKind === 'mission' ? 'Mission' : sourceKind === 'emergency' ? 'Urgence' : 'Intervention'

    // Provider info for F1 mandate mention
    const providerName = provider?.company_name || provider?.name || 'Prestataire'
    const providerSiren = provider?.siren || 'N/A'
    const providerSiret = provider?.siret || provider?.siren || 'N/A'

    const vatLine = vatExempt
      ? `<tr><td colspan="2" style="color:#6B7280;font-size:12px;padding:4px 0">TVA non applicable, art. 293 B du CGI</td></tr>`
      : `<tr><td style="color:#6B7280">TVA (${vatRate}%)</td><td style="text-align:right">${(amountTtc - amountHt).toFixed(2)} \u20AC</td></tr>`

    // Description line per invoice type
    const descriptionLine = invoiceType === 'commission'
      ? `Commission de service plateforme Altio (${COMMISSION_RATE * 100}%)`
      : invoiceType === 'service_fee'
        ? `Frais de mise en relation et service plateforme Altio (${COMMISSION_RATE * 100}%)`
        : invoiceType === 'displacement'
          ? `Déplacement et diagnostic \u2014 ${sourceLabel} n\u00B0${sourceId.substring(0, 8)}`
          : `Prestation de ${serviceType} \u2014 ${sourceLabel} n\u00B0${sourceId.substring(0, 8)}`

    // Badge label
    const badgeLabel = invoiceType === 'commission'
      ? 'Commission plateforme'
      : invoiceType === 'service_fee'
        ? 'Frais de service'
        : invoiceType === 'displacement'
          ? 'Déplacement et diagnostic (mandat)'
          : 'Prestation de service (mandat)'

    // Seller detail block
    const sellerDetailHtml = (() => {
      if (isMandateInvoice) {
        // F1: Provider is seller (via mandate), show full provider info
        return `
          <div class="party-name">${providerName}</div>
          <div class="party-detail">
            ${provider?.siret ? `SIRET : ${provider.siret}<br>` : provider?.siren ? `SIREN : ${provider.siren}<br>` : ''}
            ${provider?.vat_number ? `N\u00B0 TVA : ${provider.vat_number}<br>` : ''}
            ${provider?.billing_address || provider?.address || ''}<br>
            ${provider?.insurance_name ? `Assurance : ${provider.insurance_name}<br>` : ''}
            ${provider?.insurance_policy ? `Police n\u00B0 ${provider.insurance_policy}<br>` : ''}
            ${provider?.qualifications ? `Qualifications : ${provider.qualifications}<br>` : ''}
            ${provider?.is_auto_entrepreneur ? '<em>Entrepreneur individuel</em><br>' : ''}
          </div>`
      }
      // F2/F3: Altio is seller
      return `
        <div class="party-name">${altioName}</div>
        <div class="party-detail">
          ${altioForm}${altioCapital ? ` — capital : ${altioCapital} €` : ''}<br>
          SIREN : ${altioSiren}<br>
          SIRET : ${altioSiret}<br>
          ${altioRcs}<br>
          ${altioVat ? `N° TVA : ${altioVat}<br>` : ''}
          ${altioAddress}
        </div>`
    })()

    // Buyer detail block
    const buyerDetailHtml = (() => {
      const u = buyerUser
      return `
        <div class="party-name">${u.company_name || u.name || 'N/A'}</div>
        <div class="party-detail">
          ${u.siret ? `SIRET : ${u.siret}<br>` : u.siren ? `SIREN : ${u.siren}<br>` : ''}
          ${u.vat_number ? `N\u00B0 TVA : ${u.vat_number}<br>` : ''}
          ${u.billing_address || u.address || u.email || ''}
        </div>`
    })()

    // Legal footer — mandate mention only on F1
    const mandateMention = isMandateInvoice
      ? `<br><em>Facture émise par ${altioName} (SIREN : ${altioSiren}) au nom et pour le compte de ${providerName} (SIREN : ${providerSiren}) en vertu d'un mandat de facturation (art. 289-I-2 du CGI).</em><br>`
      : ''

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Facture ${invoiceNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#1E293B; background:#fff; padding:40px; max-width:800px; margin:0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; padding-bottom:20px; border-bottom:2px solid #2563EB; }
  .brand { font-size:24px; font-weight:700; color:#2563EB; }
  .brand-sub { font-size:12px; color:#64748B; margin-top:4px; }
  .invoice-meta { text-align:right; }
  .invoice-num { font-size:18px; font-weight:700; color:#1E293B; }
  .invoice-date { font-size:12px; color:#64748B; margin-top:4px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:32px; }
  .party-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#64748B; margin-bottom:8px; }
  .party-name { font-size:15px; font-weight:700; color:#1E293B; }
  .party-detail { font-size:12px; color:#64748B; margin-top:4px; line-height:1.6; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#F1F5F9; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; }
  td { padding:12px; border-bottom:1px solid #E2E8F0; font-size:13px; }
  .totals { margin-left:auto; width:280px; }
  .totals tr td { padding:6px 0; font-size:13px; border:none; }
  .total-ttc td { font-weight:700; font-size:16px; color:#1E293B; padding-top:10px; border-top:2px solid #E2E8F0; }
  .legal { margin-top:40px; padding-top:20px; border-top:1px solid #E2E8F0; font-size:11px; color:#94A3B8; line-height:1.8; }
  .badge { display:inline-block; background:#EFF6FF; color:#2563EB; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
  @media print { body { padding:20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">\u2B1B Altio</div>
      <div class="brand-sub">Plateforme de gestion de locations saisonni\u00E8res<br>${escapeDocumentText(legalEntity.email)}</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-num">FACTURE ${invoiceNumber}</div>
      <div class="invoice-date">\u00C9mission : ${emissionDate}</div>
      <div class="invoice-date">R\u00E9alisation : ${serviceDate}</div>
      <div class="invoice-date">\u00C9ch\u00E9ance : ${dueDate}</div>
      <div style="margin-top:8px"><span class="badge">${badgeLabel}</span></div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">${isMandateInvoice ? '\u00C9metteur (prestataire)' : '\u00C9metteur'}</div>
      ${sellerDetailHtml}
    </div>
    <div>
      <div class="party-label">Destinataire</div>
      ${buyerDetailHtml}
    </div>
  </div>

  ${(() => {
    const lieuExecution = isMandateInvoice ? propertyAddress : altioAddress
    return lieuExecution ? `<div style="margin-bottom:24px;font-size:12px;color:#64748B">
    <strong>Lieu d'ex\u00E9cution de la prestation :</strong> ${lieuExecution}
  </div>` : ''
  })()}

  ${!isMandateInvoice ? `<div style="margin-bottom:16px;font-size:12px;color:#64748B">
    <strong>R\u00E9f. prestation :</strong> ${sourceLabel} n\u00B0${sourceId.substring(0, 8)}
  </div>` : ''}

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Logement</th>
        <th style="text-align:right">Montant HT</th>
        <th style="text-align:right">TVA</th>
        <th style="text-align:right">Montant TTC</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${descriptionLine}</td>
        <td>${propertyName}</td>
        <td style="text-align:right">${amountHt.toFixed(2)} \u20AC</td>
        <td style="text-align:right">${vatExempt ? '0 %' : `${vatRate} %`}</td>
        <td style="text-align:right">${amountTtc.toFixed(2)} \u20AC</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Sous-total HT</td><td style="text-align:right">${amountHt.toFixed(2)} \u20AC</td></tr>
    ${vatLine}
    <tr class="total-ttc"><td>TOTAL TTC</td><td style="text-align:right">${amountTtc.toFixed(2)} \u20AC</td></tr>
  </table>

  <div class="legal">
    <strong>Conditions de r\u00E8glement :</strong> Paiement \u00E0 30 jours \u00E0 compter de la date d'\u00E9mission.<br>
    Pas d'escompte pour paiement anticip\u00E9.<br>
    Clients professionnels uniquement : pénalités de retard au taux de 3 fois le taux d'intérêt légal et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Non applicables aux consommateurs.<br>
    ${vatExempt ? '<br><em>TVA non applicable, art. 293 B du CGI.</em><br>' : ''}
    ${mandateMention}
    <br><strong>Cat\u00E9gorie de l'op\u00E9ration :</strong> Prestation de services<br>
    <strong>Option TVA sur les d\u00E9bits :</strong> Non applicable (TVA sur encaissements)<br>
    ${altioName} — ${altioAddress} — SIREN : ${altioSiren} — ${altioRcs} ${altioVat ? `— TVA : ${altioVat}` : ''} — ${escapeDocumentText(legalEntity.email)}<br>
    ${legalEntity.mediatorName && legalEntity.mediatorAddress && legalEntity.mediatorUrl ? `Médiateur Altio : ${escapeDocumentText(legalEntity.mediatorName)} — ${escapeDocumentText(legalEntity.mediatorAddress)} — ${escapeDocumentText(legalEntity.mediatorUrl)}` : ''}
  </div>
</body>
</html>`

    // ── 4b. Generate Factur-X XML (EN 16931) ──────────────────────────────────
    const issueDateYYYYMMDD = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const dueDateYYYYMMDD   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                .toISOString().slice(0, 10).replace(/-/g, '')

    const sellerName = sellerUser.company_name || sellerUser.name || 'N/A'
    const sellerVat  = sellerUser.vat_number || 'FR00000000000'
    const buyerName  = buyerUser.company_name || buyerUser.name || 'N/A'

    const vatAmount       = parseFloat((amountTtc - amountHt).toFixed(2))
    const vatCategoryCode = vatExempt ? 'E' : 'S'
    const vatRateValue    = vatExempt ? '0' : String(vatRate)

    const facturXml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${invoiceNumber}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDateYYYYMMDD}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>1</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${descriptionLine}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${amountHt.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${vatCategoryCode}</ram:CategoryCode>
          <ram:RateApplicablePercent>${vatRateValue}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${amountHt.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>

    <ram:ApplicableHeaderTradeAgreement>${!isMandateInvoice ? `
      <ram:BuyerReference>${sourceLabel}-${sourceId.substring(0, 8)}</ram:BuyerReference>` : ''}
      <ram:SellerTradeParty>
        <ram:Name>${sellerName}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${sellerVat}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${buyerName}</ram:Name>${buyerUser.siren ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${buyerUser.siren}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>${propertyAddress ? `
      <ram:ShipToTradeParty>
        <ram:Name>${propertyName}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${propertyAddress}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:ShipToTradeParty>` : ''}
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${vatAmount.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${amountHt.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${vatCategoryCode}</ram:CategoryCode>
        <ram:RateApplicablePercent>${vatRateValue}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDateYYYYMMDD}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amountHt.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amountHt.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${vatAmount.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amountTtc.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amountTtc.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`

    // ── 5. Store HTML in Supabase Storage ─────────────────────────────────────
    const fileName = `${year}/${invoiceNumber}.html`
    const { error: uploadErr } = await db.storage
      .from('invoices')
      .upload(fileName, new TextEncoder().encode(html), {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      })
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    // ── 5b. Store Factur-X XML ───────────────────────────────────────────────
    const xmlFileName = `${year}/${invoiceNumber}.xml`
    const { error: xmlUploadErr } = await db.storage
      .from('invoices')
      .upload(xmlFileName, new TextEncoder().encode(facturXml), {
        contentType: 'application/xml',
        upsert: true,
      })
    if (xmlUploadErr) throw new Error(`Factur-X XML upload failed: ${xmlUploadErr.message}`)

    // ── 6. Insert invoice record ─────────────────────────────────────────────
    let invoiceInsertPayload: Record<string, unknown> = {
      completion_step_id: completionStepId ?? null,
      invoice_number:  invoiceNumber,
      mission_id:      missionId ?? null,
      emergency_id:    emergencyId ?? null,
      intervention_id: interventionId ?? null,
      invoice_type:    invoiceType,
      amount_ht:       amountHt,
      amount_ttc:      amountTtc,
      vat_rate:        vatRate,
      seller_id:       sellerId,
      buyer_id:        buyerId,
      pdf_url:         fileName,
      stripe_pi_id:    stripePaymentIntentId ?? null,
      status:          'issued',
      facturx_url:     xmlFileName,
    }

    const { data: invoice, error: insertErr } = await db.rpc('insert_invoice_with_parties', {
      p_invoice: invoiceInsertPayload,
      p_seller: sellerId ? originalProvider : null,
      p_buyer: invoiceType === 'commission' ? originalProvider : originalOwner,
    })
    if (insertErr?.code === '23505') {
      // A concurrent webhook/worker may have won. Never drop source columns to retry.
      const duplicate = db.from('invoices').select('id').eq('invoice_type', invoiceType)
      if (completionStepId) duplicate.eq('completion_step_id', completionStepId)
      else { duplicate.is('completion_step_id', null); duplicate.eq(missionId ? 'mission_id' : emergencyId ? 'emergency_id' : 'intervention_id', sourceRef) }
      const { data: winner, error } = await duplicate.maybeSingle()
      if (!error && winner) return new Response(JSON.stringify({ ok: true, skipped: true, invoice: winner }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (insertErr) throw new Error(`Invoice insert failed: ${insertErr.message}`)
    if (!invoice?.id) throw new Error('Invoice insert returned no document')

    return new Response(
      JSON.stringify({ success: true, invoice, facturx_url: xmlFileName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    const msg = error instanceof Error ? error.message : String(error)
    const isAuthError = /authorization|token|invalid|expired/i.test(msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: isAuthError ? 401 : 400 }
    )
  }
})
