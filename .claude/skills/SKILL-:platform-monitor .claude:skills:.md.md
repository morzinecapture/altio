---
name: altio-platform-monitor
description: >
  Surveille la santé de la plateforme Altio et diagnostique les problèmes. Utilise cette skill
  quand l'utilisateur veut vérifier que tout fonctionne, diagnostiquer un problème en production,
  surveiller les performances, ou mettre en place des alertes. Déclenche aussi pour "monitoring",
  "santé de la plateforme", "ça plante", "erreur en prod", "les utilisateurs se plaignent",
  "performance", "uptime", "logs", "debug production", "Supabase down", "Stripe webhook fail",
  ou "vérifier que tout va bien".
---

# Altio Platform Monitor

Tu es un SRE/DevOps spécialisé dans les apps Supabase + React Native.
Tu diagnostiques les problèmes et mets en place de la supervision proactive.

## Architecture à surveiller

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  App Mobile  │────▶│   Supabase   │────▶│  PostgreSQL  │
│  (Expo/RN)   │     │  (API + Auth)│     │  (+ RLS)     │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │Edge Functions│──── Stripe Connect
                     └──────────────┘
```

## Scripts de diagnostic

### Health Check complet
```sql
-- 1. Vérifier la connectivité de base
SELECT NOW() AS db_time, current_database(), current_user;

-- 2. Vérifier les tables critiques
SELECT 
  'profiles' AS table_name, COUNT(*) AS row_count FROM profiles
UNION ALL
SELECT 'missions', COUNT(*) FROM missions
UNION ALL
SELECT 'emergencies', COUNT(*) FROM emergencies;

-- 3. Vérifier les index
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- 4. Requêtes lentes
SELECT 
  query,
  calls,
  mean_exec_time::numeric(10,2) AS avg_ms,
  max_exec_time::numeric(10,2) AS max_ms
FROM pg_stat_statements
WHERE schemaname = 'public'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 5. Connexions actives
SELECT count(*) AS active_connections,
  max_conn AS max_connections
FROM pg_stat_activity,
  (SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections') mc
GROUP BY max_conn;
```

### Vérification RLS (le point faible connu d'Altio)
```sql
-- Tables SANS RLS activé (CRITIQUE)
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false;

-- Tables avec RLS mais SANS policies (= personne ne peut rien lire)
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.schemaname = 'public' 
AND t.rowsecurity = true
AND p.policyname IS NULL;

-- Policies trop permissives (USING true)
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
AND qual = 'true';
```

### Vérification Stripe Connect
```typescript
// Edge Function de health check Stripe
import Stripe from 'stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

// Vérifier que le webhook endpoint est actif
const webhookEndpoints = await stripe.webhookEndpoints.list();
console.log('Webhook endpoints:', webhookEndpoints.data.length);

// Vérifier les paiements récents en échec
const failedPayments = await stripe.paymentIntents.list({
  limit: 10,
  created: { gte: Math.floor(Date.now()/1000) - 86400 },
});
const failures = failedPayments.data.filter(p => p.status === 'requires_payment_method');
console.log('Paiements échoués (24h):', failures.length);

// Vérifier les comptes Connect avec onboarding incomplet
const accounts = await stripe.accounts.list({ limit: 100 });
const incomplete = accounts.data.filter(a => !a.charges_enabled);
console.log('Comptes Connect incomplets:', incomplete.length);
```

## Alertes à configurer

### Supabase Database Webhooks
```sql
-- Alerte : urgence non prise en charge après 30 min
CREATE OR REPLACE FUNCTION check_unhandled_emergencies()
RETURNS void AS $$
DECLARE
  unhandled_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unhandled_count
  FROM emergencies
  WHERE status = 'active'
  AND created_at < NOW() - INTERVAL '30 minutes'
  AND provider_id IS NULL;
  
  IF unhandled_count > 0 THEN
    -- Envoyer notification admin via webhook
    PERFORM net.http_post(
      'https://votre-webhook-url.com/alert',
      jsonb_build_object(
        'type', 'unhandled_emergency',
        'count', unhandled_count,
        'severity', 'high'
      )::text,
      'application/json'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Exécuter toutes les 5 minutes via pg_cron
SELECT cron.schedule('check-emergencies', '*/5 * * * *', 
  'SELECT check_unhandled_emergencies()');
```

### Métriques clés à surveiller

| Métrique | Seuil normal | Alerte | Critique |
|----------|-------------|--------|----------|
| Temps de réponse API | < 200ms | > 500ms | > 2s |
| Taux d'erreur | < 1% | > 5% | > 10% |
| Urgences non assignées | 0 | > 0 (30min) | > 0 (1h) |
| Paiements échoués/jour | < 2 | > 5 | > 10 |
| Connexions DB | < 50% max | > 70% | > 90% |
| Inscription sans complétion 24h | < 30% | > 50% | > 70% |

## Edge Function de monitoring

```typescript
// supabase/functions/platform-health/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const checks = {
    timestamp: new Date().toISOString(),
    database: 'unknown',
    auth: 'unknown',
    storage: 'unknown',
    realtime: 'unknown',
    stripe: 'unknown',
  };

  // Check DB
  try {
    const { error } = await supabase.from('profiles').select('count').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch { checks.database = 'down'; }

  // Check Auth
  try {
    const { error } = await supabase.auth.getSession();
    checks.auth = error ? 'error' : 'ok';
  } catch { checks.auth = 'down'; }

  // Check Storage
  try {
    const { error } = await supabase.storage.listBuckets();
    checks.storage = error ? 'error' : 'ok';
  } catch { checks.storage = 'down'; }

  // Log results
  await supabase.from('health_checks').insert(checks);

  const allOk = Object.values(checks)
    .filter(v => v !== checks.timestamp)
    .every(v => v === 'ok');

  return new Response(JSON.stringify(checks), {
    status: allOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

## Commande de diagnostic rapide

Quand l'utilisateur dit "vérifie que tout va bien" ou "status de la plateforme" :

1. **DB health** : connexion, temps de réponse, connexions actives
2. **RLS check** : tables sans policies, policies manquantes
3. **Data integrity** : missions orphelines, users sans profil, urgences bloquées
4. **Stripe** : webhooks actifs, paiements échoués récents
5. **Performance** : requêtes lentes, index manquants

Résultat sous forme de rapport avec emojis de statut :
- ✅ OK
- ⚠️ Warning (à surveiller)
- ❌ Critique (action immédiate requise)
