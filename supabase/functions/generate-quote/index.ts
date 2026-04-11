import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { assertUUID, ValidationError } from '../_shared/validate.ts'
import { requireAuth } from '../_shared/auth.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await requireAuth(req)

    const supabaseUrl     = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    const reqBody = await req.json()

    // ── Input validation ──
    const quoteId = assertUUID(reqBody.quoteId, 'quoteId')

    // HTML-escape helper to prevent XSS injection from user-supplied strings
    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;')

    // ── 1. Fetch quote with provider, mission/emergency, and property details ──
    const { data: quote, error: qErr } = await db
      .from('mission_quotes')
      .select('*, provider:users!mission_quotes_provider_id_fkey(*), mission:missions!mission_quotes_mission_id_fkey(*, property:properties(name, address)), emergency:emergency_requests!mission_quotes_emergency_request_id_fkey(*, property:properties(name, address))')
      .eq('id', quoteId)
      .single()
    if (qErr || !quote) throw new Error(`Quote not found: ${qErr?.message || 'no data'}`)

    const provider = quote.provider ?? {}
    const mission  = quote.mission
    const emergency = quote.emergency
    const source   = mission || emergency
    if (!source) throw new Error('Quote has no linked mission or emergency')

    // ── Authorization: only owner or provider may generate this quote ──
    const ownerId = source.owner_id
    if (user.id !== ownerId && user.id !== quote.provider_id) {
      throw new Error("Non autorisé à générer ce devis")
    }

    // Fetch owner details
    const { data: owner } = await db
      .from('users')
      .select('*')
      .eq('id', ownerId)
      .single()

    // ── 1b. Fetch provider_profiles for legal compliance fields ──
    const { data: providerProfile } = await db
      .from('provider_profiles')
      .select('legal_status, rcs_number, rne_number, insurance_company, insurance_coverage_area, qualifications, hourly_rate')
      .eq('provider_id', quote.provider_id)
      .single()

    // ── 1c. Fetch line items from quote_line_items table ──
    const { data: dbLineItems } = await db
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true })

    const property        = source.property ?? {}
    const propertyName    = esc(property.name || '—')
    const propertyAddress = esc(property.address || '')
    const serviceType     = esc(mission?.mission_type || emergency?.service_type || 'service')

    // ── 2. Quote number (per-provider sequence) ────────────────────────────────
    const year = new Date().getFullYear()
    let seq = Date.now() % 100000
    try {
      const { data: seqData } = await db.rpc('next_quote_number', { p_provider_id: quote.provider_id }).single()
      if (seqData != null) seq = seqData
    } catch {
      // next_quote_number RPC may not exist yet — use timestamp fallback
    }
    const providerRef = provider.siren || provider.id?.slice(0, 8) || 'UNKNOWN'
    const quoteNumber = `D-${providerRef}-${year}-${String(seq).padStart(4, '0')}`

    // ── 3. Compute amounts ───────────────────────────────────────────────────────

    // Line items: prefer DB line items, fallback to flat fields
    interface LineItem {
      description: string
      quantity: number
      unit: string
      unit_price_ht: number
      total_ht: number
    }

    let lineItems: LineItem[] = []

    if (dbLineItems && dbLineItems.length > 0) {
      // Use line items from the database table
      lineItems = dbLineItems.map((item: Record<string, unknown>) => ({
        description: esc((item.description as string) || ''),
        quantity: Number(item.quantity ?? 1),
        unit: (item.unit as string) || 'u',
        unit_price_ht: Number(item.unit_price_ht ?? item.unit_price ?? 0),
        total_ht: Number(item.total_ht ?? (Number(item.quantity ?? 1) * Number(item.unit_price_ht ?? item.unit_price ?? 0))),
      }))
    } else {
      // Fallback: build from flat quote fields
      const repairCost       = Number(quote.repair_cost ?? 0)
      const displacementFee  = Number(quote.displacement_fee ?? quote.travel_cost ?? 0)
      const diagnosticFee    = Number(quote.diagnostic_fee ?? 0)
      const labourCost       = Number(quote.labour_cost ?? 0)
      const partsCost        = Number(quote.parts_cost ?? 0)

      if (labourCost > 0) {
        lineItems.push({ description: 'Main-d\'oeuvre', quantity: 1, unit: 'forfait', unit_price_ht: labourCost, total_ht: labourCost })
      }
      if (partsCost > 0) {
        lineItems.push({ description: 'Fournitures et pièces', quantity: 1, unit: 'forfait', unit_price_ht: partsCost, total_ht: partsCost })
      }
      if (repairCost > 0 && labourCost === 0 && partsCost === 0) {
        lineItems.push({ description: 'Prestation de service', quantity: 1, unit: 'forfait', unit_price_ht: repairCost, total_ht: repairCost })
      }
      if (diagnosticFee > 0) {
        lineItems.push({ description: 'Frais de diagnostic', quantity: 1, unit: 'forfait', unit_price_ht: diagnosticFee, total_ht: diagnosticFee })
      }
      if (displacementFee > 0) {
        lineItems.push({ description: 'Frais de déplacement', quantity: 1, unit: 'forfait', unit_price_ht: displacementFee, total_ht: displacementFee })
      }

      // If no line items at all, use repair_cost or a total
      if (lineItems.length === 0) {
        const fallbackAmount = repairCost || Number(quote.amount ?? quote.price ?? 0)
        lineItems.push({ description: `Prestation : ${serviceType}`, quantity: 1, unit: 'forfait', unit_price_ht: fallbackAmount, total_ht: fallbackAmount })
      }
    }

    const totalHt = parseFloat(lineItems.reduce((sum, l) => sum + l.total_ht, 0).toFixed(2))

    // TVA: read saved values from quote, fallback to provider/renovation logic
    const isRenovation   = quote.is_renovation ?? false
    const vatExempt      = quote.is_vat_exempt ?? provider.is_vat_exempt ?? false
    const vatRate        = vatExempt ? 0 : (quote.tva_rate ? Number(quote.tva_rate) * 100 : (isRenovation ? 10 : 20))
    const effectiveVat   = vatExempt ? 0 : vatRate
    const vatAmount      = vatExempt ? 0 : parseFloat((totalHt * effectiveVat / 100).toFixed(2))
    const totalTtc       = parseFloat((totalHt + vatAmount).toFixed(2))

    // ── 4. Dates ─────────────────────────────────────────────────────────────────
    const today         = new Date()
    const emissionDate  = today.toLocaleDateString('fr-FR')
    const validityDays  = Number(quote.validity_days ?? 30)
    const expiryDate    = new Date(today.getTime() + validityDays * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
    const startDate     = quote.estimated_start_date
      ? new Date(quote.estimated_start_date).toLocaleDateString('fr-FR')
      : (mission?.preferred_date ? new Date(mission.preferred_date).toLocaleDateString('fr-FR') : 'À convenir')
    const estimatedDuration = esc(quote.estimated_duration || quote.duration || 'À définir')

    // ── 5. Provider & owner info ─────────────────────────────────────────────────
    const providerName     = esc(provider.company_name || provider.name || `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'N/A')
    const providerSiret    = esc(provider.siret || provider.siren || '')
    const providerAddress  = esc(provider.billing_address || provider.address || '')
    const providerInsurance = esc(provider.decennial_insurance || provider.insurance_number || '')
    const providerRcPro    = esc(provider.rc_pro_number || provider.insurance_rc || '')
    const providerVat      = esc(provider.vat_number || '')

    // Provider profile legal fields
    const legalStatus           = esc(providerProfile?.legal_status || '')
    const rcsNumber             = esc(providerProfile?.rcs_number || '')
    const rneNumber             = esc(providerProfile?.rne_number || '')
    const insuranceCompany      = esc(providerProfile?.insurance_company || '')
    const insuranceCoverageArea = esc(providerProfile?.insurance_coverage_area || 'France entière')
    const qualifications: Array<{ name: string; number?: string }> = providerProfile?.qualifications || []
    const hourlyRate            = providerProfile?.hourly_rate ? Number(providerProfile.hourly_rate) : null

    // Build RCS/RNE line
    const rcsOrRne = rcsNumber
      ? `RCS : ${rcsNumber}`
      : (rneNumber ? `RNE : ${rneNumber}` : '')

    // Build qualifications HTML
    const qualificationsHtml = qualifications.length > 0
      ? `Qualifications : ${qualifications.map((q: { name: string; number?: string }) => q.number ? `${esc(q.name)} (n° ${esc(q.number)})` : esc(q.name)).join(', ')}<br>`
      : ''

    // Build hourly rate line (TTC) for display if labour lines exist
    const hasLabourLine = lineItems.some(l => l.description.toLowerCase().includes('main-d') || l.description.toLowerCase().includes('oeuvre') || l.description.toLowerCase().includes('œuvre'))
    const hourlyRateHtml = (hourlyRate && hasLabourLine)
      ? `<tr><td colspan="5" style="font-size:12px;color:#64748B;padding:4px 12px;">Taux horaire TTC : ${hourlyRate.toFixed(2)} €/h</td></tr>`
      : ''

    const ownerName     = esc(owner?.company_name || owner?.name || `${owner?.first_name || ''} ${owner?.last_name || ''}`.trim() || 'N/A')
    const ownerAddress  = esc(owner?.billing_address || owner?.address || '')

    const description = esc(quote.description || quote.details || source.description || '')

    // ── 6. Generate HTML ─────────────────────────────────────────────────────────
    const lineItemsHtml = lineItems.map(item => `
      <tr>
        <td>${item.description}</td>
        <td style="text-align:right">${item.quantity}</td>
        <td style="text-align:center">${item.unit}</td>
        <td style="text-align:right">${item.unit_price_ht.toFixed(2)} €</td>
        <td style="text-align:right">${item.total_ht.toFixed(2)} €</td>
      </tr>`).join('')

    const vatLine = vatExempt
      ? `<tr><td colspan="2" style="color:#6B7280;font-size:12px;padding:4px 0">TVA non applicable, art. 293 B du CGI</td></tr>`
      : `<tr><td style="color:#6B7280">TVA (${effectiveVat}%)</td><td style="text-align:right">${vatAmount.toFixed(2)} €</td></tr>`

    // Renovation attestation block
    const renovationAttestationHtml = isRenovation ? `
  <div class="mention" style="margin-top:24px;">
    <strong>Attestation du client (TVA à taux réduit) :</strong><br>
    Je soussigné(e) ${ownerName}, atteste que les travaux mentionnés sur ce devis
    sont réalisés dans un logement achevé depuis plus de 2 ans et affecté à l'habitation,
    conformément aux conditions de l'article 279-0 bis du CGI.<br><br>
    Date et signature du client :<br>
    <div style="height:40px;border-bottom:1px dashed #CBD5E1;margin-top:8px;"></div>
  </div>` : ''

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Devis ${quoteNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#1E293B; background:#fff; padding:40px; max-width:800px; margin:0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; padding-bottom:20px; border-bottom:2px solid #2563EB; }
  .brand { font-size:24px; font-weight:700; color:#2563EB; }
  .brand-sub { font-size:12px; color:#64748B; margin-top:4px; }
  .quote-meta { text-align:right; }
  .quote-num { font-size:18px; font-weight:700; color:#1E293B; }
  .quote-date { font-size:12px; color:#64748B; margin-top:4px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:32px; }
  .party-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#64748B; margin-bottom:8px; }
  .party-name { font-size:15px; font-weight:700; color:#1E293B; }
  .party-detail { font-size:12px; color:#64748B; margin-top:4px; line-height:1.6; }
  .description-block { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; margin-bottom:24px; }
  .description-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; margin-bottom:8px; }
  .description-text { font-size:13px; color:#1E293B; line-height:1.6; white-space:pre-wrap; }
  .gratuit-badge { display:inline-block; background:#D1FAE5; color:#065F46; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600; margin-top:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#F1F5F9; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; }
  td { padding:12px; border-bottom:1px solid #E2E8F0; font-size:13px; }
  .totals { margin-left:auto; width:280px; }
  .totals tr td { padding:6px 0; font-size:13px; border:none; }
  .total-ttc td { font-weight:700; font-size:16px; color:#1E293B; padding-top:10px; border-top:2px solid #E2E8F0; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; }
  .info-item-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; margin-bottom:4px; }
  .info-item-value { font-size:13px; color:#1E293B; }
  .conditions-block { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; margin-bottom:24px; }
  .conditions-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; color:#64748B; margin-bottom:12px; }
  .conditions-item { font-size:12px; color:#1E293B; line-height:1.8; margin-bottom:4px; }
  .legal { margin-top:40px; padding-top:20px; border-top:1px solid #E2E8F0; font-size:11px; color:#94A3B8; line-height:1.8; }
  .badge { display:inline-block; background:#EFF6FF; color:#2563EB; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
  .mention { background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; padding:12px 16px; margin-top:16px; font-size:12px; color:#92400E; line-height:1.6; }
  @media print { body { padding:20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Altio</div>
      <div class="brand-sub">Plateforme de gestion de locations saisonnières<br>contact@altio.fr</div>
    </div>
    <div class="quote-meta">
      <div class="quote-num">DEVIS ${quoteNumber}</div>
      <div class="quote-date">Date : ${emissionDate}</div>
      <div class="quote-date">Valide jusqu'au : ${expiryDate}</div>
      <div style="margin-top:8px"><span class="badge">Devis</span> <span class="gratuit-badge">Ce devis est établi gratuitement</span></div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Prestataire</div>
      <div class="party-name">${providerName}</div>
      <div class="party-detail">
        ${legalStatus ? `${legalStatus}<br>` : ''}
        ${providerSiret ? `SIRET : ${providerSiret}<br>` : ''}
        ${rcsOrRne ? `${rcsOrRne}<br>` : ''}
        ${providerVat ? `N° TVA intracom. : ${providerVat}<br>` : ''}
        ${vatExempt ? 'TVA non applicable, art. 293 B du CGI<br>' : ''}
        ${providerAddress ? `${providerAddress}<br>` : ''}
        ${insuranceCompany || providerInsurance ? `Assurance décennale : ${insuranceCompany}${insuranceCompany && providerInsurance ? ', ' : ''}${providerInsurance ? `police n° ${providerInsurance}` : ''}${insuranceCoverageArea ? `, couverture : ${insuranceCoverageArea}` : ''}<br>` : ''}
        ${providerRcPro ? `RC Professionnelle : ${providerRcPro}<br>` : ''}
        ${qualificationsHtml}
      </div>
    </div>
    <div>
      <div class="party-label">Client</div>
      <div class="party-name">${ownerName}</div>
      <div class="party-detail">
        ${ownerAddress ? `${ownerAddress}<br>` : ''}
        <br>
        <strong>Lieu d'intervention :</strong><br>
        ${propertyName}${propertyAddress ? ` — ${propertyAddress}` : ''}
      </div>
    </div>
  </div>

  <div class="description-block">
    <div class="description-title">Description des travaux</div>
    <div class="description-text">${description || 'Voir détail des prestations ci-dessous.'}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Qté</th>
        <th style="text-align:center">Unité</th>
        <th style="text-align:right">Prix unit. HT</th>
        <th style="text-align:right">Total HT</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
      ${hourlyRateHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Total HT</td><td style="text-align:right">${totalHt.toFixed(2)} €</td></tr>
    ${vatLine}
    <tr class="total-ttc"><td>TOTAL TTC</td><td style="text-align:right">${totalTtc.toFixed(2)} €</td></tr>
  </table>

  <div class="info-grid">
    <div>
      <div class="info-item-label">Date de début estimée</div>
      <div class="info-item-value">${startDate}</div>
    </div>
    <div>
      <div class="info-item-label">Durée estimée des travaux</div>
      <div class="info-item-value">${estimatedDuration}</div>
    </div>
    <div>
      <div class="info-item-label">Validité du devis</div>
      <div class="info-item-value">${validityDays} jours (jusqu'au ${expiryDate})</div>
    </div>
    <div>
      <div class="info-item-label">Conditions de paiement</div>
      <div class="info-item-value">Paiement via la plateforme Altio, à la validation de l'intervention par le client.</div>
    </div>
  </div>

  <div class="conditions-block">
    <div class="conditions-title">Conditions</div>
    <div class="conditions-item"><strong>Modalités de paiement :</strong> Paiement intégral via la plateforme Altio, déclenché à la validation de l'intervention par le client. Aucun acompte requis.</div>
    <div class="conditions-item"><strong>Pénalités de retard :</strong> En cas de retard de paiement, des pénalités au taux de la Banque Centrale Européenne (BCE) majoré de 10 points seront appliquées (art. L441-10 du Code de commerce).</div>
    <div class="conditions-item"><strong>Indemnité forfaitaire de recouvrement :</strong> 40 € (art. D441-5 du Code de commerce).</div>
    <div class="conditions-item"><strong>Conditions de révision des prix :</strong> Les prix sont fermes et définitifs pour la durée de validité du devis.</div>
    <div class="conditions-item"><strong>Escompte :</strong> Pas d'escompte pour paiement anticipé.</div>
    <div class="conditions-item"><strong>Caractère gratuit du devis :</strong> Ce devis est établi gratuitement conformément à l'arrêté du 24 janvier 2017.</div>
    <div class="conditions-item"><strong>Durée de validité :</strong> Ce devis est valable ${validityDays} jours à compter de sa date d'émission (jusqu'au ${expiryDate}).</div>
    <div class="conditions-item"><strong>Droit de rétractation :</strong> Conformément à l'article L221-18 du Code de la consommation, le client dispose d'un délai de 14 jours à compter de l'acceptation du devis pour exercer son droit de rétractation, sauf en cas d'urgence ou de demande expresse du client pour une exécution immédiate (art. L221-28 du Code de la consommation).</div>
    <div class="conditions-item"><strong>Médiation de la consommation :</strong> En cas de litige, le client peut recourir gratuitement au médiateur de la consommation : CMAP — Centre de Médiation et d'Arbitrage de Paris, 39 avenue Franklin D. Roosevelt, 75008 Paris — Tél. : 01 44 95 11 40 — www.cmap.fr — consommation@cmap.fr</div>
    <div class="conditions-item"><strong>Acceptation numérique :</strong> L'acceptation du devis et le paiement via la plateforme Altio valent accord du client pour l'exécution des travaux décrits ci-dessus.</div>
  </div>

  ${renovationAttestationHtml}

  <div class="mention">
    <strong>Mentions obligatoires :</strong><br>
    Devis reçu avant l'exécution des travaux.<br>
    Le client dispose d'un droit de rétractation de 14 jours à compter de l'acceptation du devis (art. L221-18 du Code de la consommation), sauf en cas d'urgence ou de demande expresse du client pour une exécution immédiate.<br>
    ${isRenovation ? 'TVA à taux réduit de 10% applicable aux travaux de rénovation (art. 279-0 bis du CGI).<br>' : ''}
    ${vatExempt ? 'TVA non applicable, art. 293 B du CGI.<br>' : ''}
    ${providerRcPro ? `Le prestataire est couvert par une assurance responsabilité civile professionnelle (${providerRcPro}).<br>` : ''}
    ${insuranceCompany || providerInsurance ? `Assurance décennale : ${insuranceCompany}${insuranceCompany && providerInsurance ? ', police n° ' + providerInsurance : (providerInsurance ? providerInsurance : '')}${insuranceCoverageArea ? ', couverture géographique : ' + insuranceCoverageArea : ''} (art. L243-2 du Code des assurances).<br>` : ''}
  </div>

  <div class="legal">
    <br><strong>Acceptation du devis :</strong><br>
    Date et signature du client précédées de la mention manuscrite « Devis reçu avant l'exécution des travaux — Bon pour travaux » :<br>
    <em>ou acceptation numérique via la plateforme Altio (voir conditions ci-dessus).</em><br><br>
    <div style="height:60px;border-bottom:1px dashed #CBD5E1;margin-bottom:12px"></div>
    <br>
    Établi en double exemplaire.<br><br>
    Altio SAS — Plateforme de mise en relation<br>
    SIRET : [En cours d'immatriculation] — RCS Paris<br>
    N° TVA intracommunautaire : [En cours d'attribution]<br>
    Siège social : [Adresse du siège social]<br>
    Contact : contact@altio.app<br><br>
    Médiateur de la consommation : CMAP — Centre de Médiation et d'Arbitrage de Paris,
    39 avenue Franklin D. Roosevelt, 75008 Paris — Tél. : 01 44 95 11 40 — www.cmap.fr — consommation@cmap.fr
  </div>
</body>
</html>`

    // ── 7. Store HTML in Supabase Storage (reuse 'invoices' bucket) ──────────
    // Ensure bucket exists (idempotent)
    const { data: buckets } = await db.storage.listBuckets()
    const bucketExists = buckets?.some((b: { name: string }) => b.name === 'invoices')
    if (!bucketExists) {
      const { error: createBucketErr } = await db.storage.createBucket('invoices', { public: true })
      if (createBucketErr && !createBucketErr.message.includes('already exists')) {
        throw new Error(`Cannot create storage bucket: ${createBucketErr.message}`)
      }
    }

    const fileName = `quotes/${quoteId}.html`
    const { error: uploadErr } = await db.storage
      .from('invoices')
      .upload(fileName, new TextEncoder().encode(html), {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      })
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    const { data: { publicUrl } } = db.storage.from('invoices').getPublicUrl(fileName)

    // ── 8. Update the quote record with the generated document URL ───────────
    const { error: updateErr } = await db
      .from('mission_quotes')
      .update({ quote_document_url: publicUrl, quote_number: quoteNumber })
      .eq('id', quoteId)

    // If columns don't exist yet, try without quote_number
    if (updateErr) {
      const { error: retryErr } = await db
        .from('mission_quotes')
        .update({ quote_document_url: publicUrl })
        .eq('id', quoteId)
      if (retryErr) {
        // Last resort: try pdf_url column name
        await db
          .from('mission_quotes')
          .update({ pdf_url: publicUrl })
          .eq('id', quoteId)
      }
    }

    return new Response(
      JSON.stringify({ success: true, quoteNumber, url: publicUrl, document_url: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('[generate-quote] ERROR:', error instanceof Error ? error.message : String(error))
    console.error('[generate-quote] STACK:', error instanceof Error ? error.stack : 'no stack')
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    const msg = error instanceof Error ? error.message : String(error)
    const isAuthError = /authorization|token|autorisé/i.test(msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: isAuthError ? 401 : 400 }
    )
  }
})
