# Tasks

> Mis à jour le 15 septembre 2026 après audit du code, de la base distante et des Edge Functions déployées.
> Les Sprints 1 à 5 étaient marqués « à venir » alors qu'ils sont implémentés depuis des mois : ce fichier
> reflète désormais l'état réel, pas le plan initial.

## 🔴 Bloquants production (à traiter en premier)

- [x] **Déployer le correctif de facturation** — déployé le 15 septembre : `capture-payment` v21,
      `validate-intervention` v7 et `mark-intervention-arrived` v5 sont actifs avec `keepAlive`.
- [x] **Configurer `STRIPE_WEBHOOK_SECRET`** — présent dans les secrets (vérifié le 14 octobre), avec
      `STRIPE_CONNECT_WEBHOOK_SECRET` et `STRIPE_CONNECT_V2_WEBHOOK_SECRET`. À remplacer par les secrets live.
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
- [x] **Commiter le travail en cours** — commité et poussé le 13 octobre (`71bcd0b1`,
      `release/launch-2026-07-22`). `outputs/` (rapports générés, justificatifs) reste hors dépôt.

## 🟢 Dette technique identifiée (non bloquante)

- [x] Subscription Realtime `missions` — pas de fuite : toutes les tables publiées ont la RLS active et
      Realtime l'applique à chaque abonné (vérifié le 14 octobre). Un filtre ne serait qu'une optimisation,
      et casserait la découverte des missions ouvertes côté prestataire.
- [x] Retirer les `console.error` de debug — supprimés le 14 octobre dans l'ajout de logement (ils
      journalisaient l'adresse) ; les autres journalisent de vraies erreurs.
- [x] Créer le skill `flow-guardian` — `.claude/skills/flow-guardian/SKILL.md` (14 octobre)
- [x] Patch Stripe du `Podfile` — appliqué dans `post_install`, donc réappliqué à chaque `pod install`
      (y compris sur EAS, qui lance `pod install` après `npm install`). Rien à faire.
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
