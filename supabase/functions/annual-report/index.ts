import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

/**
 * Annual Report — Art. 242 bis CGI
 *
 * Platforms must send an annual summary of amounts paid to each provider
 * to the tax authorities by January 31st of the following year.
 * 5% penalty on undeclared amounts if not complied with.
 *
 * Exemption: providers with < 20 transactions AND < 3000 EUR total
 * are marked as exempt from individual reporting.
 */

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseServiceKey)

    // ── 1. Authenticate caller and verify admin ─────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized')

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (profileError || !profile?.is_admin) {
      throw new Error('Forbidden: admin access required')
    }

    // ── 2. Parse request body ───────────────────────────────────────────────
    const { year } = await req.json()
    if (!year || typeof year !== 'number' || year < 2020 || year > 2100) {
      throw new Error('Invalid year. Expected { year: number } (e.g. 2025)')
    }

    const yearStart = `${year}-01-01T00:00:00.000Z`
    const yearEnd = `${year + 1}-01-01T00:00:00.000Z`

    // ── 3. Fetch all paid missions for the year ─────────────────────────────
    // Query missions with status 'paid', filtered by the payment/completion date
    const { data: paidMissions, error: missionsError } = await db
      .from('missions')
      .select('id, provider_id, fixed_rate, paid_at, completed_at')
      .eq('status', 'paid')
      .not('provider_id', 'is', null)
      .gte('paid_at', yearStart)
      .lt('paid_at', yearEnd)

    if (missionsError) throw new Error(`Failed to fetch missions: ${missionsError.message}`)

    // Also fetch paid emergency requests for the year
    const { data: paidEmergencies, error: emergenciesError } = await db
      .from('emergency_requests')
      .select('id, accepted_provider_id, displacement_fee, diagnostic_fee, paid_at')
      .eq('status', 'paid')
      .not('accepted_provider_id', 'is', null)
      .gte('paid_at', yearStart)
      .lt('paid_at', yearEnd)

    // Silently ignore if emergency_requests table doesn't exist or has no paid_at
    const emergencies = emergenciesError ? [] : (paidEmergencies || [])

    // ── 4. Aggregate per provider ───────────────────────────────────────────
    const providerMap: Record<string, { transaction_count: number; total_amount_ht: number }> = {}

    for (const m of (paidMissions || [])) {
      const pid = m.provider_id
      if (!pid) continue
      const amount = Number(m.fixed_rate ?? 0)
      if (!providerMap[pid]) providerMap[pid] = { transaction_count: 0, total_amount_ht: 0 }
      providerMap[pid].transaction_count += 1
      providerMap[pid].total_amount_ht += amount
    }

    for (const e of emergencies) {
      const pid = e.accepted_provider_id
      if (!pid) continue
      const amount = Number(e.displacement_fee ?? 0) + Number(e.diagnostic_fee ?? 0)
      if (!providerMap[pid]) providerMap[pid] = { transaction_count: 0, total_amount_ht: 0 }
      providerMap[pid].transaction_count += 1
      providerMap[pid].total_amount_ht += amount
    }

    const providerIds = Object.keys(providerMap)

    // ── 5. Fetch provider identity details ──────────────────────────────────
    interface ProviderProfile {
      id: string;
      full_name?: string;
      name?: string;
      email?: string;
      siret?: string;
      siren?: string;
      billing_address?: string;
      company_name?: string;
    }
    let providersById: Record<string, ProviderProfile> = {}
    if (providerIds.length > 0) {
      const { data: profiles, error: profilesError } = await db
        .from('profiles')
        .select('id, full_name, name, email, siret, siren, billing_address, company_name')
        .in('id', providerIds)

      if (profilesError) throw new Error(`Failed to fetch provider profiles: ${profilesError.message}`)

      for (const p of (profiles || [])) {
        providersById[p.id] = p
      }
    }

    // ── 6. Build report entries ─────────────────────────────────────────────
    const COMMISSION_RATE = 0.10
    const TVA_RATE = 0.20

    const providerEntries = providerIds.map((pid) => {
      const agg = providerMap[pid]
      const profile = providersById[pid] || {}
      const totalHt = parseFloat(agg.total_amount_ht.toFixed(2))
      // Amount the provider actually received (after Altio commission)
      const netHt = parseFloat((totalHt * (1 - COMMISSION_RATE)).toFixed(2))
      const totalTtc = parseFloat((totalHt * (1 + TVA_RATE)).toFixed(2))

      // Art. 242 bis exemption: < 20 transactions AND < 3000 EUR
      const exempt = agg.transaction_count < 20 && totalHt < 3000

      return {
        provider_id: pid,
        full_name: profile.full_name || profile.name || profile.company_name || 'N/A',
        email: profile.email || null,
        siret: profile.siret || profile.siren || null,
        address: profile.billing_address || null,
        transaction_count: agg.transaction_count,
        total_amount_ht: totalHt,
        total_amount_ttc: totalTtc,
        net_received_ht: netHt,
        exempt_art_242_bis: exempt,
      }
    })

    // Sort by total amount descending
    providerEntries.sort((a, b) => b.total_amount_ht - a.total_amount_ht)

    // ── 7. Build summary ────────────────────────────────────────────────────
    const totalProviders = providerEntries.length
    const totalTransactions = providerEntries.reduce((s, e) => s + e.transaction_count, 0)
    const totalAmountHt = parseFloat(providerEntries.reduce((s, e) => s + e.total_amount_ht, 0).toFixed(2))
    const totalAmountTtc = parseFloat(providerEntries.reduce((s, e) => s + e.total_amount_ttc, 0).toFixed(2))
    const exemptCount = providerEntries.filter((e) => e.exempt_art_242_bis).length
    const reportableCount = totalProviders - exemptCount

    const report = {
      report_type: 'annual_provider_summary_art_242_bis_cgi',
      year,
      generated_at: new Date().toISOString(),
      generated_by: user.id,
      deadline: `${year + 1}-01-31`,
      penalty_rate: '5% on undeclared amounts',
      summary: {
        total_providers: totalProviders,
        reportable_providers: reportableCount,
        exempt_providers: exemptCount,
        total_transactions: totalTransactions,
        total_amount_ht: totalAmountHt,
        total_amount_ttc: totalAmountTtc,
      },
      providers: providerEntries,
    }

    // ── 8. Store report in Supabase Storage ─────────────────────────────────
    const fileName = `reports/annual-report-${year}.json`
    const reportJson = JSON.stringify(report, null, 2)

    const { error: uploadError } = await db.storage
      .from('invoices')
      .upload(fileName, new TextEncoder().encode(reportJson), {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = db.storage.from('invoices').getPublicUrl(fileName)

    // ── 9. Return response ──────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        report_url: publicUrl,
        report,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
