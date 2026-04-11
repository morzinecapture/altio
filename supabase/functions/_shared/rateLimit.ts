import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Simple DB-based rate limiter for Supabase Edge Functions.
 * Uses the rate_limit_log table (created in Sprint 6 migration).
 *
 * @param userId  - ID of the calling user
 * @param action  - Identifier for the action (e.g. 'create_payment_intent')
 * @param max     - Max requests allowed in the time window
 * @param windowMs - Time window in ms (default: 60 000 = 1 minute)
 */
export async function checkRateLimit(
  userId: string,
  action: string,
  max = 10,
  windowMs = 60_000,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
  const db = createClient(supabaseUrl, serviceKey)

  const since = new Date(Date.now() - windowMs).toISOString()

  const { count, error } = await db
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', since)

  if (error) {
    // Non-blocking: if we can't check, let the request through
    console.warn('[rateLimit] Could not check rate limit:', error.message)
    return
  }

  if (count !== null && count >= max) {
    throw new Error(`Rate limit exceeded (${max} requests/${windowMs / 1000}s). Réessayez dans quelques instants.`)
  }

  // Log this request
  try {
    await db.from('rate_limit_log').insert({ user_id: userId, action });
  } catch (e: unknown) {
    console.warn('[rateLimit] Insert failed:', e instanceof Error ? e.message : String(e));
  }
}
