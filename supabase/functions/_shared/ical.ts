export type IcalEvent = { uid: string; summary: string; dtstart?: string; dtend?: string; cancelled?: true };
const MAX_BYTES = 2 * 1024 * 1024;

/** Only the two calendar providers offered by the application are fetched. */
export function validateCalendarUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const approved = ['airbnb.com', 'airbnb.fr', 'booking.com'].some(domain => host === domain || host.endsWith(`.${domain}`));
  if (url.protocol !== 'https:' || !approved || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Utilisez un lien HTTPS de calendrier Airbnb ou Booking.com.');
  }
  return url;
}

function calendarDate(raw: string): string {
  if (!/^\d{8}(?:T\d{6}Z?)?$/.test(raw)) throw new Error('Date de calendrier invalide.');
  const value = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Date de calendrier invalide.');
  return value;
}

export function parseIcal(text: string): IcalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').replace(/\r\n?/g, '\n');
  if (!/^BEGIN:VCALENDAR\s*$/m.test(unfolded) || !/^END:VCALENDAR\s*$/m.test(unfolded)) throw new Error('Le lien ne renvoie pas un calendrier iCal valide.');
  const events = new Map<string, IcalEvent>();
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const end = block.indexOf('END:VEVENT');
    if (end < 0) throw new Error('Calendrier incomplet.');
    const content = block.slice(0, end);
    const field = (name: string) => content.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'm'))?.[1]?.trim() || '';
    // Do not silently turn an unsupported recurrence into a single reservation.
    if (field('RRULE')) throw new Error('Calendrier récurrent non pris en charge. Utilisez l’export Airbnb ou Booking.');
    const uid = field('UID');
    if (!uid || uid.length > 1000) throw new Error('Identifiant de réservation manquant ou invalide.');
    if (field('STATUS') === 'CANCELLED') { events.set(uid, { uid, summary: '', cancelled: true }); if (events.size > 3000) throw new Error('Calendrier trop volumineux.'); continue; }
    const dtstart = calendarDate(field('DTSTART'));
    const dtend = calendarDate(field('DTEND'));
    if (dtend <= dtstart) throw new Error('La date de départ doit suivre la date d’arrivée.');
    const summary = field('SUMMARY').replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').slice(0, 500);
    const cleaned = /not available|blocked/i.test(summary) ? 'Indisponible' : summary.match(/\(([^)]+)\)/)?.[1] || summary || 'Réservation';
    events.set(uid, { uid, summary: cleaned, dtstart, dtend });
    if (events.size > 3000) throw new Error('Calendrier trop volumineux.');
  }
  return [...events.values()];
}

export async function fetchCalendar(raw: string, fetcher: typeof fetch = fetch): Promise<IcalEvent[]> {
  let url = validateCalendarUrl(raw);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url.toString(), { redirect: 'manual', signal, headers: { 'User-Agent': 'Altio/1.0', Accept: 'text/calendar' } });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error('Redirection de calendrier invalide.');
      url = validateCalendarUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Calendrier indisponible (HTTP ${response.status}).`); }
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Calendrier trop volumineux.'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Calendrier vide.');
    const decoder = new TextDecoder(); let size = 0; let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Calendrier trop volumineux.'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return parseIcal(text);
  }
  throw new Error('Calendrier indisponible.');
}
