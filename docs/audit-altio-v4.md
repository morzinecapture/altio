# Audit Altio V4 — 26 mars 2026

## Score global : 6/10

**Progression** : V1 (6.5) → V2 (5.5) → V3 (5.8) → **V4 (6.0)**

Le projet a considérablement progressé sur la sécurité et le typage TypeScript, mais reste freiné par 3 blocages structurels : zéro tests, architecture monolithique (`api.ts` 3447 lignes), et absence de CI/CD.

---

## Évolution depuis V3

| Critère | V3 | V4 | Verdict |
|---------|-----|-----|---------|
| Instances `any` | 3 | ~65 (hooks + services) | ⬇️ Régression partielle |
| CORS | ✅ Centralisé | ✅ Maintenu | ✅ Stable |
| .env exposé | ✅ Supprimé | ✅ Maintenu | ✅ Stable |
| Auth PKCE | ✅ Web + natif | ✅ Maintenu | ✅ Stable |
| Tests automatisés | 0 | ~2 fichiers | ⚠️ Insuffisant |
| api.ts monolithique | 3447L | 3447L+ | 🔴 Stagnant |
| Edge Functions validées | 6/16 | ~6/16 | ⚠️ Stagnant |
| Nouvelles migrations | 36 | 40 (+4) | ✅ Actif |
| State machine missions | — | Nouveau trigger | 🟡 Bugs d'alignement |
| Notifications serveur | — | Nouveau | ✅ Ajouté |

---

## 🔴 Critiques (P0 — Action immédiate)

### 1. Fonction `is_admin()` manquante — Toutes les policies admin cassées
Les migrations RLS admin référencent `is_admin()` mais cette fonction n'est définie dans aucune migration. Résultat : **toutes les policies admin échouent silencieusement**.

**Impact** : Le dashboard admin ne montre aucune donnée, ou pire, les policies tombent en fallback permissif.

**Fix** :
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 2. State machine trigger incompatible avec les statuts réels
La migration `20260326000001_mission_state_machine_trigger.sql` définit des transitions d'état qui ne correspondent pas aux statuts utilisés dans le frontend. Les missions ne peuvent plus changer de statut.

**Impact** : Blocage complet du workflow mission (acceptation, complétion, paiement).

### 3. RLS `invoices` — `auth.role()='service_role'` jamais vrai côté client
Les policies sur la table `invoices` vérifient `auth.role() = 'service_role'`, condition qui n'est **jamais vraie** pour un utilisateur authentifié normalement. Les factures sont invisibles.

**Fix** : Remplacer par des policies basées sur `owner_id` / `provider_id` comme les autres tables.

### 4. `rate_limit_log` RLS `USING(false)` — Rate limiting cassé
La table de rate limiting a `USING(false)` ce qui empêche toute lecture/écriture côté client. Le rate limiting ne fonctionne pas du tout.

### 5. Notifications INSERT trop permissive
N'importe quel utilisateur authentifié peut créer des notifications pour n'importe qui. Pas de vérification que l'expéditeur est légitime.

**Impact** : Risque de spam/phishing interne entre utilisateurs.

### 6. Offline queue sans idempotence
`src/services/offline-queue.ts` rejoue les actions en FIFO sur reconnexion sans vérifier si elles ont déjà été exécutées. Risque de doublons de missions, paiements dupliqués.

---

## 🟡 Warnings (P1 — À corriger rapidement)

### 7. Pas de guards d'auth sur les routes
`app/_layout.tsx` déclare les Stack screens `(owner)`, `(provider)`, `(admin)` sans vérifier le rôle. Pendant le loading, un utilisateur peut accéder à n'importe quel écran.

### 8. Subscriptions Realtime sans filtre
`useRealtimeSync.ts` subscribe à TOUS les UPDATE de `missions` sans filtre `owner_id` ou `provider_id`. Chaque utilisateur reçoit les événements de tous les autres.

**Impact** : Surconsommation de bande passante, invalidation de cache inutile.

### 9. Pas de timeout global sur les queries Supabase
Seul `fetchUserProfile` a un timeout (5s). Toutes les autres requêtes peuvent rester en attente indéfiniment.

### 10. Stripe webhook pas idempotent
`stripe-webhook/index.ts` ne vérifie pas si un événement a déjà été traité. Race conditions possibles sur les paiements.

### 11. Gestion d'erreur API dispersée
`src/api/payments.ts` utilise des try/catch imbriqués avec parsing JSON récursif. Pas de pattern uniforme de gestion d'erreur.

### 12. Storage policies sans vérification d'ownership
Les buckets Supabase Storage ont des policies qui ne vérifient pas que l'utilisateur est propriétaire du fichier qu'il modifie/supprime.

### 13. Delete account laisse des invoices orphelines
L'Edge Function `delete-account` ne gère pas les factures liées. Données orphelines en base.

### 14. `api.ts` toujours monolithique — 3447+ lignes
Fichier principal qui grossit à chaque sprint. 4 "god components" de 1000+ lignes chacun. Aucun refactoring effectué.

### 15. 0 tests automatisés significatifs
2 fichiers de test existent mais couvrent uniquement la state machine. Aucun test sur : matching prestataires, calcul de frais, transitions d'urgence, mutations API.

---

## 🟢 Suggestions (P2 — Nice to have)

### 16. Implémenter Zod/Valibot pour validation des réponses API
Les retours Supabase ne sont pas validés. Les champs manquants restent `undefined` et causent des crashes silencieux.

### 17. Utiliser `useMemo` sur les listes filtrées
`(owner)/dashboard.tsx` recalcule 4+ listes filtrées à chaque rendu. Ajouter `useMemo` avec dépendances.

### 18. Remplacer ScrollView + map par FlatList
Plusieurs écrans (dashboard, missions) utilisent `ScrollView` + `.map()` au lieu de `FlatList` virtualisé. Impact performance sur longues listes.

### 19. Chiffrer AsyncStorage
La queue offline et les données utilisateur sont en plaintext dans AsyncStorage. Utiliser `expo-secure-store` pour les données sensibles.

### 20. Découper les écrans complexes en composants
`dashboard.tsx` (300+ lignes, 15+ useState) → `<StatsGrid />`, `<MissionsList />`, `<EmergenciesList />`, `<NotificationsPanel />`.

### 21. CI/CD GitHub Actions
Toujours absent. Mettre en place : lint, TypeScript check, tests, interdiction de `any`.

### 22. Remplacer `console.log` par un logger structuré
~43 `console.log` directs dans le code. Créer un `logger.ts` avec niveaux (dev vs prod) et intégration Sentry.

---

## ✅ Points positifs

- **Structure Expo Router claire** avec groupes de rôles `(owner)`, `(provider)`, `(admin)`
- **TypeScript strict activé** dans tsconfig.json
- **Design system cohérent** via `theme.ts` (COLORS, FONTS, RADIUS, SHADOWS)
- **React Query + Realtime** pour la synchronisation temps réel
- **ErrorBoundary + Sentry** en place pour le monitoring
- **RGPD implémenté** : delete-account + export-user-data fonctionnels
- **Factur-X conforme** EN 16931 avec XML CII
- **Rate limiting DB-based** (architecture correcte même si RLS cassé)
- **40 migrations versionnées** incrémentales et bien nommées
- **i18n multilingue** FR/EN en cours de déploiement
- **Auth PKCE** correctement configuré web + natif
- **CORS centralisé** via module `cors.ts`

---

## Matrice de priorités

| Priorité | Effort | Items |
|----------|--------|-------|
| **P0 — Immédiat** | ~4h | #1 `is_admin()`, #2 state machine, #3 invoices RLS, #4 rate_limit, #5 notifications, #6 offline idempotence |
| **P1 — Sprint en cours** | ~8h | #7 auth guards, #8 realtime filters, #9 timeouts, #10 stripe idempotence, #11 error handling |
| **P1 — Sprint suivant** | ~6h | #12 storage policies, #13 delete orphans, #14 découper api.ts, #15 tests |
| **P2 — Backlog** | ~12h | #16-22 validation Zod, memoization, FlatList, crypto, CI/CD, logger |

---

## Cibles pour V5

| Métrique | V4 | Cible V5 |
|----------|-----|----------|
| Score global | 6.0/10 | **7.5/10** |
| `any` restants | ~65 | < 10 |
| Tests | ~2 fichiers | > 30 tests |
| Edge Functions validées | 6/16 | 16/16 |
| api.ts lignes | 3447 | < 800 (découpé en services) |
| God Components | 4 × 1000L | < 500L chacun |
| CI/CD | ❌ | ✅ GitHub Actions |
| Bugs RLS critiques | 4 | 0 |

---

*Audit réalisé le 26 mars 2026 — Lecture seule, aucune modification effectuée.*
