---
name: supabase-rls
description: Politiques Row Level Security Supabase pour Altio. Utilise cette skill dès qu'on crée ou modifie une table, qu'on parle de sécurité, permissions, RLS, policies, isolation des données, multi-tenant, ou accès utilisateur. Déclenche aussi quand un bug semble lié à des données manquantes ou inaccessibles.
---

# Supabase RLS — Altio

## Principe fondamental
Chaque utilisateur ne voit que SES données. Les propriétaires voient leurs logements et missions. Les prestataires voient les missions qui leur sont assignées ou diffusées dans leur zone.

## Patterns par table

### Profils utilisateurs
```sql
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### Logements (properties)
```sql
-- Seul le propriétaire voit/gère ses logements
CREATE POLICY "Owner manages properties"
  ON properties FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

### Missions
```sql
-- Le propriétaire voit ses missions créées
CREATE POLICY "Owner sees own missions"
  ON missions FOR SELECT
  USING (owner_id = auth.uid());

-- Le prestataire voit les missions qui lui sont proposées ou assignées
CREATE POLICY "Provider sees assigned/broadcast missions"
  ON missions FOR SELECT
  USING (
    provider_id = auth.uid()
    OR (
      status = 'broadcast'
      AND zone_id IN (
        SELECT zone_id FROM provider_zones WHERE provider_id = auth.uid()
      )
    )
  );

-- Seul le propriétaire crée des missions
CREATE POLICY "Owner creates missions"
  ON missions FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Le propriétaire ou le prestataire assigné peut modifier
CREATE POLICY "Involved parties update missions"
  ON missions FOR UPDATE
  USING (owner_id = auth.uid() OR provider_id = auth.uid());
```

### Paiements
```sql
-- Chaque partie voit les paiements qui la concernent
CREATE POLICY "Parties see own payments"
  ON payments FOR SELECT
  USING (payer_id = auth.uid() OR payee_id = auth.uid());
```

### Avis/Reviews
```sql
-- Publics en lecture, créateur en écriture
CREATE POLICY "Anyone reads reviews"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "Author creates review"
  ON reviews FOR INSERT
  WITH CHECK (author_id = auth.uid());
```

## Checklist avant chaque nouvelle table
1. `ALTER TABLE nom ENABLE ROW LEVEL SECURITY;` — toujours
2. Policy SELECT — qui peut lire ?
3. Policy INSERT avec WITH CHECK — qui peut créer ?
4. Policy UPDATE avec USING + WITH CHECK — qui peut modifier ?
5. Policy DELETE — qui peut supprimer ? (souvent personne, soft delete)
6. Tester avec 2 utilisateurs différents
7. Vérifier que `service_role` n'est utilisé que dans les Edge Functions

## Erreurs fréquentes Altio
- Mission broadcast invisible → le prestataire n'a pas de zone configurée
- Propriétaire ne voit pas ses missions → `owner_id` mal assigné à l'INSERT
- 0 résultats alors que les données existent → RLS activé mais policy manquante
