import { invoiceDocumentParties } from '../_shared/invoice-parties.ts'
import { escapeDocumentText, escapePartyFields } from '../_shared/document-text.ts'
import { requireLegalEntity } from '../_shared/legal-entity.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuthOrServiceKey } from '../_shared/auth.ts'
import { assertUUID, assertString } from '../_shared/validate.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const { user, isServiceCall } = await requireAuthOrServiceKey(req)
    const supabaseUrl     = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    if (!isServiceCall) {
      const { data: caller, error } = await db.from('users').select('is_admin').eq('id', user!.id).single()
      if (error || !caller?.is_admin) return new Response(JSON.stringify({ error: 'Accès administrateur requis' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const invoiceId = assertUUID(body.invoiceId, 'invoiceId')
    const targetCents = body.targetCents
    if (targetCents !== undefined && (!isServiceCall || !Number.isSafeInteger(targetCents) || targetCents <= 0)) throw new Error('Cible d’avoir invalide')
    const requestedReason = assertString(body.reason, 'reason')
    if (requestedReason.length > 1000) throw new Error('Motif trop long')

    // ── 1. Fetch original invoice ────────────────────────────────────────────
    const { data: currentInvoice, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (invErr || !currentInvoice) throw new Error('Facture introuvable')
    if (currentInvoice.invoice_type === 'credit_note') throw new Error('Impossible de créditer un avoir')
    const validationRunId = body.validationRunId && isServiceCall && body.validationRunId === invoiceId &&
      currentInvoice.invoice_number === `TEST-RELEASE-${invoiceId}` ? invoiceId : null
    if (body.validationRunId && !validationRunId) throw new Error('Référence de validation invalide')

    // Billing snapshots survive profile deletion and do not follow later edits.
    const parties = await invoiceDocumentParties(db, currentInvoice)
    let sellerUser = parties.seller
    let buyerUser = parties.buyer
    const configuredEntity = requireLegalEntity((key) => Deno.env.get(key))
    const { data: job, error: prepareError } = await db.rpc(targetCents === undefined ? 'prepare_credit_note' : 'prepare_partial_credit_note', {
      ...(targetCents === undefined ? {} : { p_target_cents: targetCents }),
      p_invoice_id: invoiceId, p_reason: requestedReason,
      p_context: { seller: sellerUser, buyer: buyerUser, legalEntity: configuredEntity, ...(validationRunId ? { validationRunId } : {}) },
    })
    if (prepareError || !job) throw new Error('Préparation de l’avoir indisponible')
    if (job.existing) return new Response(JSON.stringify({ success: true, creditNote: job.existing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
    // Every retry uses the same number, date, amounts and document snapshot.
    const originalInvoice = job.original_invoice
    const reason = job.reason
    const legalEntity = job.document_context.legalEntity
    sellerUser = escapePartyFields(job.document_context.seller)
    buyerUser = escapePartyFields(job.document_context.buyer)
    const year = new Date(job.created_at).getUTCFullYear()
    const creditNoteNumber = job.invoice_number

    // ── 4. Amounts (same as original but negative) ───────────────────────────
    const amountHt  = -Math.abs(Number(job.credit_ht ?? originalInvoice.amount_ht))
    const amountTtc = -Math.abs(Number(job.credit_ttc ?? originalInvoice.amount_ttc))
    const vatRate   = Number(originalInvoice.vat_rate)
    const vatExempt = vatRate === 0
    const vatAmount = parseFloat((amountTtc - amountHt).toFixed(2))

    // ── 5. Altio company info ────────────────────────────────────────────────
    const altioName = escapeDocumentText(legalEntity.name)
    const altioForm = escapeDocumentText(legalEntity.form)
    const altioSiren = legalEntity.siren
    const altioSiret = legalEntity.siret
    const altioVat = escapeDocumentText(legalEntity.vat)
    const altioRcs = escapeDocumentText(legalEntity.rcs)
    const altioAddress = escapeDocumentText(legalEntity.address)
    const altioCapital = escapeDocumentText(legalEntity.capital)

    const invoiceType = originalInvoice.invoice_type

    // Determine seller display
    const isAltioSeller = invoiceType === 'commission' || invoiceType === 'service_fee'
    const sellerDetailHtml = isAltioSeller
      ? `<div class="party-name">${altioName}</div>
         <div class="party-detail">
           ${altioForm}${altioCapital ? ` — capital : ${altioCapital} €` : ''}<br>
           SIREN : ${altioSiren}<br>
           SIRET : ${altioSiret}<br>
           ${altioRcs}<br>
           ${altioVat ? `N° TVA : ${altioVat}<br>` : ''}
           ${altioAddress}
         </div>`
      : `<div class="party-name">${sellerUser?.company_name || sellerUser?.name || 'Prestataire'}</div>
         <div class="party-detail">
           ${sellerUser?.siret ? `SIRET : ${sellerUser.siret}<br>` : sellerUser?.siren ? `SIREN : ${sellerUser.siren}<br>` : ''}
           ${sellerUser?.vat_number ? `N\u00B0 TVA : ${sellerUser.vat_number}<br>` : ''}
           ${sellerUser?.billing_address || sellerUser?.address || ''}
         </div>`

    const buyerDetailHtml = `
      <div class="party-name">${buyerUser?.company_name || buyerUser?.name || 'N/A'}</div>
      <div class="party-detail">
        ${buyerUser?.siret ? `SIRET : ${buyerUser.siret}<br>` : buyerUser?.siren ? `SIREN : ${buyerUser.siren}<br>` : ''}
        ${buyerUser?.vat_number ? `N\u00B0 TVA : ${buyerUser.vat_number}<br>` : ''}
        ${buyerUser?.billing_address || buyerUser?.address || buyerUser?.email || ''}
      </div>`

    // Description
    const originalInvoiceNumber = escapeDocumentText(originalInvoice.invoice_number)
    const descriptionLine = `Avoir sur facture n\u00B0 ${originalInvoiceNumber} \u2014 Motif : ${escapeDocumentText(reason)}`

    // Badge label
    const badgeLabel = invoiceType === 'commission'
      ? 'Avoir \u2014 Commission plateforme'
      : invoiceType === 'service_fee'
        ? 'Avoir \u2014 Frais de service'
        : 'Avoir \u2014 Prestation de service'

    // Mandate mention for F1 credit notes
    const mandateMention = invoiceType === 'service'
      ? `<br><em>Avoir émis par ${altioName} (SIREN : ${altioSiren}) au nom et pour le compte de ${sellerUser?.company_name || sellerUser?.name || 'Prestataire'} (SIREN : ${sellerUser?.siren || 'N/A'}) en vertu d'un mandat de facturation (art. 289-I-2 du CGI).</em><br>`
      : ''

    const vatLine = vatExempt
      ? `<tr><td colspan="2" style="color:#6B7280;font-size:12px;padding:4px 0">TVA non applicable, art. 293 B du CGI</td></tr>`
      : `<tr><td style="color:#6B7280">TVA (${vatRate}%)</td><td style="text-align:right">${vatAmount.toFixed(2)} \u20AC</td></tr>`

    const emissionDate = new Date(job.created_at).toLocaleDateString('fr-FR', { timeZone: 'UTC' })

    // ── 6. Generate HTML credit note ─────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Avoir ${creditNoteNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#1E293B; background:#fff; padding:40px; max-width:800px; margin:0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; padding-bottom:20px; border-bottom:2px solid #DC2626; }
  .brand { font-size:24px; font-weight:700; color:#2563EB; }
  .brand-sub { font-size:12px; color:#64748B; margin-top:4px; }
  .invoice-meta { text-align:right; }
  .invoice-num { font-size:18px; font-weight:700; color:#DC2626; }
  .invoice-date { font-size:12px; color:#64748B; margin-top:4px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:32px; }
  .party-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#64748B; margin-bottom:8px; }
  .party-name { font-size:15px; font-weight:700; color:#1E293B; }
  .party-detail { font-size:12px; color:#64748B; margin-top:4px; line-height:1.6; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#FEF2F2; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; }
  td { padding:12px; border-bottom:1px solid #E2E8F0; font-size:13px; }
  .totals { margin-left:auto; width:280px; }
  .totals tr td { padding:6px 0; font-size:13px; border:none; }
  .total-ttc td { font-weight:700; font-size:16px; color:#DC2626; padding-top:10px; border-top:2px solid #E2E8F0; }
  .legal { margin-top:40px; padding-top:20px; border-top:1px solid #E2E8F0; font-size:11px; color:#94A3B8; line-height:1.8; }
  .badge { display:inline-block; background:#FEF2F2; color:#DC2626; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
  .avoir-banner { background:#FEF2F2; border:2px solid #DC2626; border-radius:8px; padding:16px; text-align:center; margin-bottom:24px; }
  .avoir-banner h2 { color:#DC2626; font-size:20px; margin-bottom:4px; }
  .avoir-banner p { color:#64748B; font-size:13px; }
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
      <div class="invoice-num">AVOIR ${creditNoteNumber}</div>
      <div class="invoice-date">\u00C9mission : ${emissionDate}</div>
      <div style="margin-top:8px"><span class="badge">${badgeLabel}</span></div>
    </div>
  </div>

  <div class="avoir-banner">
    <h2>AVOIR</h2>
    <p>Avoir sur facture n\u00B0 ${originalInvoiceNumber}</p>
    <p>Motif : ${escapeDocumentText(reason)}</p>
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

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Montant HT</th>
        <th style="text-align:right">TVA</th>
        <th style="text-align:right">Montant TTC</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${descriptionLine}</td>
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
    <strong>Nature du document :</strong> Facture d'avoir (note de cr\u00E9dit) au sens de l'article 289 du CGI.<br>
    <strong>R\u00E9f\u00E9rence facture d'origine :</strong> ${originalInvoiceNumber}<br>
    <strong>Motif de l'avoir :</strong> ${escapeDocumentText(reason)}<br><br>
    <strong>Conditions de remboursement :</strong> Le montant sera rembours\u00E9 par le m\u00EAme moyen de paiement que celui utilis\u00E9 pour la transaction initiale, dans un d\u00E9lai de 14 jours.<br>
    ${vatExempt ? '<br><em>TVA non applicable, art. 293 B du CGI.</em><br>' : ''}
    ${mandateMention}
    <br><strong>Cat\u00E9gorie de l'op\u00E9ration :</strong> Prestation de services<br>
    ${altioName} — ${altioAddress} — SIREN : ${altioSiren} — ${altioRcs} ${altioVat ? `— TVA : ${altioVat}` : ''} — ${escapeDocumentText(legalEntity.email)}<br>
    Médiateur Altio : ${escapeDocumentText(legalEntity.mediatorName)} — ${escapeDocumentText(legalEntity.mediatorAddress)} — ${escapeDocumentText(legalEntity.mediatorUrl)}
  </div>
</body>
</html>`

    // ── 7. Generate Factur-X XML (TypeCode 381 = credit note) ────────────────
    const issueDateYYYYMMDD = new Date(job.created_at).toISOString().slice(0, 10).replace(/-/g, '')

    const sellerName = isAltioSeller ? altioName : (sellerUser?.company_name || sellerUser?.name || 'N/A')
    const sellerVatXml = isAltioSeller ? altioVat : (sellerUser?.vat_number || '')
    const buyerName = buyerUser?.company_name || buyerUser?.name || 'N/A'

    const vatCategoryCode = vatExempt ? 'E' : 'S'
    const vatRateValue = vatExempt ? '0' : String(vatRate)

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
    <ram:ID>${creditNoteNumber}</ram:ID>
    <ram:TypeCode>381</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDateYYYYMMDD}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>Avoir sur facture ${originalInvoiceNumber} - ${escapeDocumentText(reason)}</ram:Content>
    </ram:IncludedNote>
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
          <ram:ChargeAmount>${Math.abs(amountHt).toFixed(2)}</ram:ChargeAmount>
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
          <ram:LineTotalAmount>${Math.abs(amountHt).toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${sellerName}</ram:Name>
        ${sellerVatXml ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${sellerVatXml}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${buyerName}</ram:Name>${buyerUser?.siren ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${buyerUser.siren}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery />

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${originalInvoiceNumber}</ram:IssuerAssignedID>
      </ram:InvoiceReferencedDocument>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${Math.abs(vatAmount).toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${Math.abs(amountHt).toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${vatCategoryCode}</ram:CategoryCode>
        <ram:RateApplicablePercent>${vatRateValue}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${Math.abs(amountHt).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${Math.abs(amountHt).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${Math.abs(vatAmount).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${Math.abs(amountTtc).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${Math.abs(amountTtc).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`

    // ── 8. Store HTML in Supabase Storage ────────────────────────────────────
    const fileName = `${year}/${creditNoteNumber}.html`
    const { error: uploadErr } = await db.storage
      .from('invoices')
      .upload(fileName, new TextEncoder().encode(html), {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      })
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    // ── 8b. Store Factur-X XML ───────────────────────────────────────────────
    const xmlFileName = `${year}/${creditNoteNumber}.xml`
    const { error: xmlUploadErr } = await db.storage
      .from('invoices')
      .upload(xmlFileName, new TextEncoder().encode(facturXml), {
        contentType: 'application/xml',
        upsert: true,
      })
    if (xmlUploadErr) throw new Error(`Factur-X XML upload failed: ${xmlUploadErr.message}`)

    // Publish the credit and cancel its source in the same transaction, only
    // after BOTH files exist. Failures leave a retryable reservation.
    const { data: creditNote, error: finalizeError } = await db.rpc(targetCents === undefined ? 'finalize_credit_note' : 'finalize_partial_credit_note', {
      p_invoice_id: invoiceId, p_job_id: job.id,
    })
    if (finalizeError || !creditNote) throw new Error('Publication de l’avoir indisponible')

    return new Response(
      JSON.stringify({ success: true, creditNote, facturx_url: xmlFileName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
