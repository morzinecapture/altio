import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuthOrServiceKey } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// Administrative diagnostics: booleans only; never return credentials.
Deno.serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const { user, isServiceCall } = await requireAuthOrServiceKey(req);
    if (!isServiceCall && user?.app_metadata?.qa_test !== true) {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await db.from('users').select('is_admin').eq('id', user!.id).single();
      if (!data?.is_admin) return new Response('Forbidden', { status: 403 });
    }
    const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
    let stripeAccountId: string | null = null;
    let stripeApiStatus: number | null = null;
    if (/^(sk|rk)_test_/.test(key)) {
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${key}` },
      });
      stripeApiStatus = response.status;
      if (response.ok) stripeAccountId = (await response.json()).id ?? null;
    }
    return new Response(JSON.stringify({
      stripeAccountId,
      stripeApiStatus,
      stripeMode: /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : 'missing_or_unknown',
      webhookConfigured: !!Deno.env.get('STRIPE_WEBHOOK_SECRET')?.startsWith('whsec_'),
      connectWebhookConfigured: !!Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')?.startsWith('whsec_'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch { return new Response('Unauthorized', { status: 401 }); }
});
