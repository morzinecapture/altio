import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { assertUUID, assertOneOf, assertOptionalString, ValidationError } from '../_shared/validate.ts'
import { requireAuthOrServiceKey } from '../_shared/auth.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { isServiceCall } = await requireAuthOrServiceKey(req)

    const supabaseUrl     = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    const reqBody = await req.json()

    // ── Input validation ──
    const missionId = reqBody.missionId ? assertUUID(reqBody.missionId, 'missionId') : undefined
    const emergencyId = reqBody.emergencyId ? assertUUID(reqBody.emergencyId, 'emergencyId') : undefined
    if (!missionId && !emergencyId) {
      throw new ValidationError('missionId or emergencyId is required')
    }
    const invoiceType = assertOneOf(reqBody.invoiceType, 'invoiceType', ['service', 'service_fee', 'commission'] as const)
    const stripePaymentIntentId = assertOptionalString(reqBody.stripePaymentIntentId, 'stripePaymentIntentId')

    // ── 0. Dedup: skip if invoice already exists for this source + type ────────
    const dedupQuery = db.from('invoices').select('id').eq('invoice_type', invoiceType)
    if (missionId)   dedupQuery.eq('mission_id', missionId)
    if (emergencyId) dedupQuery.eq('emergency_id', emergencyId)
    const { data: existing } = await dedupQuery.limit(1)
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
      is_auto_entrepreneur?: boolean;
      insurance_name?: string;
      insurance_policy?: string;
      qualifications?: string;
    }
    let owner: InvoiceParty | null, provider: InvoiceParty | null, amount: number, propertyName: string, propertyAddress: string, serviceType: string, sourceId: string, serviceDate: string

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
      serviceType     = mission.mission_type || 'service'
      serviceDate     = mission.completed_at ? new Date(mission.completed_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
      sourceId        = missionId
    } else {
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
      amount   = (Number(emergency.displacement_fee ?? 0)) + (Number(emergency.diagnostic_fee ?? 0)) + (Number(quote?.repair_cost ?? 0))
      propertyName    = emergency.property?.name || '\u2014'
      propertyAddress = emergency.property?.address || ''
      serviceType     = emergency.service_type || 'urgence'
      serviceDate     = emergency.completed_at ? new Date(emergency.completed_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
      sourceId        = emergencyId
    }

    if (!owner?.id && invoiceType !== 'commission') throw new Error('Owner not found')
    if (!provider?.id && invoiceType !== 'service_fee') throw new Error('Provider not found')

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
      vatExempt = (provider?.is_vat_exempt ?? false) || (provider?.is_auto_entrepreneur ?? false)
      amountHt  = amount
      vatRate   = vatExempt ? 0 : 20
      amountTtc = vatExempt ? amountHt : parseFloat((amountHt * 1.20).toFixed(2))
    }

    // ── 3. Invoice numbering — 3 separate sequences ───────────────────────────
    const year = new Date().getFullYear()
    let invoiceNumber: string

    if (invoiceType === 'service') {
      // F1 — Mandat: per-provider sequence MAN-[SIRET_SHORT]-YYYY-XXXX
      const providerSiret = provider?.siren || provider?.siret || provider?.id?.substring(0, 8) || 'UNKNOWN'
      const siretShort = providerSiret.replace(/\s/g, '').slice(0, 9)

      // Try the atomic RPC first, fallback to old sequence
      const { data: mandateSeq, error: mandateErr } = await db
        .rpc('next_mandate_invoice_number', { p_provider_id: provider.id, p_year: year })
        .single()

      if (mandateErr) {
        // Fallback: use the old global sequence
        const { data: seqData } = await db.rpc('nextval', { seq: 'invoice_seq' }).single()
        const seq = seqData ?? Date.now()
        invoiceNumber = `MAN-${siretShort}-${year}-${String(seq).padStart(4, '0')}`
      } else {
        invoiceNumber = `MAN-${siretShort}-${year}-${String(mandateSeq).padStart(4, '0')}`
      }
    } else if (invoiceType === 'service_fee') {
      // F2 — Altio → proprio: ALTIO-PROP-YYYY-XXXX
      let seq: number
      try {
        const { data: seqData } = await db.rpc('nextval', { seq: 'invoice_seq_prop' }).single()
        seq = seqData ?? Date.now()
      } catch {
        // Fallback if sequence doesn't exist yet
        const { data: seqData } = await db.rpc('nextval', { seq: 'invoice_seq' }).single()
        seq = seqData ?? Date.now()
      }
      invoiceNumber = `ALTIO-PROP-${year}-${String(seq).padStart(4, '0')}`
    } else {
      // F3 — commission: ALTIO-PREST-YYYY-XXXX
      let seq: number
      try {
        const { data: seqData } = await db.rpc('nextval', { seq: 'invoice_seq_prest' }).single()
        seq = seqData ?? Date.now()
      } catch {
        const { data: seqData } = await db.rpc('nextval', { seq: 'invoice_seq' }).single()
        seq = seqData ?? Date.now()
      }
      invoiceNumber = `ALTIO-PREST-${year}-${String(seq).padStart(4, '0')}`
    }

    // ── 4. Generate HTML invoice ─────────────────────────────────────────────
    const emissionDate = new Date().toLocaleDateString('fr-FR')
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')

    const altioSiren = Deno.env.get('ALTIO_SIREN') || '000000000'
    const altioSiret = Deno.env.get('ALTIO_SIRET') || '00000000000000'
    const altioVat = Deno.env.get('ALTIO_TVA_NUMBER') || 'FR00000000000'
    const altioRcs = Deno.env.get('ALTIO_RCS') || 'RCS Thonon-les-Bains'
    const altioAddress = Deno.env.get('ALTIO_ADDRESS') || 'Morzine, 74110 Haute-Savoie, France'
    const altioCapital = Deno.env.get('ALTIO_CAPITAL') || '1 000'

    if (!Deno.env.get('ALTIO_SIREN') || altioSiren === '000000000')
      console.warn('[generate-invoice] ATTENTION: ALTIO_SIREN non configuré, valeur par défaut utilisée')
    if (!Deno.env.get('ALTIO_SIRET') || altioSiret === '00000000000000')
      console.warn('[generate-invoice] ATTENTION: ALTIO_SIRET non configuré, valeur par défaut utilisée')
    if (!Deno.env.get('ALTIO_TVA_NUMBER') || altioVat === 'FR00000000000')
      console.warn('[generate-invoice] ATTENTION: ALTIO_TVA_NUMBER non configuré, valeur par défaut utilisée')
    const altioInfo = {
      name: 'Altio SAS',
      siren: altioSiren,
      siret: altioSiret,
      vat_number: altioVat,
      billing_address: altioAddress,
      company_name: 'Altio SAS',
      rcs: altioRcs,
      capital: altioCapital,
    }

    const sellerUser = (invoiceType === 'commission' || invoiceType === 'service_fee') ? altioInfo : (provider ?? {})
    const buyerUser  = invoiceType === 'commission' ? (provider ?? {}) : (owner ?? {})

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
        : `Prestation de ${serviceType} \u2014 ${missionId ? `Mission n\u00B0${sourceId.substring(0, 8)}` : `Urgence n\u00B0${sourceId.substring(0, 8)}`}`

    // Badge label
    const badgeLabel = invoiceType === 'commission'
      ? 'Commission plateforme'
      : invoiceType === 'service_fee'
        ? 'Frais de service'
        : 'Prestation de service (mandat)'

    // Seller detail block
    const sellerDetailHtml = (() => {
      if (invoiceType === 'service') {
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
        <div class="party-name">Altio SAS</div>
        <div class="party-detail">
          SAS au capital de ${altioCapital} \u20AC<br>
          SIREN : ${altioSiren}<br>
          SIRET : ${altioSiret}<br>
          ${altioRcs}<br>
          N\u00B0 TVA : ${altioVat}<br>
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
    const mandateMention = invoiceType === 'service'
      ? `<br><em>Facture \u00E9mise par Altio SAS (SIREN : ${altioSiren}) au nom et pour le compte de ${providerName} (SIREN : ${providerSiren}) en vertu d'un mandat de facturation (art. 289-I-2 du CGI).</em><br>`
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
      <div class="brand-sub">Plateforme de gestion de locations saisonni\u00E8res<br>contact@altio.fr</div>
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
      <div class="party-label">${invoiceType === 'service' ? '\u00C9metteur (prestataire)' : '\u00C9metteur'}</div>
      ${sellerDetailHtml}
    </div>
    <div>
      <div class="party-label">Destinataire</div>
      ${buyerDetailHtml}
    </div>
  </div>

  ${(() => {
    const lieuExecution = invoiceType === 'service' ? propertyAddress : altioAddress
    return lieuExecution ? `<div style="margin-bottom:24px;font-size:12px;color:#64748B">
    <strong>Lieu d'ex\u00E9cution de la prestation :</strong> ${lieuExecution}
  </div>` : ''
  })()}

  ${invoiceType !== 'service' ? `<div style="margin-bottom:16px;font-size:12px;color:#64748B">
    <strong>R\u00E9f. prestation :</strong> ${missionId ? `Mission n\u00B0${sourceId.substring(0, 8)}` : `Urgence n\u00B0${sourceId.substring(0, 8)}`}
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
    En cas de retard de paiement, des p\u00E9nalit\u00E9s de retard seront appliqu\u00E9es au taux de 3 fois le taux d'int\u00E9r\u00EAt l\u00E9gal en vigueur (art. L441-10 du Code de commerce).<br>
    Indemnit\u00E9 forfaitaire pour frais de recouvrement en cas de retard : 40 \u20AC.<br>
    ${vatExempt ? '<br><em>TVA non applicable, art. 293 B du CGI.</em><br>' : ''}
    ${mandateMention}
    <br><strong>Cat\u00E9gorie de l'op\u00E9ration :</strong> Prestation de services<br>
    <strong>Option TVA sur les d\u00E9bits :</strong> Non applicable (TVA sur encaissements)<br>
    Altio SAS \u2014 ${altioAddress} \u2014 SIREN : ${altioSiren} \u2014 ${altioRcs} \u2014 TVA : ${altioVat} \u2014 contact@altio.app<br>
    M\u00E9diateur : CMAP, 39 av. Franklin D. Roosevelt, 75008 Paris \u2014 www.cmap.fr
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

    <ram:ApplicableHeaderTradeAgreement>${invoiceType !== 'service' ? `
      <ram:BuyerReference>${missionId ? `Mission-${sourceId.substring(0, 8)}` : `Urgence-${sourceId.substring(0, 8)}`}</ram:BuyerReference>` : ''}
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

    const { data: { publicUrl } } = db.storage.from('invoices').getPublicUrl(fileName)

    // ── 5b. Store Factur-X XML ───────────────────────────────────────────────
    const xmlFileName = `${year}/${invoiceNumber}.xml`
    const { error: xmlUploadErr } = await db.storage
      .from('invoices')
      .upload(xmlFileName, new TextEncoder().encode(facturXml), {
        contentType: 'application/xml',
        upsert: true,
      })
    if (xmlUploadErr) throw new Error(`Factur-X XML upload failed: ${xmlUploadErr.message}`)

    const { data: { publicUrl: publicXmlUrl } } = db.storage.from('invoices').getPublicUrl(xmlFileName)

    // ── 6. Insert invoice record ─────────────────────────────────────────────
    let invoiceInsertPayload: Record<string, unknown> = {
      invoice_number:  invoiceNumber,
      mission_id:      missionId ?? null,
      emergency_id:    emergencyId ?? null,
      invoice_type:    invoiceType,
      amount_ht:       amountHt,
      amount_ttc:      amountTtc,
      vat_rate:        vatRate,
      seller_id:       sellerId,
      buyer_id:        buyerId,
      pdf_url:         publicUrl,
      stripe_pi_id:    stripePaymentIntentId ?? null,
      status:          'issued',
      facturx_url:     publicXmlUrl,
    }

    let invoice: Record<string, unknown> | null = null
    let insertErr: { message: string } | null = null

    const firstTry = await db.from('invoices').insert(invoiceInsertPayload).select().single()
    if (firstTry.error) {
      const errMsg = firstTry.error.message || ''
      const fieldsToRetry = ['facturx_url', 'emergency_id']
      let retryPayload = { ...invoiceInsertPayload }
      let needsRetry = false
      for (const field of fieldsToRetry) {
        if (errMsg.includes(field)) {
          delete retryPayload[field]
          needsRetry = true
        }
      }
      if (needsRetry) {
        const secondTry = await db.from('invoices').insert(retryPayload).select().single()
        invoice   = secondTry.data
        insertErr = secondTry.error
      } else {
        invoice   = firstTry.data
        insertErr = firstTry.error
      }
    } else {
      invoice   = firstTry.data
      insertErr = firstTry.error
    }

    if (insertErr) throw new Error(`Invoice insert failed: ${insertErr.message}`)

    return new Response(
      JSON.stringify({ success: true, invoice, facturx_url: publicXmlUrl }),
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
