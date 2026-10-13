import { generateCompletionInvoices } from '../_shared/completion-invoices.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'npm:stripe@22.6.0'
import { processCompletion } from '../_shared/completion-payment.ts'
import { requireLegalEntity } from '../_shared/legal-entity.ts'

Deno.serve(async req => {
  try {
    const workerKey = Deno.env.get('COMPLETION_WORKER_KEY')
    if (!workerKey || req.headers.get('x-service-key') !== workerKey) return new Response('Forbidden', { status:403 })
    // Authenticated, read-only deployment check; never return credentials or capture a payment.
    if (new URL(req.url).searchParams.get('check') === 'configuration') {
      const key = Deno.env.get('STRIPE_SECRET_KEY') || ''
      let legalError: string | null = null
      let invoiceError: string | null = null
      try { requireLegalEntity(name => Deno.env.get(name)) }
      catch (error) { legalError = error instanceof Error ? error.message : 'Configuration indisponible' }
      try { requireLegalEntity(name => Deno.env.get(name), { requireMediator: false }) }
      catch (error) { invoiceError = error instanceof Error ? error.message : 'Configuration indisponible' }
      return Response.json({ stripeMode: /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : 'missing_or_unknown', legalConfigured: !legalError, legalError, invoiceConfigured: !invoiceError, invoiceError })
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!,{ apiVersion:'2026-08-26.dahlia' })
    const { error: reminderError } = await db.rpc('remind_emergency_completions')
    if (reminderError) throw reminderError
    const { data: steps, error } = await db.from('emergency_completion_steps').select('id')
      .in('status',['pending','processing']).is('disputed_at',null)
      .or(`approved_at.not.is.null,due_at.lte.${new Date().toISOString()}`).order('due_at').limit(50)
    if (error) throw error
    let failures = 0
    for (const step of steps || []) {
      try { await processCompletion(db,stripe,step.id) } catch (error) { failures++; console.error('Completion processing failed',step.id, error instanceof Error ? error.message : (error as any)?.message) }
    }
    const { data: paidSteps, error: invoiceQueryError } = await db.from('emergency_completion_steps').select('*')
      .not('paid_at','is',null).is('invoiced_at',null)
      .or(`invoice_retry_at.is.null,invoice_retry_at.lte.${new Date().toISOString()}`).order('paid_at').limit(25)
    if (invoiceQueryError) throw invoiceQueryError
    let invoiceFailures = 0
    for (const step of paidSteps || []) {
      try { await generateCompletionInvoices(db, step) }
      catch (error) {
        invoiceFailures++
        await db.from('emergency_completion_steps').update({ invoice_error: error instanceof Error ? error.message : 'Facturation indisponible', invoice_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() }).eq('id', step.id).throwOnError()
        console.error('Completion invoice generation failed', step.id)
      }
    }
    return Response.json({ checked:steps?.length || 0,failures, invoicesChecked: paidSteps?.length || 0, invoiceFailures },{ status: failures || invoiceFailures ? 503 : 200 })
  } catch { return new Response('Completion worker unavailable',{ status:503 }) }
})
