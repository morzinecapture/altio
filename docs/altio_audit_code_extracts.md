# AUDIT QUALITY — Code Extracts & Detailed Findings

## File Reference Map

### Migrations (40 total)
- **RLS Foundation:** `20260318000001_sprint6_rls_audit.sql`
- **Delete Cascades:** `20260318000002_fix_delete_account_cascades.sql`, `20260320000005_fix_all_delete_cascades.sql`
- **Admin Setup:** `20260316000000_admin_setup.sql`, `20260316000002_fix_admin_rls.sql`
- **Invoicing:** `20260317000002_billing_invoices.sql`, `20260324000001_invoice_separate_sequences.sql`, `20260324000004_credit_note_support.sql`
- **Storage:** `20260320000001_storage_buckets_rls.sql`
- **Cron/Automation:** `20260318000003_ical_cron.sql`, `20260321000009_fix_emergency_rls_and_mission_expiry.sql`
- **State Machines:** `20260326000001_mission_state_machine_trigger.sql`

### Edge Functions (16 total)
- **Critical:** `delete-account/index.ts`, `stripe-webhook/index.ts`, `generate-invoice/index.ts`
- **Shared:** `_shared/rateLimit.ts`, `_shared/cors.ts`, `_shared/validate.ts`

### Configuration
- **Supabase:** `config.toml`

---

## CRITICAL ISSUE #1: Missing is_admin() Function

**Status:** BLOCKING — All admin RLS policies will fail at runtime

### Affected Policies
All instances where `USING (is_admin())` appears:

```sql
-- 20260318000001_sprint6_rls_audit.sql:224
CREATE POLICY "Admins manage reviews" ON reviews
  FOR ALL USING (is_admin());

-- 20260321000006_fix_emergency_bids_rls.sql:67
CREATE POLICY "Admins manage all bids" ON emergency_bids
  FOR ALL TO authenticated
  USING (is_admin());
```

### Root Cause
The function is **never defined** in any migration. When PostgreSQL evaluates the policy, it throws:
```
ERROR: function is_admin() does not exist
```

### Fix
Create function in a new migration:
```sql
-- 20260326_add_is_admin_function.sql (new)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_admin FROM public.users WHERE id = auth.uid()
  ), false)
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;
```

---

## CRITICAL ISSUE #2: rate_limit_log RLS Blocks Everything

**Status:** BROKEN — Rate limiting infrastructure doesn't work

### Current Code
```sql
-- 20260318000001_sprint6_rls_audit.sql:271-273
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits" ON rate_limit_log
  FOR ALL USING (false);   -- bloqué pour tous les rôles non-service
```

### Why It's Broken
1. `USING (false)` blocks **ALL** operations regardless of role
2. RLS policies in PostgreSQL don't understand Supabase roles (`service_role`, `authenticated`)
3. The comment says "bloqué pour tous les rôles non-service" but that's not how Supabase RLS works

### Calling Code That Fails
```typescript
// functions/_shared/rateLimit.ts:24-29
const { count, error } = await db
  .from('rate_limit_log')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('action', action)
  .gte('created_at', since)

if (error) {
  console.warn('[rateLimit] Could not check rate limit:', error.message)
  return  // Silently fails — rate limit bypassed
}
```

### Fix
```sql
-- Replace the broken policy with:
DROP POLICY "Service role manages rate limits" ON rate_limit_log;

CREATE POLICY "Service role manages rate limits" ON rate_limit_log
  FOR ALL
  USING (true);

-- Better alternative: use TO service_role role
DROP POLICY IF EXISTS "Service role inserts" ON rate_limit_log;
CREATE POLICY "Service role inserts" ON rate_limit_log
  FOR INSERT TO service_role
  WITH CHECK (true);
```

---

## CRITICAL ISSUE #3: State Machine Trigger Incompatible with Actual Statuses

**Status:** BLOCKING — Every mission UPDATE will fail

### Defined Transitions (migration 20260326001)
```sql
CASE OLD.status
  WHEN 'pending' THEN
    allowed := ARRAY['pending_provider_approval', 'cancelled', 'expired'];
  WHEN 'pending_provider_approval' THEN
    allowed := ARRAY['assigned', 'rejected', 'cancelled', 'expired'];
  -- ... etc
END CASE;
```

### Actual Statuses Used in Migrations
From RLS migrations and edge functions:
- `'pending'` ✓
- `'published'` ✗ (not in state machine)
- `'bids_open'` ✗ (not in state machine)
- `'assigned'` ✓
- `'in_progress'` ✓
- `'validated'` ✓
- `'paid'` ✓
- `'completed'` ✓
- `'cancelled'` ✓
- `'expired'` ✓

### Example Failure
When trying to transition `'published'` → `'bids_open'`:
```
ERROR: Statut mission inconnu: published
```

### Fix Strategy
Either:
1. **Remove the trigger entirely** (if state validation isn't necessary)
2. **Rewrite the state machine** to match actual statuses:
   ```sql
   WHEN 'pending' THEN
     allowed := ARRAY['published', 'cancelled', 'expired'];
   WHEN 'published' THEN
     allowed := ARRAY['bids_open', 'assigned', 'cancelled'];
   WHEN 'bids_open' THEN
     allowed := ARRAY['assigned', 'in_progress', 'cancelled'];
   -- ... etc
   ```

---

## CRITICAL ISSUE #4: Notifications Permission Bypass

**Status:** SECURITY VULNERABILITY

### Current Code
```sql
-- 20260323000003_notifications_table.sql:30-32
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
```

### Attack Vector
```sql
-- Alice (attacker) can create notifications for Bob (victim)
INSERT INTO notifications (user_id, title, body) 
VALUES ('bob-uuid', 'Click here to win prizes!', 'Suspicious link');
-- This succeeds because the policy doesn't check user_id = auth.uid()
```

### Impact
- Notifications spam/harassment
- Malicious notification content
- Potential for phishing attacks

### Fix
```sql
DROP POLICY "Authenticated users can insert notifications" ON notifications;

CREATE POLICY "Users insert own notifications"
  ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- For service_role (edge functions):
CREATE POLICY "Service role inserts notifications"
  ON notifications FOR INSERT TO service_role
  WITH CHECK (true);
```

---

## CRITICAL ISSUE #5: Invoice RLS with auth.role() Check

**Status:** BROKEN — Will never match service_role

### Current Code
```sql
-- 20260317000002_billing_invoices.sql:46-48
CREATE POLICY "service_role_full_access" ON invoices
  FOR ALL USING (auth.role() = 'service_role');
```

### Why It Fails
In Supabase, `auth.role()` returns:
- `'authenticated'` for logged-in users
- `'anon'` for anonymous users
- **Never** returns `'service_role'`

The `service_role` is for direct database connections, not JWT-based auth.

### Correct Pattern
```sql
-- Option 1: Use TO clause (preferred)
CREATE POLICY "service_role_full_access" ON invoices
  FOR ALL TO service_role
  USING (true);

-- Option 2: Check if user is admin (if admins should have access)
CREATE POLICY "admins_manage_invoices" ON invoices
  FOR ALL USING (is_admin());
```

---

## MEDIUM ISSUE #1: Cron Job Config Missing

**Status:** SILENT FAILURE — Jobs won't execute

### Code That Will Fail
```sql
-- 20260318000003_ical_cron.sql:24-38
SELECT cron.schedule(
  'sync-ical-hourly',
  '0 * * * *',
  $$
  SELECT extensions.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-ical',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object('property_id', id::text)
  )
  FROM public.properties
  WHERE ical_airbnb_url IS NOT NULL
     OR ical_booking_url IS NOT NULL
     OR ical_url         IS NOT NULL;
  $$
);
```

### Problem
- `current_setting('app.supabase_url')` will return NULL
- `current_setting('app.service_role_key')` will return NULL
- URL becomes `'NULL/functions/v1/sync-ical'`
- HTTP request fails silently (cron job catches exception)

### Evidence from Migration
```sql
-- Lines 46-50 just DOCUMENT what should be set, don't actually set it:
-- -- These need to be set by running:
-- ALTER DATABASE postgres SET "app.supabase_url" = '...';
-- ALTER DATABASE postgres SET "app.service_role_key" = '...';
```

### Fix
Either:
1. **Add to migration:**
   ```sql
   ALTER DATABASE postgres SET "app.supabase_url" = current_setting('SUPABASE_URL');
   ALTER DATABASE postgres SET "app.service_role_key" = current_setting('SUPABASE_SERVICE_ROLE_KEY');
   ```
2. **Or document clearly** that Supabase team must run these commands post-migration

---

## MEDIUM ISSUE #2: Delete Account Creates Orphaned Invoices

**Status:** DATA INTEGRITY ISSUE

### Code Pattern
```typescript
// functions/delete-account/index.ts:36-61
// Null out FKs before deleting user
await adminClient.from('invoices').update({ seller_id: null }).eq('seller_id', userId)
await adminClient.from('invoices').update({ buyer_id: null }).eq('buyer_id', userId)
```

### Resulting Orphaned Records
```sql
SELECT * FROM invoices WHERE seller_id IS NULL AND buyer_id IS NULL;
-- These invoices are now invisible due to RLS:
-- Policy: "owner_sees_own_invoices" requires buyer_id = auth.uid() OR seller_id = auth.uid()
-- Result: Nobody can ever read these orphaned invoices
```

### Better Approach
```typescript
// Option 1: Archive instead of delete
await adminClient.from('invoices')
  .update({ archived: true, deleted_by_user_id: userId })
  .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)

// Option 2: Create automatic credit notes before deletion
const { data: userInvoices } = await adminClient
  .from('invoices')
  .select('id, amount_ttc')
  .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)

for (const inv of userInvoices || []) {
  await adminClient.from('invoices').insert({
    invoice_type: 'credit_note',
    related_invoice_id: inv.id,
    amount_ttc: -inv.amount_ttc,
    status: 'issued'
    // ... other fields
  })
}
```

---

## MEDIUM ISSUE #3: Emergency Provider Null Bug

**Status:** WORKFLOW BROKEN

### Code
```sql
-- 20260320000005_fix_all_delete_cascades.sql:12-16
ALTER TABLE emergency_requests ALTER COLUMN accepted_provider_id DROP NOT NULL;
ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_accepted_provider_id_fkey
  FOREIGN KEY (accepted_provider_id) REFERENCES users(id) ON DELETE SET NULL;
```

### Scenario
1. Provider A accepts emergency request E (accepted_provider_id = A)
2. Provider A deletes their account
3. accepted_provider_id becomes NULL
4. Emergency is now in a broken state: nobody is assigned, no way to reassign

### Current Workaround
None. The emergency just hangs.

### Fix
Add trigger:
```sql
CREATE OR REPLACE FUNCTION reassign_emergency_on_provider_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.accepted_provider_id IS NULL AND OLD.accepted_provider_id IS NOT NULL THEN
    -- Provider was just deleted, reset emergency to open
    NEW.status := 'open';
    -- Optional: send notification to owner
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reassign_emergency_on_provider_delete
  BEFORE UPDATE ON emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION reassign_emergency_on_provider_delete();
```

---

## MEDIUM ISSUE #4: Stripe Webhook Idempotency

**Status:** RACE CONDITION

### Current Code
```typescript
// functions/stripe-webhook/index.ts:40-66
case 'payment_intent.succeeded': {
  const pi = event.data.object as Stripe.PaymentIntent
  const { missionId, emergencyId } = pi.metadata || {}

  if (missionId) {
    // Update mission status
    await db.from('missions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', missionId)

    // Generate invoices
    await Promise.all([
      db.functions.invoke('generate-invoice', { body: { invoiceType: 'service' } }),
      db.functions.invoke('generate-invoice', { body: { invoiceType: 'service_fee' } }),
      db.functions.invoke('generate-invoice', { body: { invoiceType: 'commission' } }),
    ])
  }
}
```

### Problem
If Stripe sends the webhook twice (which it does for reliability):
1. **First call:** Mission updated to 'paid', 3 invoices created
2. **Second call (within seconds):** Mission already 'paid', but invoices... what happens?

Invoice dedup check:
```typescript
// functions/generate-invoice/index.ts:26-35
const { data: existing } = await dedupQuery.limit(1)
if (existing && existing.length > 0) {
  return { ok: true, skipped: true }
}
```

**Race condition:** Both calls check `existing`, both get empty result (no invoice yet), both create invoices.

### Fix
```typescript
// stripe-webhook/index.ts
const { data: alreadyProcessed } = await db
  .from('stripe_events_received')
  .select('id')
  .eq('event_id', event.id)
  .single()

if (alreadyProcessed) {
  return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 })
}

// Process event...

// After success, mark as processed
await db.from('stripe_events_received').insert({ event_id: event.id })
```

Requires migration:
```sql
CREATE TABLE IF NOT EXISTS stripe_events_received (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stripe_events_processed_at ON stripe_events_received(processed_at DESC)
WHERE processed_at < now() - INTERVAL '24 hours';
```

---

## SUMMARY TABLE: All Issues by Severity

| ID | Severity | Component | Issue | Effort | Risk |
|----|----------|-----------|-------|--------|------|
| 1 | 🔴 P0 | RLS Policies | `is_admin()` function missing | 30m | COMPLETE |
| 2 | 🔴 P0 | RLS Policies | rate_limit_log USING(false) | 15m | COMPLETE |
| 3 | 🔴 P0 | DB Trigger | State machine statuses incompatible | 2h | COMPLETE |
| 4 | 🔴 P0 | RLS Policies | Notifications INSERT too permissive | 15m | HIGH |
| 5 | 🔴 P0 | RLS Policies | Invoice RLS auth.role() check broken | 15m | HIGH |
| 6 | 🟡 P1 | CORS | Origin validation missing | 30m | MEDIUM |
| 7 | 🟡 P1 | Config | password_requirements empty | 5m | LOW |
| 8 | 🟡 P1 | Cron Jobs | Database config params not set | 1h | MEDIUM |
| 9 | 🟡 P2 | Data Flow | Delete account orphans invoices | 1h | MEDIUM |
| 10 | 🟡 P2 | Workflow | Emergency provider null handling | 1h | MEDIUM |
| 11 | 🟡 P2 | Business Logic | Service fees hardcoded | 1.5h | LOW |
| 12 | 🟡 P2 | Storage RLS | Missing path-based ownership check | 1h | MEDIUM |
| 13 | 🟡 P2 | Audit | No rate limit on audit_log inserts | 1h | LOW |
| 14 | 🟡 P2 | Idempotency | Stripe webhook duplicate events | 1.5h | MEDIUM |

