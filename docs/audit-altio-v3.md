# AUDIT ALTIO — V3 (rapport Claude Code)
> Date : 26 mars 2026 | 3ème audit comparatif
> Mode : Lecture seule. Aucun fichier modifié.
> Note globale : **5.8 / 10** (était 5.5 → +0.3)

---

## RÉSUMÉ EXÉCUTIF

**Bonne nouvelle :** les `any` ont explosé de l'autre côté — ils sont quasi-disparus (186 → 3 faux positifs dans les fichiers i18n). C'est le plus gros progrès de cet audit. TypeScript est maintenant propre avec `src/types/api.ts` (150+ interfaces). L'auth PKCE est opérationnel partout, `.env.production` est supprimé du repo.

**Mauvaise nouvelle :** api.ts a encore grossi (+131 lignes → 3447 lignes), les god components aussi (+12 lignes en tout), 0 test toujours, 0 CI/CD, 10 Edge Functions toujours sans validation.

---

## TABLEAU DE BORD COMPLET

| # | Problème | V1 | V2 | V3 | Statut |
|---|----------|----|----|-----|--------|
| 1 | CORS `*` | 🔴 | ✅ | ✅ | **FIXÉ** |
| 2 | .env.production exposé | 🔴 | ⚠️ | ✅ Supprimé + gitignore | **FIXÉ** |
| 3 | Instances de `any` | 59 | 186 🔴 | 3 (faux positifs i18n) ✅ | **FIXÉ** |
| 4 | Fire-and-forget promise | 🔴 ~8 | ⚠️ 1 | ⚠️ 1 (ligne 353) | **PAS TOUCHÉ** |
| 5 | Tests automatisés | 0 | 0 | 0 | **PAS TOUCHÉ** |
| 6 | God Components | 3332L | 3344L | 3344L | **PAS TOUCHÉ** |
| 7 | api.ts monolithique | 3313L | 3316L | 3447L 🔴 | **RÉGRESSÉ** |
| 8 | Validation Edge Functions | 0/17 | 7/17 | 6/16 🔴 | **RÉGRESSÉ %** |
| 9 | Fuite erreurs internes | 🔴 | ⚠️ | ⚠️ 43 console.log | **PARTIEL** |
| 10 | Auth implicit → PKCE | 🟠 | ⚠️ web seul | ✅ Web + natif | **FIXÉ** |
| 11 | Composants réutilisables | 3 | 3 | 3 | **PAS TOUCHÉ** |
| 12 | CI/CD | ❌ | ❌ | ❌ | **PAS TOUCHÉ** |
| 13 | Legacy admin/ | ⚠️ | ✅ | ✅ | **FIXÉ** |
| 14 | i18n strings | ⚠️ | ⚠️ | ⚠️ | **PARTIEL** |
| 15 | Interfaces TypeScript | ❌ | ❌ | ✅ 150+ types | **NOUVEAU — FIXÉ** |
| 16 | useMemo / perf | ❌ | ❌ | ⚠️ useCallback OK, useMemo absent | **PARTIEL** |

---

## SCORES PAR DOMAINE

| Domaine | V1 | V2 | V3 |
|---------|----|----|-----|
| Sécurité (CORS, auth, env) | 4/10 | 6/10 | **8/10** ⬆️ |
| Qualité du code (types, any) | 5/10 | 4/10 | **8/10** ⬆️ |
| Tests | 1/10 | 1/10 | **1/10** — |
| Architecture (api.ts, composants) | 4/10 | 4/10 | **3/10** ⬇️ |
| Gestion erreurs | 3/10 | 5/10 | **5/10** — |
| DevOps / CI | 2/10 | 2/10 | **2/10** — |
| **GLOBAL** | **6.5** | **5.5** | **5.8** ⬆️ |

---

## CE QUI A ÉTÉ BIEN CORRIGÉ ✅

### 1. TypeScript — Quasi parfait
**Avant :** 186 `any`. **Maintenant :** 3 faux positifs dans des fichiers de traduction.
Le fichier `src/types/api.ts` est complet avec 150+ interfaces couvrant Mission, User, Emergency, Quote, Invoice, Property, Provider, Payment et tous leurs DTOs.

### 2. Sécurité auth — PKCE partout
PKCE activé sur web ET natif. Le commentaire "implicit" dans supabase.ts est trompeur mais le comportement est correct.

### 3. .env.production — Nettoyé
Fichier supprimé, .gitignore couvre `*.env` et `*.env.*`, historique git propre.

### 4. CORS — Centralisé
`_shared/cors.ts` avec origin configurable par variable d'environnement. Propre.

---

## CE QUI DOIT ÊTRE CORRIGÉ — BLOCS PRÊTS À COLLER DANS CLAUDE CODE

---

### 🔴 BLOC 1 — Fire-and-forget (15 min)

```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend

CORRECTION URGENTE — 1 promise fire-and-forget restante

Fichier : src/api.ts, ligne 353
Problème : appel geocodeAddress sans .catch() — échoue silencieusement

Code actuel :
geocodeAddress(prop.address).then(coords => {
  if (coords) {
    supabase.from('properties').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', prop.id);
  }
});

Code corrigé :
geocodeAddress(prop.address)
  .then(coords => {
    if (coords) {
      return supabase
        .from('properties')
        .update({ latitude: coords.lat, longitude: coords.lng })
        .eq('id', prop.id);
    }
  })
  .catch(err => {
    if (__DEV__) console.warn('Geocoding silently failed:', err);
  });

Vérifier aussi que le supabase.update() intérieur est awaité ou que son erreur est catchée.
```

---

### 🔴 BLOC 2 — Validation des 10 Edge Functions restantes (2h)

```
Projet : Altio — Supabase Edge Functions (Deno)
Dossier : /Users/certideal/Downloads/Altio/altio/supabase/functions/

VALIDATION INPUTS — 10 fonctions à sécuriser

Le module validate.ts existe déjà dans _shared/validate.ts avec :
- assertString(val, name)
- assertUUID(val, name)
- assertPositiveInt(val, name)
- assertOneOf(val, allowed, name)
- class ValidationError

Fonctions à traiter (par ordre de priorité) :

1. stripe-webhook/index.ts
   → Vérifier signature Stripe AVANT de parser le body
   → Valider event.type est dans la liste attendue

2. delete-account/index.ts
   → assertUUID(userId, 'userId')
   → Vérifier que l'appelant est bien le propriétaire du compte (anti-IDOR)

3. export-user-data/index.ts
   → assertUUID(userId, 'userId')
   → Rate limit : 1 export/24h max

4. sync-ical/index.ts
   → assertUUID(propertyId, 'propertyId')
   → Valider que l'URL iCal commence par https://

5. sync-google-calendar/index.ts
   → assertUUID(providerId, 'providerId')
   → assertUUID(missionId, 'missionId')

6. google-calendar-callback/index.ts
   → Valider que le state OAuth n'est pas vide
   → Valider code présent

7. connect-google-calendar/index.ts
   → assertUUID(providerId, 'providerId')

8. notify-admin-new-provider/index.ts
   → assertUUID(providerId, 'providerId')
   → Cette fonction devrait être service-role only (pas appelable par un user)

9. annual-report/index.ts
   → Vérifier que l'appelant est admin (is_admin check)
   → assertPositiveInt(year, 'year') avec range 2024-2030

10. generate-credit-note/index.ts (si existe)
    → assertUUID(invoiceId, 'invoiceId')
    → Vérifier que la facture appartient bien à l'appelant

Pattern à suivre (identique aux fonctions déjà validées) :
import { assertString, assertUUID, ValidationError } from '../_shared/validate.ts';

try {
  const body = await req.json();
  assertUUID(body.missionId, 'missionId');
  // ... logique métier
} catch (err) {
  if (err instanceof ValidationError) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
  }
  throw err;
}
```

---

### 🟠 BLOC 3 — Découper api.ts en services (4h)

```
Projet : Altio — React Native / Expo Router / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend

REFACTORING api.ts (3447 lignes → 4 fichiers ~800 lignes)

Créer la structure :
frontend/src/api/
├── index.ts          ← re-export de tout pour backward compat
├── missions.ts       ← fonctions mission* + application*
├── payments.ts       ← fonctions payment* + stripe* + invoice*
├── emergencies.ts    ← fonctions emergency* + quote*
└── users.ts          ← fonctions user* + provider* + owner* + property*

Étapes :
1. Créer frontend/src/api/ directory
2. Couper api.ts par domaine (utilise les commentaires existants comme séparateurs)
3. Chaque fichier garde ses imports Supabase + types
4. frontend/src/api/index.ts fait : export * from './missions'; export * from './payments'; etc.
5. Mettre à jour l'import dans tous les écrans :
   import { getMissions } from '../src/api'; → reste identique grâce au index.ts

NE PAS changer les signatures des fonctions.
NE PAS changer les noms des fonctions.
Faire tsc --noEmit après pour vérifier 0 erreur.
```

---

### 🟠 BLOC 4 — Supprimer les console.log en production (1h30)

```
Projet : Altio — React Native frontend
Dossier : /Users/certideal/Downloads/Altio/altio/frontend

43 console.log/error directs à remplacer

Créer d'abord src/lib/logger.ts :

import * as Sentry from '@sentry/react-native';

export const logger = {
  log: (...args: any[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    if (__DEV__) console.error(message, error);
    if (!__DEV__ && error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    }
  },
};

Puis remplacer dans tous les fichiers :
console.log(...)  → logger.log(...)
console.warn(...) → logger.warn(...)
console.error(...) → logger.error(...)

Grep pour trouver tous les occurrences :
grep -rn "console\." frontend/src/ frontend/app/
```

---

### 🟡 BLOC 5 — Composants UI partagés (3h)

```
Projet : Altio — React Native
Dossier : /Users/certideal/Downloads/Altio/altio/frontend/src/components/

Créer un dossier ui/ avec les composants manquants.
S'appuyer sur theme.ts pour COLORS, FONTS, RADIUS, SHADOWS.

À créer :

1. src/components/ui/Button.tsx
   Props : label, onPress, variant ('primary'|'secondary'|'danger'|'ghost'), loading, disabled
   Utiliser : COLORS.brandPrimary, COLORS.error, RADIUS.md, FONTS.body

2. src/components/ui/Input.tsx
   Props : value, onChangeText, placeholder, label, error, secureTextEntry
   Utiliser : même style que les inputs dans missions.tsx

3. src/components/ui/Card.tsx
   Props : children, style, onPress?
   Utiliser : SHADOWS.card, RADIUS.lg, COLORS.surface

4. src/components/ui/Badge.tsx
   Props : label, color ('success'|'warning'|'error'|'info'|'neutral')
   Utiliser : STATUS_LABELS existants dans theme.ts

5. src/components/ui/EmptyState.tsx
   Props : title, subtitle, icon?, action?
   Remplace les "<Text>Aucun résultat</Text>" dispersés partout

Après création, remplacer les implémentations inline dans :
- (owner)/dashboard.tsx
- (provider)/my-missions.tsx
- mission/[id].tsx
- emergency.tsx
```

---

### 🟡 BLOC 6 — CI/CD GitHub Actions (2h)

```
Projet : Altio
Dossier : /Users/certideal/Downloads/Altio/altio/

Créer .github/workflows/ci.yml :

name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: cd frontend && npm ci

      - name: TypeScript check
        run: cd frontend && npx tsc --noEmit

      - name: ESLint
        run: cd frontend && npx eslint . --ext .ts,.tsx --max-warnings 0

      - name: Check for any types
        run: |
          COUNT=$(grep -r ": any\|as any" frontend/src/ frontend/app/ | grep -v ".d.ts" | wc -l)
          echo "Found $COUNT any types"
          if [ $COUNT -gt 10 ]; then
            echo "Too many 'any' types: $COUNT (max: 10)"
            exit 1
          fi

Objectif : ce CI doit bloquer tout futur ajout de `any` ou d'erreur TypeScript.
```

---

### 🟡 BLOC 7 — Premiers tests automatisés (4h)

```
Projet : Altio — Tests
Dossier : /Users/certideal/Downloads/Altio/altio/frontend/

SETUP VITEST + premiers tests critiques

1. Installer :
npm install -D vitest @testing-library/react-native @testing-library/jest-native

2. Créer vitest.config.ts :
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});

3. Ajouter dans package.json :
"test": "vitest run",
"test:watch": "vitest"

4. Créer ces fichiers de test en priorité :

src/__tests__/api.missions.test.ts
→ Tester getMissions(), createMission(), updateMissionStatus()
→ Mocker Supabase client

src/__tests__/api.payments.test.ts
→ Tester createPaymentIntent(), capturePayment()
→ Mocker fetch vers Edge Functions

src/__tests__/auth.test.ts
→ Tester signIn(), signOut(), session persistence

src/__tests__/types.test.ts
→ Vérifier que les types Mission et Emergency compilent
→ Tester les STATUS_LABELS du theme

Objectif minimum : 20 tests qui passent avant de continuer.
```

---

## OBJECTIFS POUR L'AUDIT V4

| Métrique | V3 (actuel) | Objectif V4 |
|----------|-------------|-------------|
| Note globale | 5.8/10 | **7.5/10** |
| Instances `any` | ~3 (faux positifs) | 0 |
| Tests automatisés | 0 | > 30 |
| Edge Functions validées | 6/16 | 16/16 |
| api.ts lignes | 3447 | < 800 (découpé) |
| God Components | 3×1000+ lignes | < 500L chacun |
| CI/CD | Non | GitHub Actions actif |
| console.log directs | 43 | 0 (via logger.ts) |

---

## RÉCAP POUR CLAUDE CODE — PAR ORDRE DE PRIORITÉ

| Priorité | Bloc | Effort | Impact |
|----------|------|--------|--------|
| 🔴 1 | Fire-and-forget ligne 353 | 15 min | Bug réel |
| 🔴 2 | Validation 10 Edge Functions | 2h | Sécurité |
| 🟠 3 | Découper api.ts en 4 services | 4h | Maintenabilité |
| 🟠 4 | Logger.ts remplace console.log | 1h30 | Prod readiness |
| 🟡 5 | 5 composants UI partagés | 3h | Qualité |
| 🟡 6 | CI/CD GitHub Actions | 2h | Filet de sécurité |
| 🟡 7 | 20 tests Vitest | 4h | Couverture |
