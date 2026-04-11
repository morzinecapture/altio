/**
 * connect-google-calendar
 * Échange un authorization code Google contre access_token + refresh_token,
 * puis stocke le refresh_token dans users.google_calendar_refresh_token.
 *
 * Appelé depuis le mobile après l'OAuth :
 *   supabase.functions.invoke('connect-google-calendar', { body: { code, code_verifier } })
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!;
const REDIRECT_URI         = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')!;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Identify the caller from the JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error('Non authentifié');

    await checkRateLimit(user.id, 'connect_google_calendar', 5, 60_000);

    const { code, code_verifier } = await req.json();
    if (!code) throw new Error('Code OAuth manquant');

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
        ...(code_verifier ? { code_verifier } : {}),
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${err}`);
    }

    const tokens = await tokenRes.json();

    // Store tokens in users table
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        google_calendar_token:         tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token ?? null,
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
