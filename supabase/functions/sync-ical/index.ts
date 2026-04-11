import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { property_id } = await req.json();
    if (!property_id) throw new Error('property_id requis');

    // ── Ownership check ───────────────────────────────────────────────────────
    // If called by an authenticated user (JWT), verify they own the property.
    // Cron calls use the service role key (not a JWT) → no user → skip check.
    const authHeader = req.headers.get('authorization') ?? '';
    const bearerToken = authHeader.replace('Bearer ', '').trim();

    if (bearerToken) {
      // Create a user-scoped client to resolve the JWT identity
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const icalToken = authHeader.replace('Bearer ', '').trim();
      const { data: { user }, error: authErr } = await userClient.auth.getUser(icalToken);

      // If we get a real user back, enforce ownership
      if (user && !authErr) {
        const { data: owned, error: ownErr } = await supabase
          .from('properties')
          .select('id')
          .eq('id', property_id)
          .eq('owner_id', user.id)
          .maybeSingle();

        if (ownErr || !owned) {
          return new Response(
            JSON.stringify({ error: 'Accès refusé : vous n\'êtes pas propriétaire de ce logement' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch the property's iCal URLs + owner info for notification
    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id, ical_airbnb_url, ical_booking_url, ical_url, owner_id, name')
      .eq('id', property_id)
      .single();

    if (propErr || !property) throw new Error('Logement introuvable');

    let totalImported = 0;
    const allReservationIds: string[] = [];

    // Sync each configured source
    const sources: Array<{ url: string | null; source: 'airbnb' | 'booking' }> = [
      { url: property.ical_airbnb_url || property.ical_url || null, source: 'airbnb' },
      { url: property.ical_booking_url || null,                       source: 'booking' },
    ];

    for (const { url, source } of sources) {
      if (!url) continue;
      try {
        const events = await fetchAndParseIcal(url);
        const { count, ids } = await upsertReservations(property_id, source, events);
        totalImported += count;
        allReservationIds.push(...ids);
      } catch (err) {
        console.error(`[sync-ical] Erreur import source:`, err instanceof Error ? err.message : 'unknown');
      }
    }

    // Notify the owner if new reservations were imported
    if (totalImported > 0 && property.owner_id) {
      const propName = property.name || 'votre logement';
      const body = `${totalImported} nouvelle(s) réservation(s) synchronisée(s) sur ${propName}. Planifiez vos missions ménage.`;
      try {
        await supabase.rpc('_send_push', {
          p_user_id: property.owner_id,
          p_title: '📅 Nouvelles réservations détectées',
          p_body: body,
          p_reference_id: property_id,
          p_ref_type: 'new_reservations',
        });
      } catch (err) {
        console.error('[sync-ical] Erreur notification:', err instanceof Error ? err.message : 'unknown');
      }
    }

    // Update last_ical_sync timestamp
    await supabase
      .from('properties')
      .update({ last_ical_sync: new Date().toISOString() })
      .eq('id', property_id);

    return new Response(
      JSON.stringify({ ok: true, imported: totalImported, message: `${totalImported} réservation(s) importée(s)` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[sync-ical] Error:', errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ── iCal parser ──────────────────────────────────────────────────────────────

interface IcalEvent {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
}

async function fetchAndParseIcal(url: string): Promise<IcalEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Altio/1.0' } });
  if (!res.ok) throw new Error(`Impossible de récupérer l'iCal: HTTP ${res.status}`);
  const text = await res.text();
  return parseIcal(text);
}

function parseIcal(icsText: string): IcalEvent[] {
  // RFC 5545: unfold lines (CRLF + whitespace = continuation)
  const unfolded = icsText
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const events: IcalEvent[] = [];
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);

  for (const block of blocks) {
    const endIdx = block.indexOf('END:VEVENT');
    const content = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const getField = (name: string): string => {
      // Match NAME or NAME;PARAM=VALUE: value
      const regex = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.+)$`, 'm');
      return content.match(regex)?.[1]?.trim() ?? '';
    };

    const uid     = getField('UID');
    const summary = getField('SUMMARY');
    const dtstart = parseIcalDate(getField('DTSTART'));
    const dtend   = parseIcalDate(getField('DTEND'));

    if (uid && dtstart) {
      events.push({ uid, summary, dtstart, dtend: dtend || dtstart });
    }
  }

  return events;
}

function parseIcalDate(raw: string): string {
  // Handle: 20260315 → 2026-03-15
  // Handle: 20260315T140000Z → 2026-03-15
  if (!raw) return '';
  const s = raw.trim();
  if (s.length >= 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return '';
}

// ── Upsert into reservations ────────────────────────────────────────────────

async function upsertReservations(
  propertyId: string,
  source: 'airbnb' | 'booking',
  events: IcalEvent[],
): Promise<{ count: number; ids: string[] }> {
  if (events.length === 0) return { count: 0, ids: [] };

  const rows = events.map((e) => ({
    property_id:  propertyId,
    external_id:  e.uid,
    source,
    guest_name:   cleanSummary(e.summary),
    check_in:     e.dtstart,
    check_out:    e.dtend,
  }));

  // Upsert on external_id — if same UID, update dates/name.
  const { data, error } = await supabase
    .from('reservations')
    .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false })
    .select('id');

  if (error) throw error;
  const ids = data?.map((r: { id: string }) => r.id) ?? [];
  return { count: ids.length, ids };
}

function cleanSummary(summary: string): string {
  // Airbnb: "Airbnb (Not available)" or "BLOCKED" — guest names are often hidden
  // Booking: "Booking.com (John D.)"
  if (!summary) return 'Réservation';
  if (summary.toLowerCase().includes('not available') || summary.toLowerCase().includes('blocked')) {
    return 'Indisponible';
  }
  // Strip platform prefix: "Airbnb (John)" → "John"
  const match = summary.match(/\(([^)]+)\)/);
  return match ? match[1] : summary;
}
