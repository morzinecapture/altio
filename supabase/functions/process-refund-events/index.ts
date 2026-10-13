import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuthOrServiceKey } from '../_shared/auth.ts';
import { connectStripe } from '../_shared/stripe-connect.ts';
import { reconcileProportionalRefund } from '../_shared/proportional-refund-reconciliation.ts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  const workerKey = Deno.env.get('COMPLETION_WORKER_KEY');
  try {
    const auth = workerKey && req.headers.get('x-service-key') === workerKey ? { isServiceCall: true } : await requireAuthOrServiceKey(req);
    if (!auth.isServiceCall) return json({ error: 'Accès réservé au serveur' }, 403);
  } catch { return json({ error: 'Authentification requise' }, 401); }
  if (new URL(req.url).searchParams.get('check') === 'configuration') return json({ ok: Boolean(workerKey && Deno.env.get('STRIPE_SECRET_KEY')), workerConfigured: Boolean(workerKey) });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: receipts, error } = await db.from('stripe_refund_events').select('event_id,charge_id,payment_intent_id,livemode')
      .eq('reconciliation_state', 'pending').order('last_attempt_at', { ascending: true, nullsFirst: true }).limit(3);
    if (error || !receipts) throw new Error('Lecture indisponible');
    let completed = 0; let pending = 0; const seen = new Set<string>();
    for (const receipt of receipts) {
      if (seen.has(receipt.charge_id)) continue;
      seen.add(receipt.charge_id);
      const { error: attemptError } = await db.from('stripe_refund_events').update({ last_attempt_at: new Date().toISOString() })
        .eq('charge_id', receipt.charge_id).eq('reconciliation_state', 'pending');
      if (attemptError) throw new Error('Suivi des relances indisponible');
      try {
        const result = await reconcileProportionalRefund(db, connectStripe, receipt);
        if (result.completed) { completed++; continue; }
        throw new Error(result.reason);
      } catch {
        pending++;
        const { error: recordError } = await db.from('stripe_refund_events').update({ last_error: 'Rapprochement ou émission des avoirs à terminer' })
          .eq('charge_id', receipt.charge_id).eq('reconciliation_state', 'pending');
        if (recordError) throw new Error('Suivi des erreurs indisponible');
      }
    }
    return json({ ok: pending === 0, completed, pending }, pending ? 503 : 200);
  } catch { return json({ error: 'Traitement temporairement indisponible' }, 503); }
});
