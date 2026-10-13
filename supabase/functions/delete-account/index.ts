import { requireActiveSession } from '../_shared/active-session.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { authorizeAccountDeletion } from '../_shared/account-deletion-authorization.ts'
import { processAccountErasure } from '../_shared/account-erasure-worker.ts'
import { assertAccountDeletionReady } from '../_shared/account-deletion-data.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // Verify the caller is authenticated via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

    // Client scoped to the calling user (for RLS-safe reads)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve the caller's user id from their token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await userClient.auth.getUser(token)
    if (userError || !user) throw new Error('Invalid or expired token')

    await requireActiveSession(adminClient, user.id, token)
    const userId = user.id

    // Rate limiting: max 3 delete attempts per 24h (security)
    await checkRateLimit(userId, 'delete_account', 3, 86_400_000)

    // Read-only check before consuming the one-use Apple authorization code.
    await assertAccountDeletionReady(adminClient, userId)
    const body = await req.json().catch(() => null)
    await authorizeAccountDeletion(user, body, name => Deno.env.get(name))
    const { data: job, error: startError } = await adminClient.rpc('begin_account_erasure', { p_user_id: userId })
    if (startError || !job?.id) throw new Error('La demande de suppression n’a pas été enregistrée. Réessayez.')
    const result = await processAccountErasure(adminClient, job.id)

    return new Response(
      JSON.stringify(result.completed ? { success: true } : { success: false, accepted: true, status: 'processing', requestId: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: result.completed ? 200 : 202 }
    )
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
