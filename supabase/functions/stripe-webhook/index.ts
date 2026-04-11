import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') as string

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] Signature verification failed:', errMsg)
    return new Response(`Webhook signature verification failed: ${errMsg}`, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
  const db = createClient(supabaseUrl, supabaseServiceKey)

  // ── Idempotency: skip if this event was already processed ──────────────
  const { error: dedupError } = await db
    .from('webhook_events_processed')
    .insert({ event_id: event.id })
  if (dedupError) {
    // Unique constraint violation → already processed
    console.log(`[stripe-webhook] Duplicate event ${event.id}, skipping`)
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  try {
    switch (event.type) {
      // ── Payment captured successfully ─────────────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const { missionId, emergencyId } = pi.metadata || {}

        console.log('[stripe-webhook] payment_intent.succeeded')

        // Update mission status to 'paid' if still in 'validated'
        if (missionId) {
          const { data: mission } = await db
            .from('missions')
            .select('id, status, owner_id, assigned_provider_id, fixed_rate, mission_type')
            .eq('id', missionId)
            .single()

          if (mission) {
            // Update status to paid ONLY if still validated (frontend may have already done this)
            if (mission.status === 'validated') {
              await db.from('missions')
                .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
                .eq('id', missionId)
                .eq('status', 'validated')
            }

            // ALWAYS trigger invoice generation (idempotent — generate-invoice has dedup)
            // This runs regardless of mission status because the payment succeeded
            const invoiceBody = { missionId, stripePaymentIntentId: pi.id }
            await Promise.all([
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service' } }),
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service_fee' } }),
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'commission' } }),
            ]).catch((err: unknown) => console.error('[stripe-webhook] Invoice generation failed:', err instanceof Error ? err.message : 'unknown'))

            // Notify provider
            if (mission.assigned_provider_id) {
              const netAmount = Math.round((mission.fixed_rate || 0) * 0.9)
              await db.functions.invoke('send-push', {
                body: {
                  userId: mission.assigned_provider_id,
                  title: '💰 Paiement reçu',
                  body: `Vous avez reçu ${netAmount}€ pour la mission de ${mission.mission_type || 'service'}.`,
                  data: { missionId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to provider failed:', err instanceof Error ? err.message : 'unknown'))
            }

            // Notify owner
            if (mission.owner_id) {
              const totalAmount = Math.round((mission.fixed_rate || 0) * 1.1)
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
            .single()

          if (em) {
            // ALWAYS trigger invoice generation (idempotent — generate-invoice has dedup)
            // This runs regardless of emergency status because the payment succeeded
            const invoiceBody = { emergencyId, stripePaymentIntentId: pi.id }
            await Promise.all([
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service' } }),
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service_fee' } }),
              db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'commission' } }),
            ]).catch((err: unknown) => console.error('[stripe-webhook] Emergency invoice generation failed:', err instanceof Error ? err.message : 'unknown'))

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
              const netAmount = Math.round(totalAmount * 0.9)
              await db.functions.invoke('send-push', {
                body: {
                  userId: em.accepted_provider_id,
                  title: '💰 Paiement reçu',
                  body: `Vous avez reçu ${netAmount}€ pour votre intervention d'urgence${em.service_type ? ` (${em.service_type})` : ''}.`,
                  data: { emergencyId },
                },
              }).catch((err: unknown) => console.error('[stripe-webhook] Push to emergency provider failed:', err instanceof Error ? err.message : 'unknown'))
            }

            // Notify owner
            if (em.owner_id) {
              const ownerTotal = Math.round(totalAmount * 1.1)
              await db.functions.invoke('send-push', {
                body: {
                  userId: em.owner_id,
                  title: '✅ Paiement confirmé',
                  body: `Paiement de ${ownerTotal}€ confirmé pour votre urgence${em.service_type ? ` (${em.service_type})` : ''}.`,
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
        const charge = event.data.object as Stripe.Charge
        const pi = charge.payment_intent as string
        console.log('[stripe-webhook] charge.refunded')

        // Generate credit notes if refund is full
        if (charge.refunded && pi) {
          // Find related invoices and create credit notes
          const { data: invoices } = await db
            .from('invoices')
            .select('id, invoice_type, mission_id, emergency_id')
            .or(`mission_id.not.is.null,emergency_id.not.is.null`)
            // We need to find invoices linked to this PI
            // stripe_payment_intent_id may be stored on invoices

          // Log for manual follow-up — credit note generation should be triggered manually or via admin
          await db.from('audit_log').insert({
            admin_id: null,
            action: 'stripe_refund',
            target_type: 'payment',
            target_id: pi,
            metadata: { charge_id: charge.id, amount_refunded: charge.amount_refunded, refunded: charge.refunded },
          }).catch(() => {})
        }
        break
      }

      // ── Stripe Connect account updated ────────────────────────────────────
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        console.log('[stripe-webhook] account.updated')

        // Update provider_profiles with latest Stripe status
        if (account.id) {
          await db.from('provider_profiles')
            .update({
              stripe_charges_enabled: account.charges_enabled ?? false,
              stripe_payouts_enabled: account.payouts_enabled ?? false,
            })
            .eq('stripe_account_id', account.id)
            .then(() => {})
            .catch(() => console.warn('[stripe-webhook] Could not update provider profile'))
        }
        break
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[stripe-webhook] Error processing ${event.type}:`, errorMsg)
    // Return 200 to prevent Stripe from retrying (we log the error)
    return new Response(JSON.stringify({ received: true, error: errorMsg }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
