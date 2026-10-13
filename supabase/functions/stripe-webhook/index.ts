import { recordRefundEvent } from '../_shared/refund-events.ts'
import { generateCompletionInvoices } from '../_shared/completion-invoices.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getFrenchServiceLabel } from '../_shared/serviceLabels.ts'
import { verifyCaptureOrder } from '../_shared/capture-order.ts'
import { webhookSecretName, webhookScopeMatches } from '../_shared/stripe-webhook-routing.ts'
import { connectStripe } from '../_shared/stripe-connect.ts'
import { retrieveConnectAccount, connectProfileStatus } from '../_shared/connect-account.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const endpointSecret = Deno.env.get(webhookSecretName(req.url)) || ''

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }
  if (!endpointSecret?.startsWith('whsec_')) {
    console.error('[stripe-webhook] Signing secret is not configured')
    return new Response('Webhook configuration unavailable', { status: 503 })
  }

  const body = await req.text()

  // The verified payload can be either a v1 snapshot or a v2 notification.
  let event: Omit<Stripe.Event, 'type'> & { type: string; related_object?: { id: string; type: string } }
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret, undefined, Stripe.createSubtleCryptoProvider())
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] Signature verification failed:', errMsg)
    return new Response(`Webhook signature verification failed: ${errMsg}`, { status: 400 })
  }

  if (!webhookScopeMatches(req.url, event, Deno.env.get('STRIPE_SECRET_KEY') || '')) {
    return new Response('Webhook scope mismatch', { status: 400 })
  }
  if (event.type === 'v2.core.event_destination.ping') return new Response('ok', { status: 200 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
  const db = createClient(supabaseUrl, supabaseServiceKey)

  // A timed claim prevents concurrent handling and recovers after a crashed worker.
  const processingToken = crypto.randomUUID()
  const { data: claim, error: claimError } = await db.rpc('claim_stripe_webhook', {
    p_event_id: event.id, p_token: processingToken,
  })
  if (claimError || claim === 'busy') return new Response('Webhook temporarily unavailable', { status: 503 })
  if (claim === 'completed') return new Response(JSON.stringify({ received: true, duplicate: true }), {
    headers: { 'Content-Type': 'application/json' }, status: 200,
  })
  if (claim !== 'claimed') return new Response('Webhook claim failed', { status: 503 })
  const generateInvoice = async (body: Record<string, unknown>) => {
    const { error } = await db.functions.invoke('generate-invoice', { body })
    if (error) throw error
  }

  try {
    switch (event.type) {
      // ── Payment captured successfully ─────────────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const { missionId, emergencyId, interventionId } = pi.metadata || {}

        if (pi.metadata?.completionFlow === 'v1') {
          // Reconcile and invoice the captured phase only. The worker retries document failures.
          const { data: step, error: stepError } = await db.from('emergency_completion_steps')
            .select('*').eq('payment_intent_id',pi.id).single()
          if (stepError || !step || step.emergency_id !== emergencyId || pi.metadata.ownerId !== step.owner_id ||
            pi.currency !== 'eur' || pi.amount_received !== step.amount_cents) throw new Error('Phased payment reconciliation failed')
          const { error: settleError } = await db.rpc('settle_emergency_completion',{p_id:step.id,p_payment:pi.id})
          if (settleError) throw settleError
          await generateCompletionInvoices(db, { ...step, paid_at: step.paid_at || new Date().toISOString() })
          break
        }

        console.log('[stripe-webhook] payment_intent.succeeded')

        // ── Intervention unifiée (Phase 5) ──
        if (interventionId) {
          const { data: iv } = await db
            .from('interventions')
            .select('id, phase, owner_id, assigned_provider_id, final_amount, service_type')
            .eq('id', interventionId)
            .single().throwOnError()

          if (iv) {
            const transitions: Record<string, string> = {
              visit_pending:  'visit_paid',
              validated:      'paid',
              quote_accepted: 'in_progress',
            }
            const nextPhase = transitions[iv.phase]
            if (nextPhase) {
              await db.from('interventions')
                .update({
                  phase: nextPhase,
                  ...(nextPhase === 'paid' ? { paid_at: new Date().toISOString() } : {}),
                  stripe_payment_intent_id: pi.id,
                })
                .eq('id', interventionId)
                .eq('phase', iv.phase).throwOnError()
            }

            const invoiceBody = { interventionId, stripePaymentIntentId: pi.id }
            await Promise.all([
              generateInvoice({ ...invoiceBody, invoiceType: 'service' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'service_fee' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'commission' }),
            ])
          }
        }

        // Update mission status to 'paid' if still in 'validated'
        if (missionId) {
          const { data: mission } = await db
            .from('missions')
            .select('id, status, owner_id, assigned_provider_id, fixed_rate, mission_type')
            .eq('id', missionId)
            .single().throwOnError()

          if (mission) {
            if (!pi.metadata?.quoteId) verifyCaptureOrder(mission.owner_id, mission, pi, { missionId })
            // Update status to paid ONLY if still validated (frontend may have already done this)
            if (mission.status === 'validated') {
              await db.from('missions')
                .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
                .eq('id', missionId)
                .eq('status', 'validated').throwOnError()
            }

            // ALWAYS trigger invoice generation (idempotent — generate-invoice has dedup)
            // This runs regardless of mission status because the payment succeeded
            const invoiceBody = { missionId, stripePaymentIntentId: pi.id }
            await Promise.all([
              generateInvoice({ ...invoiceBody, invoiceType: 'service' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'service_fee' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'commission' }),
            ])

            // Notify provider
            if (mission.assigned_provider_id) {
              const netAmount = ((pi.amount_received - (pi.application_fee_amount || 0)) / 100).toFixed(2)
              await db.functions.invoke('send-push', {
                body: {
                  userId: mission.assigned_provider_id,
                  title: '💰 Paiement reçu',
                  body: `Vous avez reçu ${netAmount}€ pour la mission de ${getFrenchServiceLabel(mission.mission_type)}.`,
                  data: { missionId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to provider failed:', err instanceof Error ? err.message : 'unknown'))
            }

            // Notify owner
            if (mission.owner_id) {
              const totalAmount = (pi.amount_received / 100).toFixed(2)
              await db.functions.invoke('send-push', {
                body: {
                  userId: mission.owner_id,
                  title: '✅ Paiement confirmé',
                  body: `Paiement de ${totalAmount}€ confirmé pour votre mission.`,
                  data: { missionId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to owner failed:', err instanceof Error ? err.message : 'unknown'))
            }
          }
        }

        // Update emergency status
        if (emergencyId) {
          const { data: em } = await db
            .from('emergency_requests')
            .select('id, status, owner_id, accepted_provider_id, displacement_fee, diagnostic_fee, service_type')
            .eq('id', emergencyId)
            .single().throwOnError()

          if (em) {
            // ALWAYS trigger invoice generation (idempotent — generate-invoice has dedup)
            // This runs regardless of emergency status because the payment succeeded
            const invoiceBody = { emergencyId, stripePaymentIntentId: pi.id }
            await Promise.all([
              generateInvoice({ ...invoiceBody, invoiceType: 'service' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'service_fee' }),
              generateInvoice({ ...invoiceBody, invoiceType: 'commission' }),
            ])

            // Compute emergency amount for notification (displacement + diagnostic + accepted quote repair_cost)
            const baseFees = Number(em.displacement_fee ?? 0) + Number(em.diagnostic_fee ?? 0)
            const { data: acceptedQuote } = await db
              .from('mission_quotes')
              .select('repair_cost')
              .eq('emergency_request_id', emergencyId)
              .eq('status', 'accepted')
              .single()
            const totalAmount = baseFees + Number(acceptedQuote?.repair_cost ?? 0)

            // Notify provider
            if (em.accepted_provider_id) {
              const netAmount = ((pi.amount_received - (pi.application_fee_amount || 0)) / 100).toFixed(2)
              await db.functions.invoke('send-push', {
                body: {
                  userId: em.accepted_provider_id,
                  title: '💰 Paiement reçu',
                  body: `Vous avez reçu ${netAmount}€ pour votre intervention d'urgence${em.service_type ? ` (${getFrenchServiceLabel(em.service_type)})` : ''}.`,
                  data: { emergencyId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to emergency provider failed:', err instanceof Error ? err.message : 'unknown'))
            }

            // Notify owner
            if (em.owner_id) {
              const ownerTotal = (pi.amount_received / 100).toFixed(2)
              await db.functions.invoke('send-push', {
                body: {
                  userId: em.owner_id,
                  title: '✅ Paiement confirmé',
                  body: `Paiement de ${ownerTotal}€ confirmé pour votre urgence${em.service_type ? ` (${getFrenchServiceLabel(em.service_type)})` : ''}.`,
                  data: { emergencyId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to emergency owner failed:', err instanceof Error ? err.message : 'unknown'))
            }
          }
        }
        break
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const { missionId, emergencyId } = pi.metadata || {}
        const failureMessage = pi.last_payment_error?.message || 'Paiement échoué'

        console.error('[stripe-webhook] payment_intent.payment_failed')

        // Notify the owner that payment failed
        if (missionId) {
          const { data: mission } = await db
            .from('missions').select('owner_id').eq('id', missionId).single()
          if (mission?.owner_id) {
            await db.functions.invoke('send-push', {
              body: {
                userId: mission.owner_id,
                title: '❌ Échec du paiement',
                body: `Le paiement pour votre mission a échoué. ${failureMessage}`,
                data: { missionId },
              },
            }).catch(() => {})
          }
        }

        if (emergencyId) {
          const { data: em } = await db
            .from('emergency_requests').select('owner_id').eq('id', emergencyId).single()
          if (em?.owner_id) {
            await db.functions.invoke('send-push', {
              body: {
                userId: em.owner_id,
                title: '❌ Échec du paiement',
                body: `Le paiement pour votre urgence a échoué. ${failureMessage}`,
                data: { emergencyId },
              },
            }).catch(() => {})
          }
        }
        break
      }

      // ── Refund processed ──────────────────────────────────────────────────
      case 'charge.refunded': {
        // Capture full AND partial refunds durably before acknowledging Stripe.
        // A receipt is not a credit note or confirmation of a Connect reversal.
        await recordRefundEvent(db, {
          id: event.id, created: event.created, livemode: event.livemode,
          data: { object: event.data.object as Stripe.Charge },
        })
        break
      }

      // ── Stripe Connect account updated ────────────────────────────────────
      case 'v2.core.account[requirements].updated':
      case 'v2.core.account[configuration.recipient].capability_status_updated':
      case 'v2.core.account[configuration.recipient].updated':
      case 'v2.core.account.closed':
      case 'account.updated': {
        const accountId = event.type === 'account.updated'
          ? (event.data.object as Stripe.Account).id : event.related_object?.id
        // Fetch current state rather than applying an older event snapshot.
        // Use our platform key and a fixed SDK endpoint, never a payload URL.
        if (accountId) {
          const account = event.type === 'v2.core.account.closed'
            ? { id: accountId, closed: true }
            : await retrieveConnectAccount(connectStripe, accountId)
          await db.from('provider_profiles')
            .update(connectProfileStatus(account))
            .eq('stripe_account_id', accountId)
            .throwOnError()
        }
        break
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`)
    }

    await db.from('webhook_events_processed').update({ processing_state: 'completed', processed_at: new Date().toISOString() })
      .eq('event_id', event.id).eq('processing_token', processingToken).throwOnError()
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[stripe-webhook] Error processing ${event.type}:`, errorMsg)
    // Release this failed attempt so Stripe can retry it.
    await db.from('webhook_events_processed').delete().eq('event_id', event.id).eq('processing_token', processingToken)
    return new Response(JSON.stringify({ received: false }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
