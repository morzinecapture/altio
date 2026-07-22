import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth } from '../_shared/auth.ts'
import { assertUUID, assertOneOf, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const FN = 'submit-intervention-quote'

interface QuoteLineInput {
  description: unknown
  quantity: unknown
  unit_price: unknown
}

interface CleanQuoteLine {
  description: string
  quantity: number
  unit_price_ht: number
  total_ht: number
}

function log(level: string, msg: string, context: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, fn: FN, ...context }))
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function normalizeLines(raw: unknown): CleanQuoteLine[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("Le champ 'lines' doit être un tableau")
  }
  if (raw.length === 0) {
    throw new ValidationError("Le devis doit contenir au moins une ligne")
  }
  return raw.map((l: QuoteLineInput, idx: number) => {
    const description = typeof l?.description === 'string' ? l.description.trim() : ''
    if (!description) throw new ValidationError(`Ligne ${idx + 1} : description manquante`)
    const quantity = Number(l?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError(`Ligne ${idx + 1} : quantité invalide`)
    }
    const unit_price = Number(l?.unit_price)
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      throw new ValidationError(`Ligne ${idx + 1} : prix unitaire invalide`)
    }
    return {
      description,
      quantity,
      unit_price_ht: unit_price,
      total_ht: Math.round(quantity * unit_price * 100) / 100,
    }
  })
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user } = await requireAuth(req)
    await checkRateLimit(user.id, 'submit_intervention_quote', 10, 60_000)

    const body = await req.json()
    const interventionId = assertUUID(body.interventionId, 'interventionId')
    const paymentMode = assertOneOf(body.paymentMode, 'paymentMode', ['in_app', 'out_of_app'] as const)

    const lines = normalizeLines(body.lines)
    const computedTotal = Math.round(lines.reduce((s, l) => s + l.total_ht, 0) * 100) / 100
    const totalAmount = Number(body.totalAmount)
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new ValidationError("Le montant total du devis est invalide")
    }
    // Tolerate a 1 cent rounding gap
    if (Math.abs(totalAmount - computedTotal) > 0.01) {
      throw new ValidationError(`Total incohérent avec les lignes (${totalAmount.toFixed(2)} ≠ ${computedTotal.toFixed(2)} €)`)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    const db = createClient(supabaseUrl, supabaseService)

    // 1. Fetch intervention, check provider + phase
    const { data: iv, error: ivErr } = await db
      .from('interventions')
      .select('id, owner_id, assigned_provider_id, phase')
      .eq('id', interventionId)
      .single()
    if (ivErr || !iv) {
      return respond({ success: false, error: "Intervention introuvable" }, 404)
    }
    if (iv.assigned_provider_id !== user.id) {
      log('warn', 'unauthorized', { userId: user.id })
      return respond({ success: false, error: "Vous n'êtes pas le prestataire de cette intervention" }, 403)
    }
    if (iv.phase !== 'on_site') {
      log('warn', 'invalid_phase', { phase: iv.phase })
      return respond({ success: false, error: "Vous ne pouvez soumettre un devis qu'après être arrivé sur place" }, 409)
    }

    // 2. Insert mission_quotes row + line items (service_role bypasses RLS; we already authorized)
    const { data: quote, error: qErr } = await db
      .from('mission_quotes')
      .insert({
        intervention_id: interventionId,
        provider_id: user.id,
        repair_cost: totalAmount,
        total_ht: totalAmount,
        status: 'pending',
      })
      .select('id')
      .single()
    if (qErr || !quote) {
      log('error', 'quote_insert_failed', { err: qErr?.message })
      return respond({ success: false, error: "Impossible d'enregistrer le devis" }, 500)
    }

    const lineRows = lines.map((l, i) => ({
      quote_id: quote.id,
      type: 'other' as const,
      description: l.description,
      quantity: l.quantity,
      unit: 'unité',
      unit_price_ht: l.unit_price_ht,
      sort_order: i,
    }))
    const { error: liErr } = await db.from('quote_line_items').insert(lineRows)
    if (liErr) {
      log('warn', 'line_items_insert_failed', { err: liErr.message })
      // Non-blocking — keep quote row; admin can repair from logs.
    }

    // 3. Flip intervention phase on_site → quote_sent (guarded)
    const { data: updatedIv, error: upErr } = await db
      .from('interventions')
      .update({
        phase: 'quote_sent',
        quote_amount: totalAmount,
        payment_mode: paymentMode,
      })
      .eq('id', interventionId)
      .eq('phase', 'on_site')
      .select('*')
      .single()
    if (upErr || !updatedIv) {
      log('error', 'intervention_update_failed', { err: upErr?.message })
      return respond({ success: false, error: "Mise à jour de l'intervention échouée" }, 500)
    }

    // 4. Generate the HTML/PDF quote document (fire-and-forget; owner push
    // comes from the phase-change DB trigger).
    db.functions.invoke('generate-quote', {
      body: { quoteId: quote.id, interventionId },
    }).catch((e: unknown) => log('warn', 'generate_quote_failed', {
      err: e instanceof Error ? e.message : String(e),
    }))

    return respond({
      success: true,
      data: { intervention: updatedIv, quoteId: quote.id },
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond({ success: false, error: err.message }, 400)
    }
    const msg = err instanceof Error ? err.message : String(err)
    const isAuth = /authorization|token/i.test(msg)
    log('error', 'unhandled', { err: msg })
    return respond({ success: false, error: isAuth ? "Session expirée, veuillez vous reconnecter" : msg }, isAuth ? 401 : 400)
  }
})
