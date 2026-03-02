import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Configure CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, title, body, data } = await req.json()

    if (!userId || !title || !body) {
      throw new Error("Missing required parameters: userId, title, body")
    }

    // Initialize Supabase Client to fetch the user's push token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing environment variables for Supabase connection")
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=expo_push_token`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    })

    const users = await res.json()
    const pushToken = users?.[0]?.expo_push_token

    if (!pushToken) {
      return new Response(JSON.stringify({ error: "User has no push token" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Still return 200 so the frontend doesn't crash, but it just skips
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

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
