import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'npm:stripe@^14.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertString, assertUUID, assertPositiveInt, ValidationError } from '../_shared/validate.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { keepAlive } from '../_shared/background.ts'
import { verifyCaptureOrder } from '../_shared/capture-order.ts'
import { assertConnectIntent } from '../_shared/connect-split.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
    apiVersion: '2022-11-15',
    httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const { user } = await requireAuth(req)

        const body = await req.json()

        // ── Input validation ──
        const paymentIntentId = assertString(body.paymentIntentId, 'paymentIntentId')
        if (!paymentIntentId.startsWith('pi_')) {
            throw new ValidationError('paymentIntentId must start with "pi_"')
        }
        const missionId = body.missionId ? assertUUID(body.missionId, 'missionId') : undefined
        const emergencyId = body.emergencyId ? assertUUID(body.emergencyId, 'emergencyId') : undefined
        if (Boolean(missionId) === Boolean(emergencyId)) throw new ValidationError('Une seule mission ou urgence est obligatoire')
        const amountToCapture = body.amountToCapture ? assertPositiveInt(body.amountToCapture, 'amountToCapture') : undefined

        // ── Create service_role client for ownership check + later DB ops ──
        const supabaseUrl     = Deno.env.get('SUPABASE_URL') as string
        const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
        const db = createClient(supabaseUrl, supabaseService)

        let source: Record<string, unknown>;
        // Ownership, business state and Stripe metadata must all agree.
        if (missionId) {
            const { data: mData, error: mErr } = await db.from('missions').select('*').eq('id', missionId).single()
            if (mErr || !mData) throw new Error("Mission introuvable")
            if (mData.owner_id !== user.id && mData.assigned_provider_id !== user.id) throw new Error("Vous n'êtes pas autorisé à capturer ce paiement")
            source = mData;
        } else if (emergencyId) {
            const { data: eData, error: eErr } = await db.from('emergency_requests').select('*').eq('id', emergencyId).single()
            if (eErr || !eData) throw new Error("Urgence introuvable")
            if (eData.owner_id !== user.id && eData.accepted_provider_id !== user.id) throw new Error("Vous n'êtes pas autorisé à capturer ce paiement")
            source = eData;
        }

        const captureOptions: Record<string, unknown> = {}
        if (amountToCapture) {
            captureOptions.amount_to_capture = Math.round(amountToCapture)
        }

        const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
        if (existingIntent.metadata?.completionFlow === 'v1') throw new ValidationError('Utilisez la validation de l’étape ; capture directe interdite')
        verifyCaptureOrder(user.id, source!, existingIntent, { missionId, emergencyId }, amountToCapture)
        const { data: payee, error: payeeError } = await db.from('provider_profiles').select('stripe_account_id')
          .eq('provider_id', source!.assigned_provider_id || source!.accepted_provider_id).single()
        if (payeeError) throw new Error('Vérification du bénéficiaire indisponible')
        assertConnectIntent(existingIntent, payee?.stripe_account_id)
        if (existingIntent.status === 'succeeded') {
            return new Response(JSON.stringify({ success: true, alreadyCaptured: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            })
        }
        const intent = await stripe.paymentIntents.capture(paymentIntentId, captureOptions, { idempotencyKey: `altio-capture:${paymentIntentId}` })

        // ── Trigger invoice generation after successful capture ────────────────
        const invoiceSourceId = missionId || emergencyId
        if (invoiceSourceId && intent.status === 'succeeded') {

            // Fire-and-forget — invoice generation failure must not block payment
            // 3 invoices for the 10%+10% model:
            //   1. 'service'        — provider → owner (provider's rate for the mission)
            //   2. 'service_fee'    — Altio → owner (10% service fee charged to owner)
            //   3. 'commission'     — Altio → provider (10% commission deducted from provider)
            const invoiceBody = missionId
                ? { missionId, stripePaymentIntentId: paymentIntentId }
                : { emergencyId, stripePaymentIntentId: paymentIntentId }
            // Generate 3 invoices (fire-and-forget)
            const invoiceHeaders = { 'x-service-key': Deno.env.get('INTERNAL_SERVICE_KEY') || '' }
            keepAlive(
                Promise.all([
                    db.functions.invoke('generate-invoice', {
                        body: { ...invoiceBody, invoiceType: 'service' },
                        headers: invoiceHeaders,
                    }),
                    db.functions.invoke('generate-invoice', {
                        body: { ...invoiceBody, invoiceType: 'service_fee' },
                        headers: invoiceHeaders,
                    }),
                    db.functions.invoke('generate-invoice', {
                        body: { ...invoiceBody, invoiceType: 'commission' },
                        headers: invoiceHeaders,
                    }),
                ]),
                'Invoice generation error',
            )

            // ── Art. 242 bis CGI — Notify provider of fiscal/social obligations ──
            // Obligation: inform each provider at every transaction that revenue
            // is taxable and subject to social contributions. Fine: 50 000 €.
            let providerId: string | null = null
            if (missionId) {
                const { data: mData } = await db.from('missions').select('assigned_provider_id').eq('id', missionId).single()
                providerId = mData?.assigned_provider_id || null
            } else if (emergencyId) {
                const { data: eData } = await db.from('emergency_requests').select('accepted_provider_id').eq('id', emergencyId).single()
                providerId = eData?.accepted_provider_id || null
            }

            if (providerId) {
                // DB notification
                keepAlive(
                    db.from('notifications').insert({
                        user_id: providerId,
                        type: 'fiscal_reminder',
                        title: 'Rappel obligations fiscales',
                        body: 'Les revenus perçus via Altio sont soumis à l\'impôt sur le revenu et aux cotisations sociales. Plus d\'informations : impots.gouv.fr et urssaf.fr',
                    }).then(() => {}),
                    'Fiscal notification error',
                )

                // Push notification (Art. 242 bis CGI — 50 000€ fine if missing)
                keepAlive(
                    db.functions.invoke('send-push', {
                        body: {
                            userId: providerId,
                            title: '📋 Rappel fiscal',
                            body: 'Les revenus perçus via Altio sont imposables et soumis aux cotisations sociales. Consultez impots.gouv.fr pour plus d\'informations.',
                            data: { type: 'fiscal_reminder' },
                        },
                    }),
                    'Fiscal push error',
                )

                // Notify provider that an invoice was issued in their name (mandate)
                keepAlive(
                    db.functions.invoke('send-push', {
                        body: {
                            userId: providerId,
                            title: '🧾 Facture émise en votre nom',
                            body: 'Une facture de prestation a été émise par Altio en votre nom (mandat de facturation). Consultez vos factures dans l\'app.',
                            data: { type: 'invoice_mandate', missionId, emergencyId },
                        },
                    }),
                    'Invoice mandate push error',
                )
            }
        }

        return new Response(
            JSON.stringify({ success: true, intent }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error) {
        if (error instanceof ValidationError) {
            return new Response(JSON.stringify({ error: error.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }
        const msg = error instanceof Error ? error.message : String(error)
        const isAuthError = /authorization|token|autorisé/i.test(msg)
        return new Response(JSON.stringify({ error: msg }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: isAuthError ? 401 : 400,
        })
    }
})
