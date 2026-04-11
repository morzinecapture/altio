/**
 * sync-google-calendar
 * Crée ou supprime un event Google Calendar pour une mission.
 *
 * Body: { mission_id: string, action: 'create' | 'delete' }
 *
 * Déclenché par :
 *   - acceptDirectMission → action: 'create'
 *   - handleApplication (accept) → action: 'create'
 *   - Annulation mission → action: 'delete'
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { mission_id, action } = await req.json() as { mission_id: string; action: 'create' | 'delete' };
    if (!mission_id || !action) throw new Error('mission_id et action requis');

    // Fetch mission + property + assigned provider
    const { data: mission, error: mErr } = await supabase
      .from('missions')
      .select(`
        id, mission_type, scheduled_date, google_event_id,
        assigned_provider_id,
        properties ( name, address )
      `)
      .eq('id', mission_id)
      .single();

    if (mErr || !mission) throw new Error('Mission introuvable');
    if (!mission.assigned_provider_id) throw new Error('Aucun prestataire assigné');

    // Fetch provider's Google tokens
    const { data: providerUser } = await supabase
      .from('users')
      .select('google_calendar_token, google_calendar_refresh_token')
      .eq('id', mission.assigned_provider_id)
      .single();

    if (!providerUser?.google_calendar_token && !providerUser?.google_calendar_refresh_token) {
      // Provider hasn't connected Google Calendar — nothing to do, not an error
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'Google Calendar non connecté' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get a valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(
      providerUser.google_calendar_token,
      providerUser.google_calendar_refresh_token,
      mission.assigned_provider_id,
    );

    if (action === 'create') {
      const eventId = await createCalendarEvent(accessToken, mission);
      // Store the event ID so we can delete it later
      await supabase.from('missions').update({ google_event_id: eventId }).eq('id', mission_id);
      return new Response(
        JSON.stringify({ ok: true, event_id: eventId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'delete') {
      if (mission.google_event_id) {
        await deleteCalendarEvent(accessToken, mission.google_event_id);
        await supabase.from('missions').update({ google_event_id: null }).eq('id', mission_id);
      }
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    throw new Error('Action invalide');
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[sync-google-calendar]', errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ── Token refresh ─────────────────────────────────────────────────────────────

async function getValidAccessToken(
  accessToken: string | null,
  refreshToken: string | null,
  userId: string,
): Promise<string> {
  // Try existing token first with a quick validation
  if (accessToken) {
    const check = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken);
    if (check.ok) return accessToken;
  }

  // Refresh
  if (!refreshToken) throw new Error('Pas de refresh token — reconnectez Google Calendar');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error('Impossible de rafraîchir le token Google');

  const data = await res.json();

  // Persist the new access token
  await supabase.from('users').update({ google_calendar_token: data.access_token }).eq('id', userId);

  return data.access_token;
}

// ── Google Calendar API calls ─────────────────────────────────────────────────

const MISSION_TYPE_FR: Record<string, string> = {
  cleaning:    'Ménage',
  linen:       'Linge',
  maintenance: 'Maintenance',
};

interface MissionWithProperty {
  id: string;
  mission_type: string;
  scheduled_date: string | null;
  google_event_id: string | null;
  assigned_provider_id: string | null;
  properties: { name: string; address: string } | null;
}

async function createCalendarEvent(accessToken: string, mission: MissionWithProperty): Promise<string> {
  const property = mission.properties;
  const scheduledDate = mission.scheduled_date ? new Date(mission.scheduled_date) : new Date();
  const endDate = new Date(scheduledDate.getTime() + 2 * 60 * 60 * 1000); // +2h par défaut

  const event = {
    summary:  `Mission Altio — ${MISSION_TYPE_FR[mission.mission_type] ?? mission.mission_type}`,
    location: property?.address ?? '',
    description: `Logement : ${property?.name ?? ''}\nID mission : ${mission.id}`,
    start: { dateTime: scheduledDate.toISOString(), timeZone: 'Europe/Paris' },
    end:   { dateTime: endDate.toISOString(),        timeZone: 'Europe/Paris' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup',  minutes: 60 },
        { method: 'popup',  minutes: 1440 }, // 24h avant
      ],
    },
  };

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar create failed: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // 404 = already deleted, not an error
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Calendar delete failed: ${res.status}`);
  }
}
