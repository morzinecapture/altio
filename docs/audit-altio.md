# AUDIT COMPLET — ALTIO CODEBASE
> Date : 25 mars 2026 | Audité par : Claude (Cowork) — 4 agents parallèles
> Scope : Frontend React Native + Backend Supabase + Edge Functions + Sécurité
> Mode : Lecture seule — aucun fichier modifié

---

## NOTE GLOBALE : 6.5 / 10

| Domaine | Note | Verdict |
|---------|------|---------|
| Architecture & Structure | 5.5/10 | ⚠️ Monolithique (api.ts), 0 tests, faible réutilisation composants |
| Qualité Code Frontend | 6.5/10 | ⚠️ 59x `any`, fire-and-forget promises, écrans trop longs |
| Sécurité | 6.5/10 | 🔴 CORS `*` partout, .env.production exposé, validation inputs faible |
| Backend (Edge Functions) | 7.5/10 | ✅ Factur-X solide, RLS bien configuré, rate limiting en place |
| Base de données (Migrations) | 8.5/10 | ✅ 36 migrations versionnées, RLS complet, bons types de données |

**Verdict : Production-adjacent. Les features sont là, mais il faut un sprint de hardening avant le lancement.**

---

## 🔴 CRITIQUES — À corriger immédiatement

### 1. CORS `Access-Control-Allow-Origin: '*'` sur les 17 Edge Functions
**Fichiers :** Toutes les Edge Functions (create-payment-intent, delete-account, stripe-webhook, etc.)
**Risque :** N'importe quel site peut appeler vos fonctions de paiement et suppression de compte.
**Fix dans Claude Code :**
```typescript
// Remplacer dans chaque Edge Function :
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || 'https://altio.app',
  // ... reste identique
};
```
**Effort :** 30 min — chercher/remplacer dans les 17 fichiers

---

### 2. `.env.production` commité dans le repo avec des clés
**Fichier :** `frontend/.env.production`
**Risque :** Clés Supabase et Stripe visibles par quiconque a accès au repo.
**Fix dans Claude Code :**
```bash
# 1. Ajouter à .gitignore
echo "frontend/.env.production" >> .gitignore

# 2. Retirer du suivi git
git rm --cached frontend/.env.production

# 3. Rotater toutes les clés (Supabase dashboard + Stripe dashboard)

# 4. Utiliser EAS Secrets pour la production
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "votre-url"
```
**Effort :** 1h (incluant la rotation des clés)

---

### 3. 59 instances de `any` dans le TypeScript
**Fichiers :** api.ts, dashboard.tsx (owner + provider), emergency.tsx, mission/[id].tsx
**Risque :** Aucune sécurité de typage. Les bugs passent au runtime au lieu du compile-time.
**Fix dans Claude Code :**
```typescript
// Créer src/types/index.ts avec :
export interface Mission {
  id: string;
  property_id: string;
  owner_id: string;
  type: 'cleaning' | 'linen' | 'plumbing' | 'electrical' | 'locksmith' | 'jacuzzi' | 'other';
  status: 'pending' | 'broadcasted' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
  urgency_level: 'planned' | 'urgent' | 'emergency';
  base_amount: number;
  // etc.
}

export interface User { ... }
export interface Emergency { ... }
export interface Quote { ... }
export interface Invoice { ... }

// Puis remplacer tous les useState<any> par useState<Mission | null>
```
**Effort :** 2-3h

---

### 4. Promises fire-and-forget dans api.ts
**Fichiers :** `src/api.ts` — lignes 221, 427, 457, 581, 642, 660, 2420, 3110
**Risque :** Geocoding, notifications push, sync Google Calendar — échouent silencieusement sans que personne ne le sache.
**Fix dans Claude Code :**
```typescript
// Avant (mauvais) :
sendPushNotification(owner_id, 'Titre', 'Message');

// Après (bon) :
try {
  await sendPushNotification(owner_id, 'Titre', 'Message');
} catch (err) {
  if (__DEV__) console.error('Push notification failed:', err);
  // En prod : Sentry.captureException(err);
}
```
**Effort :** 2h

---

### 5. Aucun test automatisé (0 tests)
**Impact :** Marketplace B2B avec paiements et urgences — zéro filet de sécurité.
**Fix dans Claude Code :**
```bash
# Installer Vitest
npm install -D vitest @testing-library/react-native

# Commencer par les tests critiques :
# - src/api.test.ts → fonctions de paiement
# - Edge Functions → webhook Stripe
# - Auth → login/signup/logout flow
```
**Effort :** 3-5 jours (objectif : 50 tests minimum)

---

## 🟠 IMPORTANTS — À corriger avant production

### 6. Écrans "God Components" (>1000 lignes)
| Fichier | Lignes | Action |
|---------|--------|--------|
| `emergency.tsx` | 1,171 | Extraire : EmergencyForm, EmergencyBidList, EmergencyPayment |
| `mission/[id].tsx` | 1,121 | Extraire : MissionDetail, MissionActions, MissionPhotos |
| `quote/create.tsx` | 1,050 | Extraire : QuoteForm, QuoteLineItems, QuotePreview |
| `(provider)/profile.tsx` | 1,028 | Extraire : ProfileForm, IntegrationsSection, SettingsSection |
**Effort :** 1 jour par écran

### 7. api.ts monolithique (3,313 lignes, 50+ fonctions)
**Fix :** Découper en services :
```
src/services/
├── missionsService.ts
├── emergenciesService.ts
├── usersService.ts
├── invoicesService.ts
├── paymentsService.ts
└── calendarService.ts
```
**Effort :** 1 jour

### 8. Validation des inputs dans les Edge Functions
**Fichier principal :** `create-payment-intent/index.ts`
**Risque :** Pas de validation max sur les montants, pas de schéma Zod.
**Fix :**
```typescript
import { z } from "https://esm.sh/zod@3";
const PaymentSchema = z.object({
  amount: z.number().int().min(50).max(999999),
  captureMethod: z.enum(['automatic', 'manual']).optional(),
  metadata: z.record(z.string()).optional(),
});
```
**Effort :** 2h par Edge Function

### 9. Messages d'erreur qui fuient des détails internes
**Fichiers :** Edge Functions (Stripe errors, Google OAuth errors exposés)
**Fix :** Créer un helper `sanitizeError()` qui remplace les erreurs techniques par des messages user-friendly.
**Effort :** 1h

### 10. Auth flow `implicit` au lieu de PKCE sur mobile
**Fichier :** `src/lib/supabase.ts` ligne 56
**Fix :**
```typescript
// Remplacer :
flowType: Platform.OS === 'web' ? 'pkce' : 'implicit',
// Par :
flowType: 'pkce',
```
**Effort :** 15 min + test

---

## 🟡 RECOMMANDÉS — Amélioration qualité

### 11. Seulement 3 composants réutilisables
Chaque écran refait ses propres boutons, inputs, modals. Créer :
```
src/components/shared/
├── Button.tsx (primaire, secondaire, danger)
├── Input.tsx (text, password, search)
├── Card.tsx (mission card, property card)
├── Modal.tsx (confirmation, info)
├── Badge.tsx (status badges)
└── EmptyState.tsx
```
**Effort :** 2 jours

### 12. Pas de CI/CD (pas de GitHub Actions)
**Fix :** Créer `.github/workflows/ci.yml` :
- Lint (ESLint)
- Type check (tsc --noEmit)
- Tests (vitest)
- Build check (expo export)
**Effort :** 2h

### 13. Dossier legacy `app/admin/` encore présent
**Note :** Déjà identifié dans Sprint 1. 350 LOC de code mort à supprimer.
**Effort :** 5 min

### 14. Strings hardcodées en français (bloque i18n)
Notifications, messages d'erreur, validations — encore en français dans le code au lieu de passer par i18n.
**Effort :** 3h (Sprint 5)

---

## ✅ POINTS FORTS

| Ce qui est bien fait | Détail |
|---------------------|--------|
| **Design System** | theme.ts complet et cohérent — COLORS, FONTS, SPACING, RADIUS, SHADOWS utilisés partout |
| **RLS Supabase** | Policies complètes sur toutes les tables. Récursion admin corrigée avec `is_admin()` SECURITY DEFINER |
| **Factur-X** | Génération de factures conformes EN 16931 avec XML CII embarqué |
| **Rate Limiting** | DB-based sur delete-account (3/24h), create-payment-intent (5/min), create-connect-account (5/min) |
| **Stripe Connect** | Vérification charges_enabled avant paiement. Signature webhook vérifiée |
| **Migrations** | 36 migrations versionnées, incrémentales, bien nommées |
| **Auth** | AuthProvider propre avec context, timeout 5s, admin guard |
| **Error Boundary** | Intégré avec Sentry, fallback UI propre |
| **i18n** | Setup FR/EN avec react-i18next et expo-localization |
| **RGPD** | delete-account + export-user-data Edge Functions implémentées |

---

## PLAN D'ACTION RECOMMANDÉ POUR CLAUDE CODE

### Sprint immédiat (2 jours) — Sécurité
```
Contexte à coller dans Claude Code :

SPRINT SÉCURITÉ URGENT — Tâches dans l'ordre :

1. Retirer frontend/.env.production du repo git + ajouter à .gitignore
2. Remplacer CORS '*' par origin spécifique dans les 17 Edge Functions
3. Changer auth flow de 'implicit' à 'pkce' dans src/lib/supabase.ts
4. Ajouter validation Zod dans create-payment-intent et capture-payment
5. Créer sanitizeError() helper pour les Edge Functions
```

### Sprint qualité (3 jours) — TypeScript + Tests
```
Contexte à coller dans Claude Code :

SPRINT QUALITÉ — Tâches :

1. Créer src/types/index.ts avec interfaces Mission, User, Emergency, Quote, Invoice
2. Remplacer tous les useState<any> par les types corrects (59 occurrences)
3. Corriger les fire-and-forget promises dans api.ts (8 occurrences)
4. Installer Vitest + écrire 20 tests unitaires pour api.ts
5. Supprimer app/admin/ legacy
```

### Sprint architecture (2 jours) — Refactoring
```
Contexte à coller dans Claude Code :

SPRINT ARCHITECTURE — Tâches :

1. Découper api.ts en 6 fichiers services (missions, users, emergencies, invoices, payments, calendar)
2. Extraire emergency.tsx en 3 sous-composants
3. Extraire mission/[id].tsx en 3 sous-composants
4. Créer 5 composants shared (Button, Input, Card, Modal, Badge)
5. Configurer GitHub Actions CI (lint + typecheck + test)
```

---

## RÉSUMÉ

**6.5/10** — Le projet Altio est fonctionnellement complet et bien pensé. La base de données est solide (8.5/10), le design system est cohérent, et les features business (Factur-X, RGPD, Stripe Connect) sont bien implémentées. Les faiblesses sont principalement architecturales (monolithique, pas de tests, typage faible) et sécuritaires (CORS, env exposé). **7 jours de travail ciblé dans Claude Code suffisent pour passer de 6.5 à 8/10.**
