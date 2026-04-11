import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { requireAuth } from '../_shared/auth.ts'
import { assertPositiveInt, assertOneOf, assertUUID, ValidationError } from '../_shared/validate.ts'
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

        let { amount, captureMethod, metadata } = await req.json()
        let destination = null;
        let application_fee_amount = null;

        // ── Input validation ──
        amount = assertPositiveInt(amount, 'amount', 99999900)
        if (amount < 50) {
            throw new ValidationError(`Le montant minimum est de 0.50€ (reçu: ${(amount / 100).toFixed(2)}€)`)
        }
        if (captureMethod !== undefined && captureMethod !== null) {
            captureMethod = assertOneOf(captureMethod, 'captureMethod', ['automatic', 'manual'] as const)
        }
        if (metadata?.missionId) {
            metadata.missionId = assertUUID(metadata.missionId, 'metadata.missionId')
        }
        if (metadata?.emergencyId) {
            metadata.emergencyId = assertUUID(metadata.emergencyId, 'metadata.emergencyId')
        }
        if (metadata?.bidId) {
            metadata.bidId = assertUUID(metadata.bidId, 'metadata.bidId')
        }
        if (metadata?.quoteId) {
            metadata.quoteId = assertUUID(metadata.quoteId, 'metadata.quoteId')
        }

        // Setup supabase to fetch the Connect Account ID securely
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')

        // Rate limiting: 5 payment intents per minute per user
        await checkRateLimit(user.id, 'create_payment_intent', 5, 60_000)

        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey, {
                global: { headers: { Authorization: req.headers.get('Authorization')! } }
            });

            let targetProviderId = null;

            if (metadata?.missionId) {
                const { data: mission } = await supabase.from('missions').select('assigned_provider_id').eq('id', metadata.missionId).single();
                if (mission?.assigned_provider_id) targetProviderId = mission.assigned_provider_id;
            } else if (metadata?.bidId) {
                const { data: bid } = await supabase.from('emergency_bids').select('provider_id').eq('id', metadata.bidId).single();
                if (bid?.provider_id) targetProviderId = bid.provider_id;
            } else if (metadata?.quoteId) {
                const { data: quote } = await supabase.from('mission_quotes').select('provider_id').eq('id', metadata.quoteId).single();
                if (quote?.provider_id) targetProviderId = quote.provider_id;
            } else if (metadata?.emergencyId) {
                const { data: emergency } = await supabase.from('emergency_requests').select('accepted_provider_id').eq('id', metadata.emergencyId).single();
                if (emergency?.accepted_provider_id) targetProviderId = emergency.accepted_provider_id;
            }

            if (targetProviderId) {
                const { data: profile } = await supabase.from('provider_profiles').select('stripe_account_id').eq('provider_id', targetProviderId).single();
                if (profile?.stripe_account_id) {
                    destination = profile.stripe_account_id;
                    // Altio 10%+10% commission model:
                    // - Owner pays: providerRate * 1.10 (amount already includes 10% service fee)
                    // - Provider receives: providerRate * 0.90 (providerRate minus 10% commission)
                    // - Altio keeps: amount - providerRate * 0.90 = amount * 2/11 ≈ 18.18% of total
                    //   (= 10% service fee from owner + 10% commission from provider)
                    application_fee_amount = Math.round(amount * 2 / 11);
                } else {
                    console.warn('[create-payment-intent] Provider has no Stripe account, manual transfer required')
                    metadata = { ...metadata, needs_manual_transfer: 'true' }
                }
            }
        }

        const intentParams: Stripe.PaymentIntentCreateParams = {
            amount: Math.round(amount),
            currency: 'eur',
            capture_method: captureMethod || 'automatic',
            metadata: metadata || {},
        };

        if (destination) {
            // Verify the Connect account exists and is usable before adding transfer_data
            try {
                const account = await stripe.accounts.retrieve(destination)
                if (account.charges_enabled) {
                    intentParams.transfer_data = {
                        destination: destination,
                    };
                    if (application_fee_amount) {
                        intentParams.application_fee_amount = application_fee_amount;
                    }
                } else {
                    console.warn('[create-payment-intent] Connect account has charges_enabled=false, creating payment without transfer')
                    intentParams.metadata = { ...intentParams.metadata, needs_manual_transfer: 'true' }
                }
            } catch (_stripeErr: unknown) {
                console.warn('[create-payment-intent] Could not verify Connect account, creating payment without transfer')
                intentParams.metadata = { ...intentParams.metadata, needs_manual_transfer: 'true' }
            }
        }

        const paymentIntent = await stripe.paymentIntents.create(intentParams)

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
        const message = stripeError.type === 'StripeInvalidRequestError'
            ? `Erreur Stripe: ${stripeError.message}`
            : stripeError.message || 'Erreur inconnue'
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
