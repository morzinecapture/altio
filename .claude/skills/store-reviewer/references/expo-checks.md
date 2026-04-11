# Expo & React Native — Vérifications spécifiques

Référence pour les checks propres à l'écosystème Expo/React Native/EAS.
Lis ce fichier pour les vérifications techniques spécifiques au stack Altio.

## Table des matières
1. [app.json / app.config.ts](#1-app-config)
2. [eas.json](#2-eas-json)
3. [EAS Submit](#3-eas-submit)
4. [Privacy Manifest Expo](#4-privacy-manifest)
5. [Dépendances & SDKs](#5-dependencies)
6. [Supabase Auth](#6-supabase-auth)
7. [Stripe Connect](#7-stripe-connect)
8. [Deep Linking](#8-deep-linking)
9. [Performance React Native](#9-performance)
10. [Scripts de vérification](#10-scripts)

---

## 1. app.json / app.config.ts

### Champs critiques pour la soumission

```jsonc
{
  "expo": {
    // === IDENTITÉ ===
    "name": "Altio",                          // ❌ si manquant
    "slug": "altio",                          // ❌ si manquant
    "version": "1.0.0",                       // ❌ si manquant (semver)
    "owner": "altio-app",                     // ⚠️ recommandé

    // === ICÔNE & SPLASH ===
    "icon": "./assets/icon.png",              // ❌ si manquant (1024x1024 PNG)
    "splash": {                               // ⚠️ si manquant
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FFFFFF"
    },

    // === iOS ===
    "ios": {
      "bundleIdentifier": "com.altio.app",    // ❌ si manquant
      "buildNumber": "1",                     // ❌ si manquant (INCRÉMENTER à chaque soumission)
      "supportsTablet": false,                // ⚠️ expliciter
      "infoPlist": {
        // Permissions avec descriptions FR
        "NSCameraUsageDescription": "...",
        "NSPhotoLibraryUsageDescription": "..."
      },
      "privacyManifests": {                   // ❌ obligatoire
        "NSPrivacyAccessedAPITypes": [...]
      },
      "associatedDomains": [                  // ⚠️ si deep linking
        "applinks:altio.app"
      ],
      "config": {
        "usesNonExemptEncryption": false      // ⚠️ important pour éviter export compliance
      }
    },

    // === ANDROID ===
    "android": {
      "package": "com.altio.app",             // ❌ si manquant
      "versionCode": 1,                       // ❌ si manquant (INCRÉMENTER à chaque soumission)
      "adaptiveIcon": {                       // ⚠️ recommandé
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "permissions": [                        // Lister explicitement
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },

    // === PLUGINS ===
    "plugins": [
      // Chaque plugin listé DOIT être installé dans package.json
      // Vérifier avec : npm ls <plugin-name>
    ]
  }
}
```

### Vérifications automatisables

```bash
# Vérifier la config Expo complète
npx expo config --type public

# Vérifier que tous les plugins sont installés
npx expo doctor

# Vérifier les versions
npx expo-env-info
```

---

## 2. eas.json

### Configuration de build production

```jsonc
{
  "build": {
    "production": {
      "ios": {
        "buildConfiguration": "Release",
        "credentialsSource": "remote"        // ou "local"
      },
      "android": {
        "buildType": "app-bundle",           // ❌ DOIT être "app-bundle" (AAB)
        "credentialsSource": "remote"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "...",                   // App Store Connect App ID
        "appleTeamId": "..."
      },
      "android": {
        "serviceAccountKeyPath": "./google-services.json",
        "track": "internal"                  // internal → closed → production
      }
    }
  }
}
```

**Checks** :
- ❌ Profil `production` absent → ne peut pas soumettre
- ❌ Android buildType != "app-bundle" → Google Play rejettera
- ⚠️ Credentials non configurées → `eas credentials` pour setup
- ⚠️ Track Android = "production" directement → risqué, passer par "internal" d'abord

---

## 3. EAS Submit

### Checklist pré-soumission

**iOS** :
- [ ] Apple Developer Program actif ($99/an)
- [ ] App créée dans App Store Connect
- [ ] Certificates & provisioning profiles OK (`eas credentials`)
- [ ] buildNumber incrémenté depuis la dernière soumission
- [ ] Privacy Manifest configuré
- [ ] Screenshots uploadées dans App Store Connect (pas géré par EAS)
- [ ] Notes for Review remplies (identifiants test, explication paiements)

**Android** :
- [ ] Google Play Developer account actif ($25 one-time)
- [ ] App créée dans Google Play Console
- [ ] Service Account Key configurée
- [ ] versionCode incrémenté
- [ ] Première soumission faite manuellement (EAS ne peut pas créer l'app)
- [ ] Data Safety form rempli
- [ ] Closed testing fait (20+ testeurs, 14+ jours recommandé)

---

## 4. Privacy Manifest Expo

### Comment vérifier et configurer

**Étape 1 — Identifier les APIs requises** :
```bash
# Après prebuild, chercher les usages
npx expo prebuild --clean
grep -r "NSPrivacyAccessedAPI" ios/
```

**Étape 2 — Lister les SDKs avec manifests** :
```bash
find node_modules -name "PrivacyInfo.xcprivacy" -type f 2>/dev/null
```

**Étape 3 — Configurer dans app.json** :
Les raisons trouvées dans les manifests des SDKs doivent être agrégées dans
`expo.ios.privacyManifests.NSPrivacyAccessedAPITypes`.

**SDKs React Native courants et leurs APIs requises** :

| SDK | API Type | Reason Code |
|---|---|---|
| @react-native-async-storage | UserDefaults | CA92.1 |
| react-native-device-info | SystemBootTime, DiskSpace | 35F9.1, E174.1 |
| @sentry/react-native | FileTimestamp, SystemBootTime | DDA9.1, 35F9.1 |
| expo-file-system | FileTimestamp | DDA9.1, C617.1 |
| expo-secure-store | UserDefaults | CA92.1 |
| react-native-reanimated | FileTimestamp | C617.1 |

---

## 5. Dépendances & SDKs

### Audit des dépendances pour la conformité

**Vérifications à faire** :

1. **Pas de dépendances dépréciées** :
   ```bash
   npx expo doctor
   npm audit
   ```

2. **Pas de dépendances avec vulnérabilités connues** :
   ```bash
   npm audit --production
   ```

3. **Licences compatibles** :
   ```bash
   npx license-checker --production --summary
   ```
   Vérifier qu'aucune licence GPL ne contamine le projet (problème App Store).

4. **react-native-code-push** :
   - ⚠️ Archivé par Microsoft en mai 2025
   - Si utilisé, risque de rejet pour OTA non conforme
   - Préférer EAS Update pour les mises à jour OTA

5. **SDK versions** :
   - Expo SDK doit être une version récente (vérifier expo.dev pour la dernière stable)
   - React Native doit correspondre à la version supportée par le SDK Expo

---

## 6. Supabase Auth

### Conformité stores avec Supabase

**Sign in with Apple** :
```typescript
// Configuration Supabase pour Apple Sign In
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';

// ✅ Utiliser le SDK natif Apple (pas un redirect web)
const credential = await AppleAuthentication.signInAsync({
  requestedScopes: [
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ],
});

// Puis passer le token à Supabase
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken!,
});
```

**Session storage sécurisé** :
```typescript
// ❌ NE PAS utiliser AsyncStorage en clair pour les tokens
// ✅ Utiliser expo-secure-store
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
  },
});
```

**Account deletion** :
```typescript
// Edge Function ou API pour supprimer le compte
// Doit supprimer : auth user + toutes les données liées + révoquer Stripe
const deleteAccount = async () => {
  const { error } = await supabase.functions.invoke('delete-account');
  if (!error) {
    await supabase.auth.signOut();
    // Rediriger vers écran de confirmation
  }
};
```

**Checklist Supabase** :
- [ ] Auth native (pas de redirect navigateur)
- [ ] Sign in with Apple si login social
- [ ] Tokens dans SecureStore
- [ ] Suppression de compte implémentée
- [ ] Email verification activée
- [ ] Password reset fonctionnel
- [ ] Région Supabase EU si utilisateurs EU (RGPD)

---

## 7. Stripe Connect

### Conformité marketplace

**Ce qui est autorisé sans IAP** :
- Paiement de services physiques (ménage, maintenance, conciergerie) → ✅
- Commissions plateforme sur ces services → ✅
- Payouts aux prestataires via Connect → ✅

**Ce qui nécessiterait l'IAP** :
- Abonnement pour fonctionnalités premium in-app → ❌ (nécessite IAP Apple/Google)
- Contenu numérique payant → ❌ (nécessite IAP)

**Pour la soumission Apple** — Dans "Notes for Review" :
```
Altio is a marketplace for physical services (cleaning, maintenance,
property management) for vacation rentals. All payments are for
real-world services performed by service providers, not digital goods.
Payments are processed via Stripe Connect. The platform collects a
commission on each transaction for facilitating the marketplace.
```

**Vérifications Stripe** :
- [ ] Stripe SDK intégré (pas de manipulation directe de données carte)
- [ ] PCI compliance (Stripe gère le PCI DSS)
- [ ] Conditions de service Stripe acceptées
- [ ] KYC prestataires via Stripe Connect onboarding
- [ ] Transparence sur les frais pour l'utilisateur

---

## 8. Deep Linking

### Universal Links (iOS) & App Links (Android)

**iOS — apple-app-site-association** :
Le fichier AASA doit être hébergé sur votre domaine :
```
https://altio.app/.well-known/apple-app-site-association
```

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.altio.app",
        "paths": ["/mission/*", "/provider/*", "/property/*"]
      }
    ]
  }
}
```

**Android — assetlinks.json** :
```
https://altio.app/.well-known/assetlinks.json
```

**Expo Router** :
```json
// app.json
{
  "expo": {
    "ios": {
      "associatedDomains": ["applinks:altio.app"]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{ "scheme": "https", "host": "altio.app", "pathPrefix": "/" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

---

## 9. Performance React Native

### Optimisations recommandées avant soumission

1. **Hermes** : s'assurer qu'il est activé
   ```json
   // app.json — Hermes est activé par défaut dans Expo SDK 47+
   // Vérifier qu'il n'est pas désactivé
   ```

2. **Bundle size** :
   ```bash
   # Analyser la taille du bundle
   npx react-native-bundle-visualizer
   ```

3. **Startup time** :
   - Lazy loading des écrans non critiques
   - Pas de fetch lourd au démarrage
   - Splash screen pendant le chargement initial

4. **Mémoire** :
   - Utiliser FlatList (pas ScrollView) pour les listes
   - Images optimisées (pas de PNG 4K en mémoire)
   - Cleanup des listeners/subscriptions

5. **Animations** :
   - Reanimated pour les animations fluides
   - Pas d'animations bloquant le JS thread

---

## 10. Scripts de vérification

### Commandes utiles pour l'audit

```bash
# === Configuration ===
# Voir la config Expo complète
npx expo config --type public

# Vérifier la santé du projet
npx expo doctor

# Infos environnement
npx expo-env-info

# === Privacy ===
# Chercher les Privacy Manifests dans les dépendances
find node_modules -name "PrivacyInfo.xcprivacy" -type f 2>/dev/null

# === Sécurité ===
# Audit des vulnérabilités
npm audit --production

# === Licences ===
# Vérifier les licences (installer d'abord : npm i -g license-checker)
npx license-checker --production --summary

# === Taille ===
# Taille du bundle JS
npx react-native-bundle-visualizer

# === Permissions ===
# Après prebuild, vérifier les permissions
npx expo prebuild --clean
# iOS
grep -r "UsageDescription" ios/*/Info.plist
# Android
grep -r "uses-permission" android/app/src/main/AndroidManifest.xml

# === Build de test ===
# Build de production locale (pour tester avant soumission)
eas build --platform ios --profile production --local
eas build --platform android --profile production --local
```
