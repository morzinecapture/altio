/**
 * google-calendar-callback
 * Reçoit le redirect Google OAuth (code + state),
 * puis redirige vers l'app via deep link : altio://auth/google-calendar-callback?code=...
 *
 * Cette fonction sert de redirect_uri auprès de Google (URL HTTPS valide).
 * Google Console → Identifiants → redirect URI autorisé :
 *   https://vtybccqqbyjbmhkpliyn.supabase.co/functions/v1/google-calendar-callback
 */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // Erreur retournée par Google (ex: accès refusé)
  if (error || !code) {
    const msg = error ?? 'no_code';
    return Response.redirect(`altio://auth/google-calendar-callback?error=${encodeURIComponent(msg)}`, 302);
  }

  // Relay le code vers l'app via deep link
  return Response.redirect(
    `altio://auth/google-calendar-callback?code=${encodeURIComponent(code)}`,
    302,
  );
});
