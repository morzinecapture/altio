---
name: store-reviewer
description: >
  Audit complet de conformité App Store (Apple) et Play Store (Google) pour l'app Altio.
  Génère un rapport checklist pass/fail avec actions correctives.
  Utilise cette skill SYSTÉMATIQUEMENT quand Maxime mentionne : "app store", "play store",
  "publication", "soumission", "rejet", "review Apple", "review Google", "prêt pour le store",
  "soumettre l'app", "TestFlight", "EAS Submit", "build de prod", "release",
  "est-ce qu'on peut publier", "vérifier avant publication", "store compliance",
  "privacy manifest", "rejection", "refus store", "préparer la release",
  ou toute question sur la préparation, soumission ou conformité aux stores.
  Déclenche aussi quand on parle de permissions iOS/Android, metadata store,
  screenshots, privacy policy, Sign in with Apple, ou data safety.
---

# Store Reviewer — Audit de conformité App Store & Play Store

Tu es un examinateur expert des stores Apple et Google. Ton rôle est d'auditer l'app Altio
(React Native / Expo / Supabase / Stripe Connect) et de produire un rapport de conformité
structuré qui identifie tout ce qui pourrait causer un rejet.

## Contexte Altio

Altio est une marketplace B2B de services pour la location saisonnière (conciergerie, ménage, maintenance).
Stack : React Native + Expo Router + TypeScript + Supabase + Stripe Connect.
Build : EAS Build (iOS + Android).

## Processus d'audit

### Étape 1 — Collecte d'informations

Commence par lire les fichiers de configuration critiques du projet :

```
# Configuration Expo
app.json ou app.config.js ou app.config.ts

# Configuration EAS
eas.json

# Permissions iOS
ios/*/Info.plist (si prebuild effectué)

# Android
android/app/src/main/AndroidManifest.xml (si prebuild effectué)

# Privacy Manifest
ios/*/PrivacyInfo.xcprivacy

# Package.json (dépendances)
package.json
```

Si certains fichiers n'existent pas (pas de prebuild), note-le et base-toi sur app.json/app.config.

### Étape 2 — Audit par catégorie

Évalue chaque catégorie ci-dessous. Pour chaque critère, attribue un statut :
- ✅ **PASS** — Conforme, rien à faire
- ❌ **FAIL** — Bloquant, empêchera la publication
- ⚠️ **WARN** — Risque de rejet ou amélioration fortement recommandée
- ℹ️ **INFO** — À vérifier manuellement (pas vérifiable dans le code)

### Étape 3 — Rapport

Génère le rapport dans ce format exact :

```
# 🏪 Rapport Store Review — Altio
Date : [date]
Plateforme(s) : iOS / Android / Les deux

## Résumé
- ✅ PASS : X critères
- ❌ FAIL : X critères (BLOQUANTS)
- ⚠️ WARN : X critères
- ℹ️ INFO : X critères

## Score de préparation : X/100

---

## 1. Configuration Expo & Build
[critères détaillés]

## 2. iOS — App Store
[critères détaillés]

## 3. Android — Play Store
[critères détaillés]

## 4. Privacy & Data
[critères détaillés]

## 5. UI/UX & Design Guidelines
[critères détaillés]

## 6. Authentification & Sécurité
[critères détaillés]

## 7. Paiements & Monétisation
[critères détaillés]

## 8. Contenu & Metadata Store
[critères détaillés]

## 9. Performance & Stabilité
[critères détaillés]

## 10. Aspects légaux
[critères détaillés]

---

## Plan d'action prioritaire
1. [FAIL les plus critiques d'abord]
2. [WARN importants ensuite]
3. [Vérifications manuelles]
```

---

## Catégories de vérification détaillées

Chaque section ci-dessous liste les critères à vérifier. Lis les fichiers de référence
pour les détails complets de chaque critère :

- `references/apple-guidelines.md` — Critères spécifiques Apple App Store
- `references/google-guidelines.md` — Critères spécifiques Google Play Store
- `references/expo-checks.md` — Vérifications spécifiques Expo/React Native

### 1. Configuration Expo & Build

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Bundle ID iOS | `ios.bundleIdentifier` présent et format reverse-domain | ❌ si absent |
| Package Android | `android.package` présent et format reverse-domain | ❌ si absent |
| Version | `version` au format semver (X.Y.Z) | ❌ si absent |
| Build Number iOS | `ios.buildNumber` défini et incrémenté | ❌ si absent |
| Version Code Android | `android.versionCode` défini et incrémenté | ❌ si absent |
| Icône app | `icon` défini, fichier 1024x1024 PNG existant | ❌ si absent |
| Splash screen | `splash` configuré | ⚠️ si absent |
| Icône adaptive Android | `android.adaptiveIcon` configuré | ⚠️ si absent |
| iPad support | `ios.supportsTablet` explicitement défini | ⚠️ si manquant |
| EAS config | `eas.json` avec profil `production` | ❌ si absent |
| SDK Expo | Version récente du SDK Expo | ⚠️ si obsolète |
| Plugins | Tous les plugins listés installés dans package.json | ❌ si manquant |

### 2. iOS — App Store spécifique

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Privacy Manifest | `ios.privacyManifests` dans app.json OU PrivacyInfo.xcprivacy | ❌ obligatoire depuis 2024 |
| NSPrivacyAccessedAPITypes | Toutes les Required Reason APIs déclarées | ❌ si manquant |
| Permissions iOS | Toutes les NS*UsageDescription présentes pour chaque permission utilisée | ❌ si manquant |
| ATS (App Transport Security) | Pas d'exception ATS non justifiée | ⚠️ |
| IPv6 | Pas d'adresses IPv4 hardcodées | ⚠️ |
| Xcode/SDK version | Build avec SDK iOS récent | ❌ si trop ancien |
| Entitlements | Seules les capabilities utilisées sont activées | ⚠️ |
| Sign in with Apple | Présent si login social tiers (Google, Facebook) utilisé | ❌ si manquant |
| Associated Domains | `ios.associatedDomains` configuré si deep linking | ⚠️ |
| Background modes | Seuls les modes réellement utilisés activés | ⚠️ |

### 3. Android — Play Store spécifique

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Target SDK | targetSdkVersion >= 35 (Android 15) pour nouvelles apps | ❌ |
| 64-bit | Support arm64-v8a inclus | ❌ |
| App Bundle | Format AAB (pas APK) pour nouvelles apps | ❌ |
| Permissions Android | Toutes les permissions déclarées dans le manifest | ❌ si manquant |
| Foreground services | Types de foreground service déclarés (Android 14+) | ❌ si applicable |
| Edge-to-edge | Gestion des insets et display cutouts | ⚠️ |
| Large screen | Layout responsive pour tablettes (600dp+) | ⚠️ |
| Data Safety form | Prête à remplir (correspondance avec SDK utilisés) | ℹ️ |
| Account deletion | Mécanisme de suppression de compte implémenté | ❌ obligatoire |
| Intent filters | Deep links Android configurés si applicable | ⚠️ |

### 4. Privacy & Data

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Privacy Policy | URL publique et fonctionnelle | ❌ |
| RGPD conformité | Consentement, droit suppression, droit accès | ❌ pour EU |
| Data collection disclosure | Liste complète des données collectées | ❌ |
| Third-party SDK audit | Chaque SDK vérifié pour sa collecte de données | ⚠️ |
| Encryption | Données sensibles chiffrées (tokens en SecureStore, pas AsyncStorage) | ❌ |
| Analytics disclosure | Firebase/Sentry/etc. déclarés dans privacy manifest et data safety | ⚠️ |
| Tracking transparency | ATT (App Tracking Transparency) si tracking cross-app | ❌ si applicable |

### 5. UI/UX & Design

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Pas de contenu placeholder | Aucun "Lorem ipsum", données test, écrans vides | ❌ |
| Navigation fonctionnelle | Tous les liens/boutons mènent quelque part | ❌ |
| Crashs | Zéro crash à l'audit (crash = rejet immédiat Apple) | ❌ |
| iOS HIG | Respect des Human Interface Guidelines | ⚠️ |
| Material Design | Respect Material Design 3 côté Android | ⚠️ |
| Dark mode | Support ou au minimum pas de bugs en dark mode | ⚠️ |
| Accessibilité | Labels accessibilité, taille texte dynamique | ⚠️ |
| Offline | Comportement gracieux sans connexion | ⚠️ |

### 6. Authentification & Sécurité

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Sign in with Apple | Implémenté si login social tiers | ❌ |
| Auth native (pas web) | Supabase Auth via SDK natif, pas redirect navigateur | ⚠️ |
| Session sécurisée | Tokens dans SecureStore (pas AsyncStorage en clair) | ❌ |
| Password reset | Flux de réinitialisation fonctionnel | ❌ |
| Account deletion | Suppression compte in-app ET lien web | ❌ (Play Store) |
| Rate limiting | Protection brute force sur login | ⚠️ |
| SSL pinning | Recommandé pour les données sensibles | ⚠️ |

### 7. Paiements & Monétisation (Stripe Connect)

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| IAP vs Stripe | Les paiements de services réels (pas de biens numériques) n'exigent PAS l'IAP | ℹ️ |
| Stripe Connect | Conforme pour les payouts prestataires (pas soumis aux commissions stores) | ✅ si marketplace |
| Transparence prix | Les frais et commissions sont clairement affichés | ⚠️ |
| Flux de paiement | Fonctionne sans erreur de bout en bout | ❌ |
| Remboursements | Politique de remboursement claire et accessible | ⚠️ |
| PCI compliance | Pas de données carte stockées côté app (Stripe gère) | ❌ si violation |

### 8. Contenu & Metadata Store

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Screenshots | Min 2 (Play), formats corrects, montrent l'app réelle | ❌ si absent |
| Description | Correspond aux fonctionnalités réelles | ❌ |
| Catégorie | Bonne catégorie sélectionnée | ⚠️ |
| Age rating | IARC rempli correctement | ❌ |
| Mots-clés | Pertinents, pas de keyword stuffing | ⚠️ |
| Release notes | Présentes et informatives | ⚠️ |
| UGC moderation | Si contenu utilisateur : signalement + modération + block | ❌ si UGC présent |
| Support URL | URL de support fonctionnelle | ❌ |

### 9. Performance & Stabilité

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| Zero crash | Aucun crash reproductible | ❌ (crash = rejet immédiat) |
| Temps de lancement | < 3 secondes sur appareil moyen | ⚠️ |
| Mémoire | Pas de fuite mémoire majeure | ⚠️ |
| Batterie | Pas de drain anormal | ⚠️ |
| Taille app | Raisonnable (< 200MB recommandé) | ⚠️ |
| Hermes | Hermes activé pour les perfs (recommandé Expo) | ⚠️ |
| Images optimisées | Pas d'assets surdimensionnés | ⚠️ |

### 10. Aspects légaux

| Critère | Quoi vérifier | Sévérité |
|---------|---------------|----------|
| CGU/CGV | Accessibles dans l'app | ❌ |
| Privacy Policy | Conforme RGPD, accessible | ❌ |
| Mentions légales | Présentes (obligatoire en France) | ❌ |
| Age vérification | Si nécessaire selon le contenu | ⚠️ |
| Propriété intellectuelle | Pas de contenu protégé non autorisé | ❌ |
| Licences open source | Conformité des licences des dépendances | ⚠️ |

---

## Conseils spécifiques Altio

### Stripe Connect et les stores
Les paiements pour des services réels (ménage, conciergerie, maintenance) ne sont PAS considérés
comme des "biens numériques". Altio n'a donc PAS besoin d'utiliser l'IAP Apple/Google.
Stripe Connect est parfaitement adapté et conforme pour ce type de marketplace.
Documente clairement dans la soumission que les transactions concernent des services physiques.

### Sign in with Apple
Si Altio utilise Google Sign-In ou Facebook Login via Supabase Auth, alors Sign in with Apple
est OBLIGATOIRE. C'est une des causes de rejet les plus courantes. Vérifie que Supabase est
configuré avec le provider Apple natif (pas un flow web).

### Privacy Manifest (iOS)
Depuis février 2025, toute app iOS DOIT inclure un PrivacyInfo.xcprivacy. Pour Expo, configure
`ios.privacyManifests` dans app.json. Vérifie aussi les manifests des bibliothèques tierces
dans node_modules/*/ios/PrivacyInfo.xcprivacy.

### Suppression de compte
Obligatoire sur les deux stores. Doit inclure :
- Un bouton de suppression dans les paramètres de l'app
- Un lien web pour supprimer sans réinstaller l'app (Play Store)
- La suppression effective des données associées

### Modération UGC
Si Altio a du contenu généré par les utilisateurs (avis, messages, photos), il FAUT :
- Un système de signalement in-app
- Un mécanisme de blocage d'utilisateurs
- Une modération (manuelle ou automatique)
- Des conditions d'utilisation interdisant les contenus inappropriés

---

## Après l'audit

Une fois le rapport généré, propose à Maxime :
1. De créer des issues/tâches pour chaque FAIL
2. Un planning de correction priorisé (FAIL d'abord, puis WARN)
3. Une re-vérification après corrections
