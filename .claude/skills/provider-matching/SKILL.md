---
name: provider-matching
description: Algorithme de matching prestataires Altio — zones, disponibilité, favoris, notation. Utilise cette skill dès qu'on parle de recherche de prestataire, matching, algorithme, favoris, notation, avis, disponibilité, zones géographiques, ou attribution de mission.
---

# Provider Matching — Altio

## Logique de matching
Quand une mission est broadcast, les prestataires sont notifiés dans cet ordre de priorité :

### Niveau 1 : Favoris du propriétaire
Le propriétaire peut avoir une liste de prestataires favoris. Ils sont notifiés en premier avec un délai d'exclusivité de 2h avant le broadcast général.

### Niveau 2 : Prestataires de la zone
Après le délai d'exclusivité (ou immédiatement si pas de favoris), tous les prestataires actifs dans la zone sont notifiés.

### Critères de tri dans les résultats
1. **Favori** du propriétaire (booléen, priorité absolue)
2. **Note moyenne** (sur 5, minimum 3 avis pour être fiable)
3. **Taux de complétion** (missions terminées / missions acceptées)
4. **Proximité** géographique (dans la zone)
5. **Temps de réponse moyen** (rapidité de candidature)

## Schéma de données
```sql
CREATE TABLE provider_zones (
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, zone_id)
);

CREATE TABLE provider_services (
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  hourly_rate NUMERIC,
  PRIMARY KEY (provider_id, service_type)
);

CREATE TABLE favorites (
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (owner_id, provider_id)
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  author_id UUID REFERENCES profiles(id),
  target_id UUID REFERENCES profiles(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, author_id) -- 1 avis par personne par mission
);

CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,       -- 'Morzine', 'Chamonix', 'Megève', etc.
  slug TEXT UNIQUE NOT NULL,
  department TEXT,           -- '74', '73'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Requête de matching
```typescript
// services/matching.ts
export async function findMatchingProviders(
  missionId: string,
  ownerId: string,
  zoneId: string,
  serviceType: string
) {
  // Favoris d'abord
  const { data: favorites } = await supabase
    .from('favorites')
    .select('provider_id')
    .eq('owner_id', ownerId)

  const favoriteIds = favorites?.map(f => f.provider_id) ?? []

  // Tous les prestataires de la zone qui font ce service
  const { data: providers } = await supabase
    .from('profiles')
    .select(`
      id, full_name, avatar_url,
      provider_zones!inner(zone_id),
      provider_services!inner(service_type, hourly_rate),
      reviews_as_target:reviews!target_id(rating)
    `)
    .eq('role', 'provider')
    .eq('is_active', true)
    .eq('provider_zones.zone_id', zoneId)
    .eq('provider_services.service_type', serviceType)

  // Calculer le score et trier
  return providers
    ?.map(p => ({
      ...p,
      is_favorite: favoriteIds.includes(p.id),
      avg_rating: average(p.reviews_as_target.map(r => r.rating)),
      review_count: p.reviews_as_target.length,
    }))
    .sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
      return b.avg_rating - a.avg_rating
    })
}
```

## Zones de lancement
- Phase 1 : Morzine, Les Gets
- Phase 2 : Chamonix, Megève, Samoëns
- Phase 3 : Stations Tarentaise (Val d'Isère, Méribel, etc.)

## Règles métier
- Un prestataire doit avoir au moins 1 zone ET 1 service configuré pour recevoir des missions
- La note minimale affichée = 3 avis reçus (avant ça, afficher "Nouveau")
- Un prestataire peut se déclarer indisponible temporairement (vacances, surbooking)
- Le propriétaire ne peut noter qu'après le paiement (pas avant)
- Le prestataire peut aussi noter le propriétaire (bidirectionnel)
