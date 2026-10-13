import { requireActiveSession } from '../_shared/active-session.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { assertAccountDeletionReady } from '../_shared/account-deletion-data.ts';
import { prepareAccountDeletion } from '../_shared/account-deletion-authorization.ts';

Deno.serve(async req => {
  const cors = handleCors(req);
  if (cors) return cors;
  const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method !== 'POST') return reply({ error: 'Méthode non autorisée' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Connexion requise' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !user) return reply({ error: 'Connexion requise' }, 401);
  try {
    await requireActiveSession(db, user.id, authorization.slice(7));
    await assertAccountDeletionReady(db, user.id);
    return reply(await prepareAccountDeletion(user, name => Deno.env.get(name)), 200);
  } catch {
    return reply({ error: 'La suppression est momentanément indisponible pour ce compte. Aucune donnée n’a été supprimée.' }, 503);
  }
});
