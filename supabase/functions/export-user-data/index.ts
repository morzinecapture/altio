import { exportUserData } from '../_shared/user-data-export.ts'
import { requireActiveSession } from '../_shared/active-session.ts'
// RGPD — Droit a la portabilite des donnees (art. 20 RGPD)
// L'utilisateur peut exporter l'ensemble de ses donnees personnelles.
// Delai legal de reponse : 1 mois maximum (art. 12 RGPD).
// En cas de complexite, ce delai peut etre prolonge de 2 mois supplementaires
// avec notification a l'utilisateur.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if(req.method !== 'POST') return new Response(null,{status:405,headers:corsHeaders});
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

    // Authenticate the user via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized: invalid token')

    const userId = user.id

    // Use service role to fetch data across all tables (bypasses RLS)
    const db = createClient(supabaseUrl, supabaseServiceKey)

    await requireActiveSession(db, user.id, token)

    const exportData = await exportUserData(db, userId)

    return new Response(
      JSON.stringify(exportData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Export indisponible. Reconnectez-vous puis réessayez.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        status: 400,
      }
    )
  }
})
