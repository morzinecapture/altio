# Google Play Store — Critères de conformité détaillés

Référence complète pour l'audit Android. Lis ce fichier quand tu audites la conformité Play Store.

## Table des matières
1. [Target SDK & Build](#1-target-sdk)
2. [Data Safety Section](#2-data-safety)
3. [Permissions Android](#3-permissions)
4. [Account Deletion](#4-account-deletion)
5. [Store Listing & Metadata](#5-store-listing)
6. [Content Policies](#6-content-policies)
7. [Monetization & Billing](#7-monetization)
8. [Technical Requirements](#8-technical)
9. [Families Policy](#9-families)
10. [Common Rejection Reasons](#10-rejections)

---

## 1. Target SDK & Build

### Exigences 2025-2026

| Exigence | Valeur requise | Date limite |
|---|---|---|
| Target SDK (nouvelles apps) | API 35 (Android 15) | Immédiat |
| Target SDK (mises à jour) | API 34 (Android 14) | Août 2025 |
| Format | AAB (Android App Bundle) | Obligatoire nouvelles apps |
| Architecture | 64-bit (arm64-v8a) | Obligatoire |
| Taille max AAB | 200 MB | Augmenté depuis 2025 |

**Pour Expo/EAS** — Vérifier dans app.json ou build.gradle :
```json
// app.json
{
  "expo": {
    "android": {
      "compileSdkVersion": 35,
      "targetSdkVersion": 35,
      "minSdkVersion": 24
    }
  }
}
```

**Si pas de prebuild**, EAS Build utilise les valeurs par défaut du SDK Expo.
Vérifier avec `npx expo config --type public` quelle version est utilisée.

---

## 2. Data Safety Section

### Formulaire obligatoire dans Google Play Console

Chaque app DOIT remplir le Data Safety form, même si elle ne collecte aucune donnée.

**Données à déclarer pour Altio** :

| Catégorie | Données | Collecté ? | Partagé ? |
|---|---|---|---|
| Personal info | Nom, email, téléphone | ✅ Oui | ⚠️ Avec Stripe |
| Financial info | Infos paiement | ✅ Via Stripe | Stripe uniquement |
| Location | Géolocalisation | ✅ Si utilisé | Non |
| App activity | Interactions in-app | ✅ Analytics | ⚠️ Si Firebase/Sentry |
| App info & performance | Crash logs, diagnostics | ✅ Si Sentry/Crashlytics | ✅ Oui |
| Device identifiers | Device ID, install ID | ⚠️ Vérifier SDKs | ⚠️ Vérifier |
| Photos/videos | Photos uploadées | ✅ Si upload photo | Non |
| Messages | Chat in-app | ✅ Si chat | Non |

**Points critiques** :
- Google utilise du ML pour croiser les déclarations avec le comportement réel des SDKs
- Incohérence = rejet ou retrait de l'app
- Chaque SDK tiers (Firebase, Sentry, Stripe, etc.) a sa propre collecte à déclarer
- Mettre à jour le form à chaque changement de pratique

**Audit des SDKs** — Vérifier dans package.json chaque dépendance native :
```bash
# SDKs courants qui collectent des données
# @react-native-firebase/* → analytics, crashlytics, device info
# @sentry/react-native → crash reports, device info
# expo-notifications → push tokens
# expo-location → géolocalisation
# stripe-react-native → infos paiement (via Stripe)
```

---

## 3. Permissions Android

### Permissions sensibles nécessitant justification

Certaines permissions Android déclenchent un examen manuel. Tu dois fournir une justification
dans le Play Console (Permissions Declaration Form).

| Permission | Quand c'est nécessaire | Justification requise ? |
|---|---|---|
| ACCESS_FINE_LOCATION | Géolocalisation précise | Oui |
| ACCESS_BACKGROUND_LOCATION | Location en arrière-plan | Oui (très scruté) |
| CAMERA | Photo/vidéo | Non (standard) |
| READ_CONTACTS | Accès contacts | Oui |
| READ_PHONE_STATE | Infos téléphone | Oui |
| SEND_SMS / READ_SMS | SMS | Oui (très restrictif) |
| READ_CALL_LOG | Journal d'appels | Oui (très restrictif) |
| POST_NOTIFICATIONS | Push (Android 13+) | Non mais runtime permission |
| FOREGROUND_SERVICE | Services premier plan | Oui (type requis) |

**Foreground Services (Android 14+)** :
Chaque foreground service doit déclarer son type dans le manifest :
```xml
<service
    android:name=".MyService"
    android:foregroundServiceType="location|dataSync" />
```

Types disponibles : camera, connectedDevice, dataSync, health, location, mediaPlayback,
mediaProjection, microphone, phoneCall, remoteMessaging, shortService, specialUse, systemExempted.

---

## 4. Account Deletion

### Obligatoire si l'app permet la création de compte

**Exigences** :
1. **In-app** : bouton de suppression accessible dans les paramètres
2. **Web** : lien de suppression fonctionnel (pour supprimer sans réinstaller l'app)
3. **Données** : suppression effective des données associées au compte
4. **Délai** : raisonnable (max 30-60 jours si justifié)

**Pour Altio avec Supabase** :
- Implémenter un endpoint/Edge Function de suppression
- Supprimer les données dans toutes les tables liées
- Révoquer les accès Stripe Connect du prestataire
- Envoyer un email de confirmation
- Fournir le lien web dans le Data Safety form

**Ce que Google vérifie** :
- Le bouton existe et fonctionne
- Le lien web est accessible
- Les données sont réellement supprimées (pas juste masquées)

---

## 5. Store Listing & Metadata

### Google Play Console requirements

| Élément | Requis | Spécifications |
|---|---|---|
| App title | ✅ | Max 30 caractères |
| Short description | ✅ | Max 80 caractères |
| Full description | ✅ | Max 4000 caractères |
| Screenshots phone | ✅ | 2-8, JPEG/PNG 24-bit, 320px-3840px, ratio 16:9 ou 9:16, < 8MB |
| Feature graphic | ✅ | 1024x500 PNG/JPEG |
| App icon | ✅ | 512x512 PNG 32-bit |
| Privacy policy URL | ✅ | Fonctionnelle et publique |
| Category | ✅ | Pertinente |
| Content rating | ✅ | Questionnaire IARC |
| Contact email | ✅ | Visible aux utilisateurs |
| Data Safety form | ✅ | Complété et à jour |

**Interdictions metadata** :
- Pas de claims "#1", "Best", "Top", "Install Now"
- Pas de device frames dans les screenshots
- Screenshots doivent montrer l'app réelle
- Description doit correspondre aux fonctionnalités réelles
- Pas de keyword stuffing

---

## 6. Content Policies

### Contenu interdit
- Contenu sexuel explicite
- Violence gratuite
- Discours haineux
- Harcèlement/bullying
- Contenu mettant en danger les enfants
- Activités illégales
- Jeux d'argent non autorisés

### UGC (User-Generated Content)
Si l'app permet du contenu utilisateur (avis, messages, photos) :
- Modération obligatoire (avant ou après publication)
- CGU claires interdisant contenu inapproprié
- Système de signalement in-app
- Mécanisme de blocage d'utilisateurs
- Réponse rapide aux signalements

### Comportement trompeur
- L'app doit faire ce qu'elle prétend
- Pas de fonctionnalités cachées
- Pas de claims impossibles
- Transparence sur l'utilisation de l'IA

---

## 7. Monetization & Billing

### Google Play Billing vs Stripe

**Pour les services physiques (cas Altio)** :
- Google Play Billing n'est PAS obligatoire
- Stripe Connect est autorisé pour les marketplaces de services physiques
- Les payouts aux prestataires via Connect ne sont pas soumis aux commissions Google

**Changement octobre 2025 (US)** :
- Les apps US peuvent utiliser des processeurs de paiement tiers même pour les biens numériques
- Stripe est explicitement supporté comme alternative
- Cela ne s'applique pas forcément à toutes les régions

**Play Billing Library** :
- Si utilisé, version 7+ requise
- Transparence sur les prix et renouvellements
- Annulation aussi facile que l'inscription

---

## 8. Technical Requirements

### Edge-to-edge (Android 15+)
- Les apps ciblant SDK 35 s'affichent edge-to-edge par défaut
- Gérer les insets : status bar, navigation bar, display cutout
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS` pour les fenêtres non flottantes
- Tester sur appareils avec notch/punch-hole

### Large screen support
- Layout responsive pour tablettes (600dp+)
- Pas obligatoire mais fortement recommandé
- Apps non optimisées : notice visible sur le Play Store pour les utilisateurs tablette
- Material Design 3 recommandé

### Play Integrity API
- Vérifie l'authenticité de l'app et l'intégrité de l'appareil
- Recommandé pour les apps avec paiements
- Protection contre la modification et la distribution non autorisée

---

## 9. Families Policy

### Si l'app cible les enfants (< 13 ans)

**Altio ne cible PAS les enfants**, mais au cas où :
- Pas de publicité personnalisée pour les < 12 ans
- Pas de tracking comportemental
- SDKs publicitaires certifiés "Families-compliant"
- Contenu adapté à l'âge
- Consentement parental requis

Pour Altio : s'assurer que le content rating IARC est correct (probablement "Everyone" ou "Teen").

---

## 10. Common Rejection Reasons

### Top rejections Play Store 2025

1. **Data Safety incohérent** — Déclarations ≠ comportement réel des SDKs
2. **Permissions injustifiées** — Permissions sensibles sans raison claire
3. **Crashs/bugs** — App instable sur certains appareils
4. **Privacy policy manquante/cassée** — URL non fonctionnelle
5. **Account deletion manquant** — Pas de mécanisme de suppression
6. **Metadata trompeuse** — Description ≠ app réelle
7. **Target SDK trop ancien** — Doit être à jour
8. **Foreground services non déclarés** — Types manquants dans manifest
9. **Contenu inapproprié** — UGC non modéré
10. **Closed testing non fait** — Google recommande 20+ testeurs pendant 14+ jours

**Statistiques 2025** :
- 1.75M+ apps rejetées
- 80K+ comptes développeur bannis
- Temps de review moyen : ~24h

**Astuce** : Google recommande fortement de faire un closed testing (20+ testeurs, 14+ jours)
avant de soumettre en production. Cela accélère la review et réduit les rejets.
