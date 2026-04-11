import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { assertUUID, assertString, ValidationError } from '../_shared/validate.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const reqBody = await req.json()

    // ── Input validation ──
    const userId = assertUUID(reqBody.userId, 'userId')
    const title = assertString(reqBody.title, 'title')
    const body = assertString(reqBody.body, 'body')
    const data = reqBody.data
    // Optional: persist in-app notification (reference_id + type)
    const referenceId = reqBody.referenceId || data?.missionId || data?.emergencyId || null
    const notifType = reqBody.notifType || (data?.emergencyId ? 'emergency' : 'mission')

    // Initialize Supabase Client to fetch the user's push token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing environment variables for Supabase connection")
    }

    const serviceHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    }

    // ── Persist in-app notification (using service role → bypasses RLS) ──
    // Skip if caller already inserted via RPC (skipDbInsert flag)
    if (!reqBody.skipDbInsert) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: serviceHeaders,
          body: JSON.stringify({
            user_id: userId,
            type: notifType,
            title,
            body,
            reference_id: referenceId,
          }),
        })
      } catch {
        // Non-blocking: in-app notification insert failure should not prevent push
      }
    }

    // Check if this is a marketing notification — requires explicit consent (RGPD / CPCE art. L34-5)
    const MARKETING_TYPES = ['promotion', 'marketing', 'newsletter', 'offer', 'promotional']
    const marketingCategory = data?.type || data?.category || ''
    const isMarketing = MARKETING_TYPES.includes(marketingCategory)

    if (isMarketing) {
      const consentRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=marketing_consent_at`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      )
      const consentData = await consentRes.json()
      const hasConsent = consentData?.[0]?.marketing_consent_at != null

      if (!hasConsent) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'User has not consented to marketing notifications' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }
    }

    // Try users.expo_push_token first, fallback to push_tokens table
    const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=expo_push_token`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })

    const users = await res.json()
    let pushToken = users?.[0]?.expo_push_token

    // Fallback: check the push_tokens table if users column is empty
    if (!pushToken) {
      const ptRes = await fetch(`${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${userId}&select=token&order=updated_at.desc&limit=1`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      })
      const ptData = await ptRes.json()
      pushToken = ptData?.[0]?.token
    }

    if (!pushToken) {
      return new Response(JSON.stringify({ ok: true, pushed: false, reason: "User has no push token" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Send the notification using Expo Push API
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data || {},
      }),
    })

    const expoData = await expoRes.json()

    return new Response(JSON.stringify({ success: true, expoResponse: expoData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
