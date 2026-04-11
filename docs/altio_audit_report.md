# AUDIT QUALITÉ — Backend Supabase Altio
**Date:** 2026-03-26  
**Scope:** Migrations SQL, RLS, Edge Functions, Config Supabase  
**Analyseur:** Claude Code Agent

---

## RÉSUMÉ EXÉCUTIF

Cet audit couvre **40 migrations SQL**, **16 Edge Functions**, et la **configuration Supabase**. Le backend montre une **architecture maîtrisée** avec des patterns solides de RLS et de gestion de cascades DELETE. Cependant, plusieurs **vulnérabilités de sécurité** et **incohérences** ont été détectées qui nécessitent une attention immédiate.

**Score global:** 6.5/10 — Fondations correctes, mais risques significatifs

---

## 🔴 PROBLÈMES CRITIQUES

### 1. **CORS Configuration — Trop permissive**
**Localisation:** `functions/_shared/cors.ts:1`  
**Problème:** La configuration CORS utilise `ALLOWED_ORIGIN` mais ne valide jamais dynamiquement l'origine des requêtes.

```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://altio.app';
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  // ...
};
```

**Risque:** Si `ALLOWED_ORIGIN` env var n'est pas définie, tous les domaines auront accès par défaut (`https://altio.app`). En développement local, cela peut devenir très permissif.

**Recommandation:** 
- Valider **strictement** l'origine de la requête
- Ne pas utiliser de fallback permissif
- Ajouter une vérification `req.headers.get('origin')` contre une liste whitelist

---

### 2. **Notification INSERT Policy — TROP PERMISSIVE**
**Localisation:** `20260323000003_notifications_table.sql:30-32`

```sql
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
```

**Risque:** N'importe quel utilisateur authentifié peut insérer une notification pour **n'importe quel autre utilisateur** (pas de vérification `user_id = auth.uid()`). Cela permet à un utilisateur malveillant d'inonder d'autres utilisateurs de notifications.

**Recommandation:**
```sql
CREATE POLICY "Users insert own notifications"
  ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

---

### 3. **rate_limit_log RLS — Trop restrictive + bug logique**
**Localisation:** `20260318000001_sprint6_rls_audit.sql:271-273`

```sql
CREATE POLICY "Service role manages rate limits" ON rate_limit_log
  FOR ALL USING (false);   -- bloqué pour tous les rôles non-service
```

**Risques multiples:**
1. `USING (false)` bloque **tous** les SELECT, même pour `service_role` (la logique de RLS ne comprend pas les rôles)
2. Les Edge Functions qui font `checkRateLimit()` vont échouer car elles utilisent `service_role` mais la policy `USING (false)` les bloque
3. La fonction `checkRateLimit()` essaie de lire le rate_limit_log, ce qui va fail silencieusement (ligne 33-35 de `rateLimit.ts` gère l'erreur mais le rate limit ne fonctionne pas)

**Recommandation:**
```sql
CREATE POLICY "Service role manages rate limits" ON rate_limit_log
  FOR ALL
  USING (true);
```

---

### 4. **Admin Functions — Pas de is_admin() existant**
**Localisation:** Multiples migrations (`20260318000001_sprint6_rls_audit.sql`, `20260321000006_fix_emergency_bids_rls.sql`, etc.)

**Pattern utilisé:**
```sql
CREATE POLICY "Admins manage reviews" ON reviews
  FOR ALL USING (is_admin());
```

**Problème:** 
- La fonction `is_admin()` n'existe nulle part dans les migrations
- PostgreSQL va errorer: `ERROR: function is_admin() does not exist`
- Toutes les policies qui utilisent `is_admin()` sont **cassées**

**Impact:** Admin dashboard, audit_log, et toute modération d'admin ne fonctionnent PAS.

**Recommandation:** Créer la fonction:
```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT COALESCE((
    SELECT is_admin FROM public.users WHERE id = auth.uid()
  ), false)
$$;
```

---

### 5. **Séquences de factures — Pas de RLS sur tables liées**
**Localisation:** `20260324000001_invoice_separate_sequences.sql`

**Problème:**  
Les séquences `invoice_seq_prop`, `invoice_seq_prest` ont des GRANT sur `service_role`, mais:
1. La table `invoices` a RLS mais les policies ne testent **pas d'index** sur `invoice_type` ou les séquences
2. La migration `20260317000002_billing_invoices.sql:46-48` a une policy trop permissive:

```sql
CREATE POLICY "service_role_full_access" ON invoices
  FOR ALL USING (auth.role() = 'service_role');
```

Ce check va TOUJOURS échouer car `auth.role()` retourne `'authenticated'` ou `'anon'`, jamais `'service_role'`.

**Recommandation:** Supprimer cette policy cassée, utiliser `TO service_role` dans le `CREATE POLICY ... TO service_role` directement.

---

### 6. **Mission State Machine — Statuts incohérents**
**Localisation:** `20260326000001_mission_state_machine_trigger.sql`

**Problème:** La state machine définie en migration n'existe **nulle part ailleurs** dans le code:
- Pas de migration antérieure créant la colonne `status` avec les valeurs énumérées
- Les transitions comme `'pending_provider_approval'`, `'awaiting_payment'`, `'quote_submitted'` ne sont **jamais mentionnées** dans les autres migrations ou edge functions
- Les statuts réels utilisés sont: `'pending'`, `'published'`, `'bids_open'`, `'assigned'`, `'in_progress'`, `'validated'`, `'paid'`, `'completed'`, `'cancelled'`, `'expired'` (migrations RLS)

**Risque:** Le trigger va échouer à chaque UPDATE mission car les statuts réels ne matchent pas ceux définis. Aucune mission ne pourra être miseà jour.

**Recommandation:** Alignergré migration 20260326 avec la réalité des statuts utilisés dans RLS migrations.

---

### 7. **Emergency State Machine — Incomplet**
**Localisation:** `20260326000001_mission_state_machine_trigger.sql:85-112`

**Problème:** La state machine emergency référence:
- `'provider_accepted'` ← jamais défini dans les migrations RLS ou edge functions
- `'bid_accepted'`, `'displacement_paid'` ← utilisés dans RLS (20260321000009) mais transitions incohérentes
- Pas de transition `'completed' → 'paid'` (mais missions l'ont)

**Risque:** Même problème que missions — le trigger va bloquer les updates.

---

### 8. **password_requirements — Laissé vide**
**Localisation:** `config.toml:172`

```toml
password_requirements = ""
```

**Problème:** Les mots de passe n'ont **aucune exigence de complexité** (pas de majuscules, chiffres, symboles). Combined with minimum_password_length = 6, cela permet des mots de passe très faibles comme `"aaaaaa"`.

**Recommandation:**
```toml
password_requirements = "lower_upper_letters_digits"  # au minimum
```

---

## 🟡 WARNINGS / RISQUES MODÉRÉS

### 9. **Invoice RLS — Foreign Key nullification pattern risqué**
**Localisation:** `functions/delete-account/index.ts:36-61`

**Pattern:**
```typescript
// Null out FKs before deleting user
await adminClient.from('invoices').update({ seller_id: null }).eq('seller_id', userId)
await adminClient.from('invoices').update({ buyer_id: null }).eq('buyer_id', userId)
```

**Problème:** 
- Cela crée des invoices **orphelines** (seller_id = NULL, buyer_id = NULL)
- Ces invoices ne peuvent pas être lues par leurs parties (propriétaires) car les policies demandent `buyer_id = auth.uid()` ou `seller_id = auth.uid()`
- Réellement, ces invoices deviennent **invisibles** et inaccessibles

**Recommandation:** À la place:
1. Créer des **credit_notes** automatiquement (refund)
2. Ou archiver les invoices (`archived = true`) au lieu de nullify
3. Ou les laisser liées mais avec une colonne `deleted_user_name` pour l'audit

---

### 10. **Emergency requests FK — Broken reference after cascade delete**
**Localisation:** `20260320000005_fix_all_delete_cascades.sql:12-16`

```sql
ALTER TABLE emergency_requests ALTER COLUMN accepted_provider_id DROP NOT NULL;
ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_accepted_provider_id_fkey
  FOREIGN KEY (accepted_provider_id) REFERENCES users(id) ON DELETE SET NULL;
```

**Problème:** Si un provider accepte une urgence, puis supprime son compte → `accepted_provider_id` devient NULL. Mais nulle part dans le code n'y a de logique pour **reassigner** l'urgence. L'urgence reste figée dans l'état "accepted by phantom provider".

**Recommandation:** 
- Ajouter un trigger qui remet l'urgence en `'open'` si `accepted_provider_id` devient NULL
- Ou créer un job cron qui détecte et remet en état les urgences orphelines

---

### 11. **Service Fees Calculation — Hardcodé à 20%**
**Localisation:** Multiple edge functions + migrations

**Pattern:**
```typescript
const netAmount = Math.round((mission.fixed_rate || 0) * 0.9)  // 10% commission
```

Et dans les migrations:
```sql
CREATE POLICY "service_role_full_access" ON invoices
```

**Problème:** 
1. Le pourcentage de commission (10% → Altio, 90% → provider) est **hardcodé** en JavaScript
2. Pas de config table pour les percentages
3. Si vous changez le modèle économique, **faut modifier le code** et redéployer toutes les edge functions

**Recommandation:** Créer une table `platform_config`:
```sql
CREATE TABLE platform_config (
  key TEXT PRIMARY KEY,
  value NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO platform_config VALUES ('commission_pct', 10), ('provider_pct', 90);
```

---

### 12. **Storage Policies — Missing update check**
**Localisation:** `20260320000001_storage_buckets_rls.sql:57-61`

```sql
CREATE POLICY "Authenticated users can update partner logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'partner-logos')
WITH CHECK (bucket_id = 'partner-logos');
```

**Problème:** Authenticated users can update **any** object in partner-logos, not just their own. There's no owner_id check.

**Recommandation:** Insérer un path-based check:
```sql
WITH CHECK (
  bucket_id = 'partner-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
```

---

### 13. **Audit Log — No rate limit on inserts**
**Localisation:** `20260316000000_admin_setup.sql:17-21`

```sql
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage audit_log" ON audit_log;
CREATE POLICY "Admins manage audit_log" ON audit_log FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
```

**Problème:** 
- N'importe quel admin peut insérer des millions de logs
- Pas de trigger de rate limit
- Audit_log peut exploser de taille

**Recommandation:** Ajouter un trigger qui limite ~10k logs/jour par admin.

---

### 14. **Cron jobs — Configuration paramètres missing**
**Localisation:** `20260318000003_ical_cron.sql:24-38`

```sql
SELECT cron.schedule(
  'sync-ical-hourly',
  '0 * * * *',
  $$
  ...
  FROM public.properties
  WHERE ical_airbnb_url IS NOT NULL
```

**Problème:**
- La migration **assume** que `app.supabase_url` et `app.service_role_key` sont définis (lines 46-50)
- Mais **ces paramètres ne sont jamais créés** dans les migrations
- Le cron job va échouer **silencieusement** car current_setting() retournera NULL

**Recommandation:** Ajouter au début de la migration:
```sql
SELECT set_config('app.supabase_url', '<will-be-set-on-deploy>', true);
SELECT set_config('app.service_role_key', '<will-be-set-on-deploy>', true);
-- Or mieux: document que ces doivent être set par Supabase team AVANT de run la migration
```

---

### 15. **Invoice Dedup — Not actually deduplicating**
**Localisation:** `functions/generate-invoice/index.ts:26-35`

```typescript
const dedupQuery = db.from('invoices').select('id').eq('invoice_type', invoiceType)
if (missionId)   dedupQuery.eq('mission_id', missionId)
if (emergencyId) dedupQuery.eq('emergency_id', emergencyId)
const { data: existing } = await dedupQuery.limit(1)
if (existing && existing.length > 0) {
  return new Response(JSON.stringify({ ok: true, skipped: true, message: 'Invoice already exists' }), ...)
}
```

**Problème:**
- La dédup check regarde `(mission_id, invoice_type)` OU `(emergency_id, invoice_type)`
- Mais `stripe-webhook:56-66` appelle `generate-invoice` **3 fois** avec les mêmes params:
  ```typescript
  await Promise.all([
    db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service' } }),
    db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service_fee' } }),
    db.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'commission' } }),
  ])
  ```
- Mais si deux appels arrivent **simultanément** (race condition), les deux vont créer une invoice

**Recommandation:** Utiliser un constraint UNIQUE au niveau DB:
```sql
ALTER TABLE invoices ADD CONSTRAINT uq_invoice_source_type
  UNIQUE (COALESCE(mission_id, emergency_id), invoice_type);
```

---

### 16. **Stripe Webhook — No idempotency key**
**Localisation:** `functions/stripe-webhook/index.ts`

**Problème:** Stripe peut renvoyer le **même webhook multiple fois**. Le code ne gère pas les idempotency keys.

Si Stripe envoie `payment_intent.succeeded` deux fois:
1. Les missions/emergencies vont être mises à jour deux fois
2. Les push notifications vont être envoyées deux fois
3. Les invoices vont être générées deux fois (théoriquement dédupées, mais race condition)

**Recommandation:** Ajouter une table `stripe_events_received`:
```sql
CREATE TABLE stripe_events_received (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);
-- Dans le webhook: INSERT OR IGNORE then check
```

---

### 17. **Provider Visibility — Mission status filtering broken**
**Localisation:** `20260321000001_fix_rls_provider_visibility.sql:7-13`

```sql
CREATE POLICY "Providers read assigned missions" ON missions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = assigned_provider_id
    OR auth.uid() = owner_id
    OR status IN ('pending', 'published', 'bids_open')
  );
```

**Problème:**
- Owners can see ALL their missions (correct: `auth.uid() = owner_id`)
- Providers can see public missions (pending, published, bids_open)
- **BUT:** A provider who applies to a mission CANNOT see their own application after the mission moves to `'assigned'` status (only if they are `assigned_provider_id`)

**Impact:** Une fois qu'une mission passe de 'pending' → 'assigned', les providers qui n'ont pas été choisis ne voient plus la mission. C'est correct, mais vérifier que `'bids_open'` existe réellement dans les migrations (c'est utilisé en RLS mais jamais défini dans la state machine)

---

## 🟢 BONNES PRATIQUES OBSERVÉES

### ✓ Delete Cascade Strategy
L'approche en `20260318000002_fix_delete_account_cascades.sql` est solide:
- Utilise SET NULL ou CASCADE approprié
- Les FKs critiques ont les bonnes règles (ex: `properties.owner_id CASCADE`, `missions.owner_id SET NULL`)

### ✓ RLS Foundation
La migration `20260318000001_sprint6_rls_audit.sql` est très complète et couvre la plupart des tables critiques.

### ✓ Payment Intent Tracking
Les payload Stripe include `metadata: { missionId, emergencyId }` pour lier les payments aux ressources.

### ✓ Validation Functions
`functions/_shared/validate.ts` a une bonne approche avec ValidationError custom et assertX() helpers.

### ✓ CORS Middleware
Le pattern de middleware CORS shared est bon (même si la config est permissive).

### ✓ Rate Limiting Infrastructure
La structure en `rate_limit_log` est bonne (même si l'implémentation est cassée).

---

## SYNTHÈSE DES FIXES PRIORITAIRES

| Priorité | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | is_admin() function missing | 30 min | Tous les admins cassés |
| P0 | rate_limit_log RLS USING(false) bug | 15 min | Rate limiting non fonctionnel |
| P0 | Mission/Emergency state machine incompatible | 2h | Aucune mission ne peut être miseà jour |
| P0 | Notifications INSERT policy trop permissive | 15 min | Spam possible |
| P1 | Invoice RLS auth.role()='service_role' cassé | 15 min | Invoices ne génèrent pas |
| P1 | CORS too permissive | 30 min | Vulnérabilité XSS |
| P1 | password_requirements empty | 5 min | Comptes non sécurisés |
| P1 | Cron config parameters not set | 1h | Sync iCal/expiration non fonctionnel |
| P2 | Stripe webhook no idempotency | 1.5h | Race conditions sur payments |
| P2 | Service fees hardcoded | 1.5h | Pas flexible économiquement |
| P2 | Storage policies missing path checks | 1h | Tout utilisateur peut modifier les assets |

---

## CONCLUSION

Le backend est **architecturalement robuste** mais a des **bugs critiques** qui rendent certaines fonctionnalités complètement non-opérationnelles (RLS admins, rate limiting, state machines). Ces bugs ne sont **pas détectables sans tests d'intégration** car:

1. Les migrations tournent sans erreur (elles sont syntaxiquement correctes)
2. L'application fera silencieusement fail à runtime

**Recommandation:** 
- Passer en revue chaque migration avec `SELECT * FROM pg_policies` pour vérifier les policies réelles
- Faire des tests d'intégration E2E pour vérifier que:
  - Les admins peuvent lire l'audit_log
  - Les providers voient les bons statuts de mission
  - Les notifications ne spamment pas
  - Les rate limits empêchent les abus

