---
name: mission-lifecycle
description: Cycle de vie complet des missions Altio — de la création au paiement. Utilise cette skill dès qu'on parle de mission, tâche, intervention, statut, workflow, assignation, acceptation, refus, complétion, annulation, ou tout ce qui touche au parcours d'une mission entre propriétaire et prestataire.
---

# Cycle de vie des missions — Altio

## Statuts d'une mission
```
draft → broadcast → applied → assigned → in_progress → completed → paid
                                                      ↘ disputed
         ↘ expired (aucune candidature après 24h)
         ↘ cancelled (annulée par le propriétaire)
```

## Détail de chaque transition

### 1. draft → broadcast
- **Qui** : Propriétaire (ou auto via iCal sync)
- **Action** : La mission est publiée et visible par les prestataires de la zone
- **Données requises** : property_id, service_type, date_needed, description
- **Notification** : Push + SMS aux prestataires de la zone (favoris en premier)

### 2. broadcast → applied
- **Qui** : Prestataire
- **Action** : Le prestataire candidate avec un prix et un message
- **Données** : provider_id, proposed_price, message
- **Notification** : Email + push au propriétaire "Nouvelle candidature"

### 3. applied → assigned
- **Qui** : Propriétaire
- **Action** : Le propriétaire choisit un prestataire parmi les candidats
- **Données** : selected_provider_id, agreed_price
- **Notification** : Push au prestataire "Mission confirmée"
- **Paiement** : Pré-autorisation Stripe du montant convenu

### 4. assigned → in_progress
- **Qui** : Prestataire
- **Action** : Le prestataire signale qu'il commence l'intervention
- **Données** : started_at, optional: photo_before
- **Notification** : Push au propriétaire "Intervention en cours"

### 5. in_progress → completed
- **Qui** : Prestataire
- **Action** : Le prestataire signale la fin + photos
- **Données** : completed_at, photos_after[], notes
- **Notification** : Push au propriétaire "Intervention terminée — vérifiez"

### 6. completed → paid
- **Qui** : Propriétaire (ou auto après 48h sans contestation)
- **Action** : Validation et déclenchement du paiement
- **Paiement** : Capture Stripe → transfert vers le compte Connect du prestataire
- **Commission** : Altio prélève X% avant le transfert

### 7. completed → disputed
- **Qui** : Propriétaire
- **Action** : Le propriétaire conteste le travail
- **Données** : dispute_reason, dispute_photos[]
- **Process** : Médiation manuelle (phase 1), arbitrage auto (phase future)

## Schéma de données
```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  owner_id UUID REFERENCES profiles(id),
  provider_id UUID REFERENCES profiles(id),
  reservation_id UUID REFERENCES reservations(id),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','broadcast','applied','assigned',
                       'in_progress','completed','paid','disputed',
                       'expired','cancelled')),

  service_type TEXT NOT NULL
    CHECK (service_type IN ('menage','plomberie','electricite',
                             'jardinage','maintenance','autre')),

  title TEXT NOT NULL,
  description TEXT,
  date_needed DATE NOT NULL,
  time_slot TEXT, -- 'morning', 'afternoon', 'flexible'
  estimated_duration_hours NUMERIC,

  proposed_price NUMERIC,   -- Prix proposé par le propriétaire
  agreed_price NUMERIC,     -- Prix final accepté
  commission_rate NUMERIC DEFAULT 0.15,

  zone_id UUID REFERENCES zones(id),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  stripe_payment_intent_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mission_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id),
  proposed_price NUMERIC NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, provider_id)
);
```

## Règles métier critiques
- Un prestataire ne peut pas candidater 2 fois à la même mission
- Le propriétaire ne peut pas assigner sans pré-autorisation Stripe réussie
- Auto-expiration après 24h sans candidature → notifier le propriétaire
- Auto-validation du paiement 48h après completion si pas de dispute
- Les missions annulées après assignation peuvent entraîner des frais
- Le prestataire doit uploader au moins 1 photo pour marquer "completed"

## Transitions côté code
```typescript
// services/missions.ts
export async function transitionMission(
  missionId: string,
  newStatus: MissionStatus,
  data?: Partial<Mission>
) {
  const { data: mission } = await supabase
    .from('missions')
    .select('status')
    .eq('id', missionId)
    .single()

  // Valider la transition
  if (!isValidTransition(mission.status, newStatus)) {
    throw new Error(`Transition invalide: ${mission.status} → ${newStatus}`)
  }

  // Mettre à jour
  const { error } = await supabase
    .from('missions')
    .update({ status: newStatus, updated_at: new Date(), ...data })
    .eq('id', missionId)

  if (error) throw error

  // Déclencher les side effects (notifications, paiements)
  await handleTransitionSideEffects(missionId, newStatus)
}
```
