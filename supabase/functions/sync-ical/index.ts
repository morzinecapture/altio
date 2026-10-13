import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuthOrServiceKey } from '../_shared/auth.ts';
import { fetchCalendar } from '../_shared/ical.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async req => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  // The existing internal worker credential is already held by Vault and Edge
  // Functions. Never treat a failed user JWT as an internal service request.
  const workerKey = Deno.env.get('COMPLETION_WORKER_KEY');
  let auth;
  try {
    auth = workerKey && req.headers.get('x-service-key') === workerKey
      ? { isServiceCall: true, user: null }
      : await requireAuthOrServiceKey(req);
  } catch { return json({ error: 'Authentification requise.' }, 401); }

  if (new URL(req.url).searchParams.get('check') === 'configuration') {
    return auth.isServiceCall ? json({ ok: true, workerConfigured: Boolean(workerKey) }) : json({ error: 'Accès refusé.' }, 403);
  }
  let propertyId: string;
  try {
    const input = await req.json();
    if (typeof input.property_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.property_id)) throw new Error();
    propertyId = input.property_id;
  } catch { return json({ error: 'Identifiant de logement invalide.' }, 400); }

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let query = db.from('properties').select('id,owner_id,ical_airbnb_url,ical_booking_url,ical_url').eq('id', propertyId);
    if (!auth.isServiceCall) {
      if (!auth.user) return json({ error: 'Authentification requise.' }, 401);
      query = query.eq('owner_id', auth.user.id);
    }
    const { data: property, error } = await query.maybeSingle();
    if (error) throw new Error('Lecture du logement indisponible.');
    if (!property) return json({ error: 'Logement introuvable ou accès refusé.' }, 403);
    if (auth.user) await checkRateLimit(auth.user.id, 'sync_ical', 12, 3600000);
    const sources = [
      { source: 'airbnb', url: property.ical_airbnb_url || property.ical_url },
      { source: 'booking', url: property.ical_booking_url },
    ].filter(item => typeof item.url === 'string' && item.url.trim());
    if (!sources.length) return json({ error: 'Aucun calendrier configuré pour ce logement.' }, 400);
    let imported = 0; let updated = 0; let cancelled = 0;
    const failures: { source: string; error: string }[] = [];
    for (const source of sources) {
      try {
        const events = await fetchCalendar(source.url);
        const { data, error: importError } = await db.rpc('sync_ical_reservations', {
          p_property_id: property.id, p_source: source.source, p_events: events,
        });
        if (importError) throw new Error('Enregistrement du calendrier indisponible.');
        imported += data.inserted; updated += data.updated; cancelled += data.cancelled || 0;
      } catch (error) {
        // Never log the signed calendar URL or upstream request headers.
        failures.push({ source: source.source, error: error instanceof Error && !/https?:/i.test(error.message) ? error.message : 'Calendrier indisponible.' });
      }
    }
    if (failures.length) return json({ ok: false, imported, updated, failures, error: 'Synchronisation incomplète. Vérifiez vos liens de calendrier puis réessayez.' }, 503);
    const { error: timestampError } = await db.from('properties').update({ last_ical_sync: new Date().toISOString() }).eq('id', propertyId);
    if (timestampError) throw new Error('Impossible de confirmer la synchronisation.');
    // Reservation triggers are the single authority for agreed concierge
    // rotations. Do not publish unpriced cleaning missions from this endpoint.
    return json({ ok: true, imported, updated, cancelled, message: `${imported} nouvelle(s) réservation(s), ${updated} mise(s) à jour, ${cancelled} annulation(s) explicite(s).` });
  } catch {
    return json({ error: 'Synchronisation indisponible. Réessayez dans quelques instants.' }, 503);
  }
});
