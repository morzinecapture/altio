import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Payload envoyé par le Database Webhook (INSERT sur provider_profiles)
    const payload = await req.json();
    const record = payload.record;

    if (!record?.provider_id) {
      return new Response(JSON.stringify({ error: 'Missing provider_id' }), { status: 400, headers: corsHeaders });
    }

    // Récupérer le nom du prestataire
    const { data: providerUser } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', record.provider_id)
      .single();

    // Récupérer tous les admins
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('is_admin', true);

    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ message: 'No admins found' }), { headers: corsHeaders });
    }

    // Récupérer les push tokens des admins
    const adminIds = admins.map((a: any) => a.id);
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', adminIds);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No push tokens for admins' }), { headers: corsHeaders });
    }

    // Envoyer via Expo Push API
    const messages = tokens.map((t: any) => ({
      to: t.token,
      title: '🆕 Nouveau prestataire inscrit',
      body: `${providerUser?.name || 'Prestataire'} vient de s'inscrire`,
      data: { type: 'new_provider', provider_id: record.provider_id },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    // Insérer dans audit_log
    await supabase.from('audit_log').insert({
      action: 'new_provider_notification',
      target_type: 'user',
      target_id: record.provider_id,
      metadata: { provider_name: providerUser?.name, provider_email: providerUser?.email },
    });

    return new Response(
      JSON.stringify({ success: true, notified: tokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
