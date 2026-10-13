import Stripe from 'npm:stripe@^14.0.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { verifyCaptureOrder } from '../_shared/capture-order.ts';
import { assertUUID, assertString } from '../_shared/validate.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2022-11-15', httpClient: Stripe.createFetchHttpClient() });
Deno.serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const { user } = await requireAuth(req);
    const body = await req.json();
    const missionId = assertUUID(body.missionId, 'missionId');
    const paymentIntentId = assertString(body.paymentIntentId, 'paymentIntentId');
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: mission, error } = await db.from('missions').select('*').eq('id', missionId).single();
    if (error || !mission || mission.owner_id !== user.id) return new Response('Forbidden', { status: 403 });
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded' || intent.metadata.quoteId) throw new Error('Paiement de mission non confirmé');
    verifyCaptureOrder(user.id, mission, intent, { missionId });
    await db.from('missions').update({ status: 'paid', paid_at: mission.paid_at || new Date().toISOString(), stripe_payment_intent_id: intent.id })
      .eq('id', missionId).in('status', ['validated','paid']).throwOnError();
    return new Response(JSON.stringify({ ok: true, status: 'paid' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Confirmation impossible' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
