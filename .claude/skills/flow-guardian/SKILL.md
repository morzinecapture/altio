---
name: flow-guardian
description: Garde-fou PRIORITAIRE des parcours Altio. À lire avant toute modification d'un statut, d'une transition, d'un bouton d'action, d'un paiement, d'une mission, d'une urgence, d'un devis, d'une candidature ou d'une notification liée à un changement de statut.
---

# Flow Guardian — règles non négociables des parcours Altio

Une modification qui viole une règle ci-dessous ne doit pas être faite : explique pourquoi et propose une alternative.
Après la modification, lance l'agent `flow-verifier` sur le diff.

## 1. La base est la source de vérité des transitions

- Toute transition doit être autorisée **côté base** (trigger `check_mission_status_transition` sur `missions`), pas seulement par `frontend/src/services/mission-state-machine.ts`. Les deux tables doivent rester identiques : modifier l'une sans l'autre est interdit.
- Vérifie la définition réelle en production avant de corriger une transition (`select pg_get_functiondef('public.check_mission_status_transition'::regproc)`) : le dépôt peut différer de la prod.
- Transitions de mission en vigueur :
  - `awaiting_payment → validated | dispute | cancelled`
  - `validated → paid`, et `validated → dispute` **uniquement si `paid_at IS NULL`**
  - `dispute → validated | cancelled`
  - `paid`, `cancelled` : terminaux
- Une transition qui touche plusieurs lignes (offre acceptée + autres refusées + urgence attribuée) passe par **une seule RPC transactionnelle** (`accept_emergency_bid`), jamais par plusieurs updates client.
- Le paiement est **géré par le serveur** : le client ne pose jamais `status='paid'`, `paid_at` ou un identifiant de PaymentIntent sur une mission (trigger `guard_mission_payment_confirmation`).
- Les prix sont verrouillés par `guard_payment_prices` : une mission validée ou payée ne revient jamais à un statut modifiable.

## 2. Argent

- Commission : **10 % du HT de chaque côté**.
  - frais = `round(HT_centimes × 0,10)`
  - le propriétaire paie le prix TTC + frais
  - le prestataire reçoit le prix TTC − frais
  - `application_fee_amount` = 2 × frais
- HT :
  - prix saisi TTC (mission à prix fixe, déplacement + diagnostic) : `TTC / 1,2`, sauf `users.is_vat_exempt = true` (HT = TTC)
  - devis : HT = sous-total des lignes
- Un seul calcul par côté, en miroir strict :
  - app : `frontend/src/utils/commission.ts` et `frontend/src/utils/quotePrice.ts`
  - serveur : `supabase/functions/_shared/billing.ts` et `_shared/payment-order.ts`

  Ne recalcule jamais une commission ailleurs : importe ces fonctions.
- Le serveur refuse tout paiement dont le montant diffère du sien (« Le montant a changé »). Toute modification de calcul doit être faite des deux côtés, dans le même déploiement, et suivie d'un build de l'app.
- Les nouveaux paiements portent `pricingVersion: 'ht-v1'`. Les anciens paiements (legacy 2/11, `cents-v1`) doivent rester acceptés par la capture, la facturation et les rapprochements.
- Toute modification de montant ou de métadonnées impose de changer la clé d'idempotence Stripe (`altio-v4`, `altio-completion-v2`).
- Aucun écran n'affiche la commission totale (20 %), ni à une partie la commission prélevée sur l'autre.
- Avant le choix d'un prestataire, un total propriétaire est un **maximum**, à libeller comme tel.

## 3. Urgences et clôture par étape

- Une offre n'est attribuée qu'avec une empreinte de paiement émise par `create-payment-intent` pour **cette offre et ce propriétaire** (table `emergency_bid_payments`, serveur uniquement).
- Chaque étape (diagnostic puis réparation) suit le même cycle, via `emergency_completion_action` :
  1. le prestataire déclare la fin de l'étape ;
  2. le propriétaire valide ou conteste ;
  3. sans réponse, relance à 24 h et paiement automatique à 48 h (cron `altio-completion-steps`).
- **Seul le propriétaire peut contester** une étape. Une contestation suspend le paiement automatique. Une étape déjà payée garde le statut `paid`, et `disputed_at` signale le recours.
- La réparation exige un diagnostic déclaré au préalable.

## 4. Notifications

- Les notifications liées à un changement de statut sont envoyées **par la base** (triggers `notify_mission_status_change`, `notify_mission_dispute`, `notify_owner_on_emergency_bid`, `notify_provider_on_bid_rejected`). Le client n'en renvoie jamais une seconde : pas de doublon.
- Un texte ne promet jamais un événement non encore acquis (ex. « validée » ≠ « paiement en cours »).
- Le bon destinataire est obligatoire : jamais à une partie un message destiné à l'autre.

## 5. Boutons d'action

- Un bouton n'est affiché que si la base acceptera l'action, pour ce rôle et ce statut :
  - « Signaler un problème » : propriétaire uniquement, et mission en `awaiting_payment` ou `validated` non payée ;
  - pour une étape d'urgence : propriétaire uniquement.
- Chaque action a un état de chargement, protège contre le double appui, et affiche un message d'erreur en français compréhensible (jamais une erreur SQL brute).

## 6. Déploiement

- Migrations : ne pas utiliser `supabase db push` (historiques divergents). Applique avec `supabase db query --linked -f <fichier>`, puis `supabase migration repair --status applied <version>`.
- Ordre : migration d'abord, puis les Edge Functions qui en dépendent, **immédiatement après**, puis le build EAS. Annonce toute fenêtre pendant laquelle un parcours échoue.
- Les déploiements en production sont lancés par Maxime (préfixe `!`), après accord explicite.

## Checklist avant de coder

- [ ] La transition est autorisée par la base **et** par `mission-state-machine.ts` (identiques).
- [ ] Les écritures liées sont atomiques (une RPC ou une transaction).
- [ ] Montants : fonctions partagées utilisées, app = serveur au centime, anciens paiements compatibles.
- [ ] Le bouton n'apparaît que pour le bon rôle et le bon statut.
- [ ] Notification : envoyée une seule fois, par la base, au bon rôle, sans promesse fausse.
- [ ] L'autre rôle voit le nouvel état (RLS, realtime, invalidation de cache).
- [ ] Les cas limites sont traités : annulation, double action, échec de paiement, paiement déjà confirmé.
- [ ] Tests mis à jour :
  - serveur : `node --test supabase/functions/tests/*.cjs`
  - app : `npx tsc --noEmit -p .` et `npx jest` dans `frontend`
