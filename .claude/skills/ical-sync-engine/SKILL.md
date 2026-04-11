---
name: ical-sync-engine
description: Moteur de synchronisation iCal pour Altio — import des calendriers Airbnb/Booking.com pour détecter les checkouts et créer des missions automatiques. Utilise cette skill dès qu'on parle de calendrier, iCal, .ics, Airbnb, Booking, checkout, check-in, synchronisation, import réservations, détection de départ, ou planification automatique de missions.
---

# iCal Sync Engine — Altio

## Concept
Les propriétaires connectent leurs calendriers Airbnb/Booking. Altio parse les fichiers iCal (.ics), détecte les checkouts à venir, et crée automatiquement des missions de ménage/maintenance.

## Architecture
```
Propriétaire ajoute URL iCal
        ↓
Supabase Edge Function (CRON toutes les heures)
        ↓
Fetch du fichier .ics via HTTP
        ↓
Parse des événements VEVENT
        ↓
Détection des checkouts dans les 48h
        ↓
Création automatique de missions "ménage"
        ↓
Broadcast aux prestataires de la zone
```

## Format iCal Airbnb (exemple)
```
BEGIN:VCALENDAR
PRODID:-//Airbnb Inc//Hosting Calendar//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260315
DTEND;VALUE=DATE:20260320
SUMMARY:Jean Dupont (ABC123)
DESCRIPTION:Réservation Airbnb
UID:abc123@airbnb.com
END:VEVENT
END:VCALENDAR
```

## Parser iCal
```typescript
// lib/ical.ts
interface Reservation {
  uid: string
  guest_name: string
  checkin: Date
  checkout: Date  // DTEND = date de checkout
  source: 'airbnb' | 'booking' | 'unknown'
  reference: string
}

export function parseICal(icalString: string): Reservation[] {
  const events: Reservation[] = []
  const vevents = icalString.split('BEGIN:VEVENT')

  for (const vevent of vevents.slice(1)) {
    const dtstart = extractField(vevent, 'DTSTART')
    const dtend = extractField(vevent, 'DTEND')
    const summary = extractField(vevent, 'SUMMARY')
    const uid = extractField(vevent, 'UID')

    if (!dtstart || !dtend) continue

    events.push({
      uid: uid ?? '',
      guest_name: summary?.replace(/\s*\(.*\)/, '') ?? 'Inconnu',
      checkin: parseICalDate(dtstart),
      checkout: parseICalDate(dtend),
      source: uid?.includes('airbnb') ? 'airbnb' : uid?.includes('booking') ? 'booking' : 'unknown',
      reference: summary?.match(/\(([^)]+)\)/)?.[1] ?? '',
    })
  }

  return events
}

function extractField(text: string, field: string): string | null {
  const regex = new RegExp(`${field}[^:]*:(.+)`, 'm')
  return text.match(regex)?.[1]?.trim() ?? null
}

function parseICalDate(dateStr: string): Date {
  // Format: 20260315 ou 20260315T140000Z
  const clean = dateStr.replace(/[^0-9T]/g, '')
  const year = parseInt(clean.slice(0, 4))
  const month = parseInt(clean.slice(4, 6)) - 1
  const day = parseInt(clean.slice(6, 8))
  return new Date(year, month, day)
}
```

## Edge Function de sync
```typescript
// supabase/functions/sync-ical/index.ts
// Déclenchée par CRON toutes les heures
// 1. Récupère toutes les properties avec une URL iCal
// 2. Fetch chaque URL
// 3. Parse les événements
// 4. Compare avec les réservations existantes (par UID)
// 5. Crée les nouvelles réservations
// 6. Pour chaque checkout dans les 48h sans mission associée → crée une mission
```

## Schéma de données
```sql
CREATE TABLE ical_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('airbnb', 'booking', 'other')),
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  ical_source_id UUID REFERENCES ical_sources(id),
  external_uid TEXT NOT NULL,
  guest_name TEXT,
  checkin DATE NOT NULL,
  checkout DATE NOT NULL,
  platform TEXT,
  auto_mission_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ical_source_id, external_uid)
);
```

## Règles métier
- DTEND dans iCal = date de checkout (le jour où le logement se libère)
- Créer la mission de ménage pour le jour du checkout
- Si le propriétaire a des favoris, leur proposer en priorité (pas de broadcast général)
- Ne jamais re-créer une mission pour une réservation déjà traitée (vérifier `auto_mission_created`)
- Tolérance de 2h pour les variations d'heure dans les fichiers iCal
- Si le fetch échoue 3 fois de suite, passer `sync_status` à 'error' et notifier le propriétaire
