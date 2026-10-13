import { requireActiveSession } from './active-session.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { User } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuthResult = {
  user: User | null
  isServiceCall: boolean
  token?: string
}

/**
 * Validates the JWT from the Authorization header.
 * Throws if the token is missing or invalid.
 */
export async function requireAuth(req: Request): Promise<{ user: User; token: string }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }

  const token = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

  // Utiliser service_role_key pour valider le token — c'est le pattern recommandé
  // pour les Edge Functions Supabase (le anonKey + global headers ne marche pas en Deno)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    console.error('[auth] getUser failed:', error?.message, '| token length:', token.length)
    throw new Error('Invalid or expired token')
  }

  await requireActiveSession(supabase, user.id, token)
  return { user, token }
}

/**
 * Accepts either an internal service key (x-service-key header)
 * or a valid user JWT. Useful for functions called by users AND
 * by other Edge Functions.
 */
export async function requireAuthOrServiceKey(req: Request): Promise<AuthResult> {
  // Current supabase-js sends secret API keys in apikey, without Authorization.
  // Match only configured server secrets; a prefix alone is not authentication.
  const apiKey = req.headers.get('apikey')
  if (apiKey?.startsWith('sb_secret_')) {
    const configuredKeys: unknown[] = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
      if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
        configuredKeys.push(...Object.values(keys))
      }
    } catch {
      // Fail closed; legacy service and user authentication remain available.
    }
    if (configuredKeys.some(key => typeof key === 'string' && key === apiKey)) {
      return { user: null, isServiceCall: true }
    }
  }

  // Méthode 1 : header x-service-key custom
  const serviceKey = req.headers.get('x-service-key')
  const internalKey = Deno.env.get('INTERNAL_SERVICE_KEY')
  if (internalKey && serviceKey === internalKey) {
    console.log('[auth] Service call authenticated via x-service-key')
    return { user: null, isServiceCall: true }
  }

  // Méthode 2 : le token Authorization EST la service_role_key
  // (cas où une Edge Function appelle une autre via db.functions.invoke)
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseServiceKey && token === supabaseServiceKey) {
      console.log('[auth] Service call authenticated via service_role_key')
      return { user: null, isServiceCall: true }
    }
  }

  // Méthode 3 : JWT utilisateur classique
  const { user, token } = await requireAuth(req)
  return { user, isServiceCall: false, token }
}
