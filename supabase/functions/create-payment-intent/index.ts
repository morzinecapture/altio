import { recordEarlyExecutionConsent } from '../_shared/early-execution-consent.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { connectStripe } from '../_shared/stripe-connect.ts'
import { requireConnectSplit } from '../_shared/connect-split.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { requireAuth } from '../_shared/auth.ts'
import { ValidationError } from '../_shared/validate.ts'
import { resolvePaymentOrder } from '../_shared/payment-order.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
    apiVersion: '2022-11-15',
    httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const { user } = await requireAuth(req)

        const input = await req.json()
        await checkRateLimit(user.id, 'create_payment_intent', 5, 60_000)
        const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const order = await resolvePaymentOrder(user.id, input, async (table, id) => {
            const columns = table === 'mission_quotes' ? '*, line_items:quote_line_items(*)' : '*'
            const { data, error } = await db.from(table).select(columns).eq('id', id).maybeSingle()
            if (error) throw new Error('Impossible de vérifier la commande')
            return data
        })
        const executionConsentId = await recordEarlyExecutionConsent(db, user.id, order.metadata, input.executionConsent)
        // No charge may start while its confirmation webhook is unconfigured.
        if (!Deno.env.get('STRIPE_WEBHOOK_SECRET')?.startsWith('whsec_')) {
            return new Response(JSON.stringify({ error: 'Paiement temporairement indisponible : configuration en cours.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503,
            })
        }
        const { data: profile, error } = await db.from('provider_profiles')
            .select('stripe_account_id').eq('provider_id', order.providerId).single()
        if (error || !profile?.stripe_account_id) throw new ValidationError('Le prestataire doit finaliser son compte de paiement')
        const split = await requireConnectSplit(connectStripe, profile.stripe_account_id, order.amount, order.applicationFee)
        const reference = order.metadata.quoteId || order.metadata.bidId || order.metadata.missionId
        const paymentIntent = await stripe.paymentIntents.create({
            amount: order.amount,
            currency: 'eur',
            capture_method: order.captureMethod,
            metadata: {...order.metadata,...(executionConsentId?{executionConsentId}:{})},
            ...split,
        }, { idempotencyKey: `${order.metadata.emergencyId ? 'altio-completion-v2' : 'altio-v4'}:${user.id}:${reference}:${order.amount}:${order.captureMethod}` })
        // accept_emergency_bid only assigns a bid with an authorization Altio issued for it.
        if (order.metadata.emergencyId && order.metadata.bidId) {
            const { error: recordError } = await db.from('emergency_bid_payments').upsert({
                payment_intent_id: paymentIntent.id,
                emergency_id: order.metadata.emergencyId,
                bid_id: order.metadata.bidId,
                owner_id: user.id,
                amount_cents: order.amount,
            }, { onConflict: 'payment_intent_id' })
            if (recordError) throw new Error('Impossible d’enregistrer le paiement')
        }

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return new Response(JSON.stringify({ error: error.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }
        const errMsg = error instanceof Error ? error.message : String(error)
        const isAuthError = errMsg.includes('authorization') || errMsg.includes('token')
        if (isAuthError) {
            return new Response(JSON.stringify({ error: errMsg }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }
        const stripeError = error as { message?: string; type?: string; code?: string }
        console.error('create-payment-intent error:', stripeError.message, stripeError.type || '', stripeError.code || '')
        const message = stripeError.message === 'Le compte de paiement du prestataire n’est pas encore actif'
            ? stripeError.message
            : 'Le paiement est temporairement indisponible. Réessaie dans quelques instants.'
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
