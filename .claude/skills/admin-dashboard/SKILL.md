---
name: admin-dashboard
description: Implémente ou étend le dashboard admin Altio — setup Supabase, écrans, actions de gestion, finances
type: implementation
---

# Skill — Admin Dashboard Altio

## Contexte projet
- Frontend : React Native / Expo Router, TypeScript
- Backend : Supabase (PostgreSQL + RLS + Edge Functions), Stripe 10% commission
- Rôles existants : `owner`, `provider`
- Admin : colonne `is_admin BOOLEAN` dans `users`, exposée via `useAuth()`
- Dossier actuel : `frontend/app/admin/` (Stack basique, non protégé) → migrer vers `frontend/app/(admin)/`
- Couleur admin : `COLORS.purple` (#8B5CF6) pour différenciation visuelle

## Patterns à respecter
- Fetch : `useFocusEffect(useCallback(() => { fetchData(); }, []))`
- Loading : `if (loading) return <ActivityIndicator size="large" color={COLORS.brandPrimary} />`
- Cards : `backgroundColor: '#FFFFFF'`, `borderRadius: 16`, `borderWidth: 1, borderColor: '#F1F5F9'`, `...SHADOWS.card`
- Spacing : `SPACING.xl` (20) pour `paddingHorizontal`
- Status badges : toujours depuis `STATUS_COLORS` + `STATUS_LABELS` de `theme.ts`
- API : ajouter les fonctions dans `src/api.ts`, jamais d'appels Supabase directs dans les écrans

## Phase 0 — Setup Supabase

### Migration : `supabase/migrations/20260316000000_admin_setup.sql`

```sql
-- Table audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,  -- 'suspend_user' | 'reactivate_user' | 'approve_doc' | 'reject_doc' | 'export_csv' | 'generate_invoice'
  target_type TEXT,           -- 'user' | 'provider_profile' | 'mission' | 'payment'
  target_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit_log" ON audit_log FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- Colonnes suspension
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Policies RLS admin (explicites, pas BYPASSRLS)
CREATE POLICY "Admins read all users" ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true));
CREATE POLICY "Admins update users" ON users FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins read all missions" ON missions FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins update missions" ON missions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage provider_profiles" ON provider_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins read all emergencies" ON emergencies FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
-- Adapter 'payment_transactions' au vrai nom de la table si différent
CREATE POLICY "Admins read all payments" ON payment_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- Vue admin_dashboard_stats (adapter les noms de tables si nécessaire)
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  COUNT(DISTINCT m.id) FILTER (WHERE m.status NOT IN ('completed','cancelled'))        AS active_missions_count,
  COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= DATE_TRUNC('month', NOW()))       AS missions_this_month,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'owner')                                AS owners_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'provider')                             AS providers_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.created_at >= NOW() - INTERVAL '30 days')      AS new_users_30d,
  COUNT(DISTINCT e.id) FILTER (WHERE e.status NOT IN ('completed','cancelled'))        AS active_emergencies,
  COALESCE(SUM(pt.amount * 0.10)
    FILTER (WHERE pt.created_at >= DATE_TRUNC('month', NOW()) AND pt.status = 'succeeded'), 0) AS commissions_this_month,
  COALESCE(SUM(pt.amount) FILTER (WHERE pt.status = 'succeeded'), 0)                  AS total_volume,
  COUNT(DISTINCT pt.id)
    FILTER (WHERE pt.status = 'failed' AND pt.created_at >= NOW() - INTERVAL '48 hours') AS failed_payments_48h
FROM users u
CROSS JOIN (SELECT 1) dummy
LEFT JOIN missions m ON true
LEFT JOIN emergencies e ON true
LEFT JOIN payment_transactions pt ON true;
```

## Phase 1 — Navigation

### Fichiers à modifier
- `frontend/app/_layout.tsx` : remplacer `admin/index` + `admin/partners` par `<Stack.Screen name="(admin)" options={{ headerShown: false }} />`
- `frontend/app/index.tsx` : ajouter `else if (user.is_admin) router.replace('/(admin)/overview')` **avant** le check `role === 'owner'`

### Nouveau : `frontend/app/(admin)/_layout.tsx`
Tabs avec 5 onglets — couleur active `COLORS.purple` :
- `overview` — Ionicons `grid-outline`
- `users` — Ionicons `people-outline`
- `emergencies` — Ionicons `warning-outline`
- `finances` — Ionicons `bar-chart-outline`
- `settings` — Ionicons `settings-outline`
- Écrans sans tab (href: null) : `user/[id]`, `partners`, `partner-form`

### Nouveau : `frontend/src/components/AdminGuard.tsx`
HOC qui redirige vers `/` si `!user?.is_admin`.

## Phase 2 — Écrans

### `(admin)/overview.tsx`
- Fetch via `supabase.rpc('get_admin_stats')` ou select direct sur la vue
- 4 KPI cards en grille 2×2 (missions actives, commissions mois, users actifs 30j, urgences)
- Section "Alertes" : badge rouge si `failed_payments_48h > 0`
- Section "Activité récente" : 5 dernières actions `audit_log`

### `(admin)/users.tsx`
- SearchBar (pattern owner/dashboard.tsx)
- Chips filtres : rôle (Tous/Owner/Provider) + statut (Actif/Suspendu)
- FlatList : avatar | nom + email | role badge | statut dot | chevron
- `onPress` → `/(admin)/user/[id]`

### `(admin)/user/[id].tsx`
- Fetch parallèle : profil user + provider_profile + 10 dernières missions + audit_log du user
- Section Documents prestataire : boutons Approuver/Rejeter si `status === 'pending'`
- Bouton Suspendre/Réactiver en bas (Phase 3)

### `(admin)/emergencies.tsx`
- Realtime subscription sur table `emergencies`
- Toggle Liste / Carte (MapView si react-native-maps disponible)
- Même cards urgences que `owner/dashboard.tsx` + infos owner/provider

### `(admin)/finances.tsx`
- KPIs financiers mois
- Graphique barres 12 mois (View barres proportionnelles, sans lib externe)
- Liste paiements échoués 48h
- Bouton Export CSV
- Structure FacturX (voir Phase 4)

## Phase 3 — Actions de gestion

### Suspension utilisateur
```typescript
// api.ts
export const suspendUser = async (userId: string, reason: string) => { ... }
export const reactivateUser = async (userId: string) => { ... }
// Chaque action insère dans audit_log + appelle Edge Function admin-suspend-user
```

### Vérification documents
```typescript
// api.ts
export const approveProviderDocument = async (providerId: string, docType: string) => { ... }
export const rejectProviderDocument = async (providerId: string, docType: string, reason: string) => { ... }
// Met à jour provider_profiles.documents (JSON patch) + notifie le prestataire via send-push
```

### Edge Functions à créer
- `supabase/functions/admin-suspend-user/index.ts` — utilise Supabase Auth Admin API (`ban_duration`)
- `supabase/functions/admin-export-csv/index.ts` — retourne CSV des transactions, vérifie is_admin côté serveur
- `supabase/functions/notify-admin-new-provider/index.ts` — Database Webhook sur INSERT provider_profiles

## Phase 4 — Finances

### Export CSV
```typescript
// app : invoke('admin-export-csv') → FileSystem.writeAsStringAsync → Sharing.shareAsync
// audit_log : action 'export_csv'
```

### Structure FacturX (v1 — données uniquement)
```typescript
interface FacturXInvoice {
  invoice_number: string;    // 'ALT-2026-001'
  issue_date: string;
  seller: { name: 'Altio SAS'; siren: string; vat_number: string; address: string };
  buyer: { name: string; email: string; address: string };
  lines: Array<{ description: string; quantity: 1; unit_price: number; vat_rate: 0.20; total_ht: number; total_ttc: number }>;
  total_ht: number; total_vat: number; total_ttc: number;
  payment_method: 'STRIPE'; stripe_payment_intent_id: string;
}
// Edge Function generate-invoice pour v2 (XML Factur-X réel)
```

## Fonctions API à ajouter dans `src/api.ts`
- `getAdminStats()` — select sur `admin_dashboard_stats`
- `getAdminUsers(search, role, status, page)` — liste paginée
- `getAdminUserDetail(userId)` — profil complet
- `suspendUser(userId, reason)` + `reactivateUser(userId)`
- `approveProviderDocument(providerId, docType)` + `rejectProviderDocument(...)`
- `getAdminPayments(filters)` — liste paginée avec filtres
- `getFailedPayments48h()` — paiements échoués récents
- `getAuditLog(targetId?)` — historique actions admin
- `getMonthlyVolume()` — agrégats 12 mois pour graphique

## Checklist de vérification
- [ ] Accéder à `/(admin)/overview` avec `is_admin = false` → redirect vers `/`
- [ ] Suspendre un utilisateur → entrée dans `audit_log` + flag `suspended = true`
- [ ] Nouveau prestataire inscrit → notification push reçue par admin
- [ ] Export CSV → fichier partageable avec les bonnes colonnes
- [ ] Filtrer users par rôle "Provider" suspendu → résultats corrects
- [ ] Urgences temps réel → carte se met à jour sans refresh manuel
- [ ] Commission mois affiché sur overview = 10% du volume succeeded du mois
