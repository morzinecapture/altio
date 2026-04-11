# Apple App Store — Critères de conformité détaillés

Référence complète pour l'audit iOS. Lis ce fichier quand tu audites la conformité App Store.

## Table des matières
1. [Privacy Manifest & Required Reason APIs](#1-privacy-manifest)
2. [Permissions iOS (Info.plist)](#2-permissions-ios)
3. [Sign in with Apple](#3-sign-in-with-apple)
4. [App Transport Security](#4-app-transport-security)
5. [Design & Human Interface Guidelines](#5-design-hig)
6. [In-App Purchase Rules](#6-in-app-purchase)
7. [UGC & Safety](#7-ugc-safety)
8. [Technical Requirements](#8-technical)
9. [Metadata & Store Listing](#9-metadata)
10. [Common Rejection Reasons](#10-rejections)

---

## 1. Privacy Manifest

### Obligatoire depuis mai 2024 (enforcement complet)

Le fichier `PrivacyInfo.xcprivacy` doit déclarer :

**NSPrivacyAccessedAPITypes** — APIs nécessitant une raison :

| API Category | Exemple d'usage | Reason Codes courants |
|---|---|---|
| User Defaults | AsyncStorage, preferences | CA92.1 |
| File Timestamp | Accès dates fichiers | DDA9.1, C617.1 |
| System Boot Time | Calcul uptime | 35F9.1 |
| Disk Space | Vérification espace libre | E174.1, 85F4.1 |
| Active Keyboards | Détection claviers | 54BD.1 |

**NSPrivacyCollectedDataTypes** — Données collectées :
- Contact info (nom, email, téléphone)
- Location data
- Identifiers (user ID, device ID)
- Usage data (analytics)
- Diagnostics (crash logs)
- Financial info (si paiements)

**Pour Expo** — Configuration dans app.json :
```json
{
  "expo": {
    "ios": {
      "privacyManifests": {
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
            "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["DDA9.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
            "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
            "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
          }
        ]
      }
    }
  }
}
```

**Vérification des SDKs tiers** :
Chercher `PrivacyInfo.xcprivacy` dans node_modules :
```bash
find node_modules -name "PrivacyInfo.xcprivacy" -type f
```
Chaque manifest trouvé doit être intégré dans la configuration app.

---

## 2. Permissions iOS

### Clés Info.plist obligatoires

Chaque permission utilisée DOIT avoir une description humaine en français (ou langue principale).

| Permission | Clé Info.plist | Quand c'est requis |
|---|---|---|
| Caméra | NSCameraUsageDescription | Photo profil, scan document |
| Micro | NSMicrophoneUsageDescription | Enregistrement audio |
| Photos | NSPhotoLibraryUsageDescription | Upload photo |
| Ajout photos | NSPhotoLibraryAddUsageDescription | Sauvegarde photo |
| Localisation (usage) | NSLocationWhenInUseUsageDescription | Géolocalisation services |
| Localisation (toujours) | NSLocationAlwaysAndWhenInUseUsageDescription | Background location |
| Contacts | NSContactsUsageDescription | Import contacts |
| Calendrier | NSCalendarsUsageDescription | Sync calendrier |
| Notifications | — (pas de clé Info.plist, mais APNs config requise) | Push notifications |
| Face ID | NSFaceIDUsageDescription | Auth biométrique |
| Réseau local | NSLocalNetworkUsageDescription | Bonjour/mDNS |
| Bluetooth | NSBluetoothAlwaysUsageDescription | Connexion BLE |
| Tracking | NSUserTrackingUsageDescription | ATT framework |

**Règle critique** : une permission demandée sans description = rejet automatique.

**Pour Expo** — Les permissions se configurent dans app.json sous `ios.infoPlist` :
```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "Altio utilise la caméra pour prendre des photos de votre bien.",
      "NSPhotoLibraryUsageDescription": "Altio accède à vos photos pour les associer à vos biens."
    }
  }
}
```

---

## 3. Sign in with Apple

### Règle (Guideline 4.8)

**OBLIGATOIRE si** l'app propose un login social tiers (Google, Facebook, Twitter, etc.).

**Exceptions** (pas besoin de SIWA) :
- App utilise UNIQUEMENT un système de compte propriétaire (email/password)
- App entreprise/éducation avec comptes institutionnels
- App gouvernementale avec identité citoyenne

**Implémentation avec Supabase** :
- Utiliser le provider Apple natif de Supabase
- NE PAS rediriger vers un navigateur web (Guideline 4.0 — mauvaise UX)
- L'utilisateur doit pouvoir masquer son email (Apple Private Relay)
- Le bouton doit être affiché avec la même importance que les autres options de login

**Vérification** :
```
✅ apple-signin présent dans les providers Supabase → PASS
❌ google/facebook login SANS apple → FAIL immédiat
```

---

## 4. App Transport Security

- TLS 1.2+ obligatoire pour toutes les connexions réseau
- HTTPS requis par défaut
- Les exceptions ATS (`NSAppTransportSecurity > NSAllowsArbitraryLoads`) doivent être justifiées
- Supabase utilise HTTPS par défaut → OK
- Vérifier qu'aucune URL HTTP n'est hardcodée dans le code

---

## 5. Design & Human Interface Guidelines

### Critères de rejet liés au design

- **Minimum functionality** : l'app doit offrir une vraie valeur ajoutée (pas un simple wrapper web)
- **Contenu placeholder** : aucun "Lorem ipsum", images stock évidentes, ou données test
- **Navigation** : tous les boutons/liens doivent fonctionner
- **Cohérence** : utiliser les composants iOS natifs de manière cohérente
- **Taille texte** : supporter Dynamic Type (accessibilité)
- **Safe area** : respecter les safe areas (notch, home indicator)
- **iPad** : si `supportsTablet: true`, le layout DOIT fonctionner sur iPad
- **Dark mode** : pas obligatoire mais si supporté, pas de bugs visuels
- **Orientation** : supporter au minimum portrait; si landscape, les deux doivent fonctionner

---

## 6. In-App Purchase

### Quand l'IAP est obligatoire

**Biens numériques** (contenus virtuels, abonnements de contenu, fonctionnalités premium) → IAP obligatoire

**Services physiques** (ménage, conciergerie, maintenance) → IAP PAS obligatoire

Altio vend des services physiques via une marketplace → **Stripe Connect est autorisé**.

**Attention** : si Altio ajoute un jour des fonctionnalités premium numériques (ex: abonnement pour voir plus de prestataires), cela devrait passer par l'IAP.

### Ce qu'il faut documenter dans la soumission
- Expliquer clairement que les transactions concernent des services physiques
- Montrer que les paiements passent par Stripe Connect pour les prestataires
- Démontrer que l'app ne vend pas de contenu numérique

---

## 7. UGC & Safety

### Si l'app a du contenu généré par les utilisateurs

Obligatoire :
- Filtrage de contenu avant publication (ou modération rapide après)
- Signalement de contenu offensant avec réponse rapide
- Possibilité de bloquer les utilisateurs abusifs
- CGU interdisant le contenu inapproprié
- Modération active (humaine ou automatique)

Pour Altio (avis, messages, photos de biens) :
- Système de signalement d'avis
- Modération des messages du chat
- Validation des photos uploadées

---

## 8. Technical Requirements

- **iOS SDK** : build avec le SDK le plus récent (iOS 18+ en 2026)
- **Architecture** : 64-bit uniquement
- **Hermes** : recommandé pour React Native (meilleures performances)
- **Taille** : pas de limite dure mais > 200MB nécessite justification
- **Code push** : OTA updates pour bug fixes OK, mais PAS pour changer les fonctionnalités principales
- **Background modes** : activer uniquement ceux utilisés (notifications, location si nécessaire)
- **Crash rate** : viser < 1% ; un crash pendant la review = rejet immédiat

---

## 9. Metadata & Store Listing

### Checklist App Store Connect

| Élément | Requis | Notes |
|---|---|---|
| App name | ✅ | Max 30 caractères |
| Subtitle | Recommandé | Max 30 caractères |
| Description | ✅ | Précise, pas de fausses promesses |
| Keywords | ✅ | 100 caractères max, pertinents |
| Screenshots iPhone | ✅ | 6.7" (1290x2796) et 6.5" (1284x2778) |
| Screenshots iPad | Si supportsTablet | 12.9" (2048x2732) |
| App icon | ✅ | 1024x1024 PNG, pas de transparence |
| Privacy policy URL | ✅ | Doit être accessible publiquement |
| Support URL | ✅ | Doit fonctionner |
| Age rating | ✅ | Questionnaire IARC |
| Category | ✅ | Choisir la plus pertinente |
| Copyright | ✅ | Format "© 2026 Altio" |
| Contact info | ✅ | Email/téléphone du développeur |

---

## 10. Common Rejection Reasons (Top 10)

1. **Crashs** (~30% des rejets) — Tester sur vrais appareils
2. **Contenu incomplet/placeholder** (~40%) — Pas de données test
3. **Privacy violations** (~15-20%) — Privacy manifest + policy
4. **Sign in with Apple manquant** — Si login social
5. **Permissions sans description** — NSUsageDescription
6. **IAP non utilisé pour biens numériques** — Pas le cas d'Altio
7. **Metadata trompeuse** — Screenshots ≠ app réelle
8. **Login test non fourni** — Fournir identifiants de test au reviewer
9. **Links cassés** — Toutes les URLs doivent fonctionner
10. **Performance** — Lenteur, freeze, mémoire

**Astuce review** : dans App Store Connect, il y a un champ "Notes for Review" — utilise-le pour :
- Fournir des identifiants de test (email/mot de passe)
- Expliquer le modèle de paiement (Stripe Connect pour services physiques)
- Expliquer les permissions demandées
- Signaler les fonctionnalités qui nécessitent un contexte particulier
