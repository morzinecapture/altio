import { requireActiveSession } from '../_shared/active-session.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { connectStripe } from '../_shared/stripe-connect.ts'
import { retrieveConnectAccount, connectProfileStatus, recipientAccountParams, onboardingLinkParams, connectErrorMessage } from '../_shared/connect-account.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ValidationError } from '../_shared/validate.ts'

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

        // Use service role for DB operations (bypasses RLS)
        const db = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        await requireActiveSession(db, user.id, token)
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
            if (!user.email) throw new ValidationError('Adresse e-mail du prestataire manquante')
            const account = await connectStripe.v2.core.accounts.create(
                recipientAccountParams(user.id, user.email),
                { idempotencyKey: `altio-connect-v2:${user.id}` },
            );
            accountId = account.id;

            const { error: updateError } = await db
                .from('provider_profiles')
                .update({ stripe_account_id: accountId })
                .eq('provider_id', user.id).select('stripe_account_id').single();

            if (updateError) throw new Error(`Could not update profile with Stripe ID: ${updateError.message}`)
        }

        // Check current account status and sync to DB
        const account = await retrieveConnectAccount(connectStripe, accountId)
        const status = connectProfileStatus(account)
        const onboardingComplete = status.stripe_onboarding_complete

        await db
            .from('provider_profiles')
            .update(status)
            .eq('provider_id', user.id).throwOnError()

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
        const accountLink = await connectStripe.v2.core.accountLinks.create(onboardingLinkParams(accountId, baseUrl));

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
        return new Response(JSON.stringify({ error: connectErrorMessage(error), url: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
