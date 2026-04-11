import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ValidationError } from '../_shared/validate.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
    apiVersion: '2022-11-15',
    httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Extract the JWT token from the Authorization header
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) throw new ValidationError("Unauthorized: missing authorization token")

        // Use anon client for auth verification — pass token explicitly
        const anonClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        )
        const { data: { user }, error: userError } = await anonClient.auth.getUser(token)
        if (userError || !user) throw new ValidationError("Unauthorized: valid authentication required")

        console.log('[create-connect-account] User:', user.id, user.email)

        // Use service role for DB operations (bypasses RLS)
        const db = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        await checkRateLimit(user.id, 'create_connect_account', 5, 60_000)

        // Get the provider profile to see if they already have an account
        const { data: profile, error: profileError } = await db
            .from('provider_profiles')
            .select('stripe_account_id')
            .eq('provider_id', user.id)
            .single()

        if (profileError) throw new ValidationError(`Could not fetch provider profile: ${profileError.message}`)

        let accountId = profile.stripe_account_id;

        // If no Stripe Connect account exists, create one
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'FR',
                email: user.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            accountId = account.id;

            const { error: updateError } = await db
                .from('provider_profiles')
                .update({ stripe_account_id: accountId })
                .eq('provider_id', user.id);

            if (updateError) throw new Error(`Could not update profile with Stripe ID: ${updateError.message}`)
        }

        // Check current account status and sync to DB
        const account = await stripe.accounts.retrieve(accountId)
        const chargesEnabled = account.charges_enabled ?? false
        const payoutsEnabled = account.payouts_enabled ?? false
        const onboardingComplete = chargesEnabled && payoutsEnabled

        await db
            .from('provider_profiles')
            .update({
                stripe_charges_enabled: chargesEnabled,
                stripe_payouts_enabled: payoutsEnabled,
                stripe_onboarding_complete: onboardingComplete,
            })
            .eq('provider_id', user.id)

        // If onboarding is already complete, no need to redirect
        if (onboardingComplete) {
            return new Response(
                JSON.stringify({ url: null, onboarding_complete: true }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                }
            )
        }

        // Create an account link for onboarding
        const baseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://altio.app'
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${baseUrl}/functions/v1/stripe-redirect?type=refresh`,
            return_url: `${baseUrl}/functions/v1/stripe-redirect?type=success`,
            type: 'account_onboarding',
        });

        return new Response(
            JSON.stringify({ url: accountLink.url, onboarding_complete: false }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[create-connect-account] Error:', msg)
        return new Response(JSON.stringify({ error: msg, url: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
