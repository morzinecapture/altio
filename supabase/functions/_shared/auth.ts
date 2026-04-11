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

  console.log('[auth] User authenticated:', user.id)
  return { user, token }
}

/**
 * Accepts either an internal service key (x-service-key header)
 * or a valid user JWT. Useful for functions called by users AND
 * by other Edge Functions.
 */
export async function requireAuthOrServiceKey(req: Request): Promise<AuthResult> {
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
