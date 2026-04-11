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

    // Fetch all user data in parallel
    const [
      profileResult,
      propertiesResult,
      missionsResult,
      quotesResult,
      invoicesResult,
      reclamationsResult,
      reviewsResult,
    ] = await Promise.all([
      // Profile
      db.from('profiles').select('*').eq('id', userId).single(),

      // Properties owned by the user
      db.from('properties').select('*').eq('owner_id', userId),

      // Missions created by or assigned to the user
      db.from('missions').select('*').or(`owner_id.eq.${userId},provider_id.eq.${userId}`),

      // Quotes submitted by or received by the user
      db.from('mission_quotes').select('*').or(`provider_id.eq.${userId},owner_id.eq.${userId}`),

      // Invoices where the user is seller or buyer
      db.from('invoices').select('*').or(`seller_id.eq.${userId},buyer_id.eq.${userId}`),

      // Reclamations filed by or concerning the user
      db.from('reclamations').select('*').or(`user_id.eq.${userId},owner_id.eq.${userId},provider_id.eq.${userId}`),

      // Reviews given by or received by the user
      db.from('reviews').select('*').or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`),
    ])

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      data: {
        profile: profileResult.data ?? null,
        properties: propertiesResult.data ?? [],
        missions: missionsResult.data ?? [],
        quotes: quotesResult.data ?? [],
        invoices: invoicesResult.data ?? [],
        reclamations: reclamationsResult.data ?? [],
        reviews: reviewsResult.data ?? [],
      },
    }

    return new Response(
      JSON.stringify(exportData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
