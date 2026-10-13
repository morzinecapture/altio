# Tasks

> Mis à jour le 15 septembre 2026 après audit du code, de la base distante et des Edge Functions déployées.
> Les Sprints 1 à 5 étaient marqués « à venir » alors qu'ils sont implémentés depuis des mois : ce fichier
> reflète désormais l'état réel, pas le plan initial.

## 🔴 Bloquants production (à traiter en premier)

- [x] **Déployer le correctif de facturation** — déployé le 15 septembre : `capture-payment` v21,
      `validate-intervention` v7 et `mark-intervention-arrived` v5 sont actifs avec `keepAlive`.
- [ ] **Configurer `STRIPE_WEBHOOK_SECRET`** — absent des secrets : `stripe-webhook` rejette tous les
      événements Stripe en 400. Le filet de sécurité qui devait rattraper la facturation est donc mort lui aussi.
- [ ] **Passer Stripe en clés live** — `.env.production` déclare `EXPO_PUBLIC_APP_ENV=production` mais porte
      une clé `pk_test_`. Un build de production ne peut encaisser aucun paiement réel.
- [ ] **Re-tester le cycle complet** urgence → devis → paiement → 3 factures, après les 3 points ci-dessus.

## 🟠 Avant soumission aux stores

- [ ] Screenshots App Store + Play Store (aucun préparé)
- [ ] Métadonnées store : description, mots-clés, catégorie, classification d'âge
- [ ] Renseigner `submit.production` dans `eas.json` + credentials App Store Connect / Play Console
- [ ] Premier build TestFlight et test sur device réel — version 1.0.0, build 10 envoyé avec succès à
      App Store Connect le 16 septembre (`d108feb6-2822-49cd-8d0a-87f0f1ac08e3`) ; attendre le traitement
      Apple puis tester sur iPhone.
- [ ] Vérifier `aps-environment` en `production` sur le build signé (il est en `development` dans les entitlements)
- [ ] Configurer l'org/projet Sentry (pas de `sentry.properties` → upload des source maps désactivé en dur)
- [ ] Faire valider les CGU/CGV par un avocat

## 🟡 En cours

- [ ] **Sprint Design/UX** — composants partagés créés (`Button`, `Card`, `EmptyState`, `SectionHeader`,
      `StatusBadge`), hero image sur le dashboard owner, assets du template Expo supprimés.
      **7 écrans migrés sur ~55** : reste à propager aux écrans admin, onboarding, mission, urgence, profil.
- [ ] **Commiter le travail en cours** — ~108 fichiers modifiés non commités, dernier commit le 22 juillet.
      Risque de perte et de conflit entre sessions parallèles.

## 🟢 Dette technique identifiée (non bloquante)

- [ ] Filtrer la subscription Realtime `missions` par `owner_id`/`provider_id` (`useRealtimeSync.ts` écoute
      tous les UPDATE de la table, tous utilisateurs confondus)
- [ ] Retirer les ~19 `console.error` de debug laissés en production (ex. `src/api/properties.ts`)
- [ ] Créer le skill `flow-guardian` ou le retirer de `CLAUDE.md` — il y est déclaré PRIORITAIRE et
      obligatoire avant toute modification de flux de paiement, mais **le fichier n'existe pas**
- [ ] Rendre le patch Stripe du `Podfile` robuste — il réécrit `node_modules`, donc perdu à chaque `npm install`
- [ ] 155 warnings ESLint cosmétiques (0 erreur)

## Backlog

- [ ] Connecter Google Calendar à Cowork pour synchro automatique
- [ ] Préparer le pitch deck pour investisseurs

## ✅ Done

- [x] **SPRINT 1 — Stabilisation** : `api.ts` monolithique découpé en modules `src/api/*`, 0 `console.log`,
      `any` réduits de ~65 à 10, `tsc` propre, 232 tests verts (8 suites dont 2 parcours e2e)
- [x] **SPRINT 2 — RGPD** : `delete-account` + `export-user-data` déployées, page web de suppression de compte
- [x] **SPRINT 3 — Calendriers** : `sync-ical` (Airbnb/Booking) + `connect-google-calendar` / `sync-google-calendar`
- [x] **SPRINT 4 — Facturation électronique** : `generate-invoice` v20 avec Factur-X (XML CII), avoirs
      (`generate-credit-note`), variables légales `ALTIO_*` configurées le 11 septembre
- [x] **SPRINT 5 — i18n FR/EN** : `src/i18n/fr.ts` + `en.ts`, i18next branché
- [x] Bugs RLS critiques de l'audit de mars corrigés : `is_admin()`, rate limiting, INSERT notifications
- [x] Idempotence du webhook Stripe (dédoublonnage sur `event.id`)
- [x] Guards de rôle sur les groupes de routes `(owner)` / `(provider)` / `(admin)`
- [x] Migration `20260910000001` appliquée — factures et devis d'avant le 22 juillet à nouveau accessibles
      (chemins storage normalisés après le passage du bucket en privé)
- [x] Correctif `keepAlive` écrit et déployé pour les 3 Edge Functions concernées
- [x] Dépendances Expo SDK 54 alignées sur les versions recommandées par Expo Doctor
