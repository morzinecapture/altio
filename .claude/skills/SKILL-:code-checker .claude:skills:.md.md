---
name: altio-code-checker
description: >
  Vérifie la qualité du code, les patterns, la sécurité et les bugs potentiels dans le
  projet Altio (React Native + Supabase). Utilise cette skill quand tu veux auditer du code,
  chercher des bugs, vérifier les politiques RLS Supabase, valider les types TypeScript,
  ou quand l'utilisateur mentionne "bug", "vérifier le code", "code review", "ça marche pas",
  "les missions ne s'affichent pas", "RLS", "sécurité", "qualité du code", ou "lint".
  IMPORTANT : les problèmes de données invisibles dans Altio sont souvent causés par les
  politiques RLS Supabase qui retournent des tableaux vides sans erreur.
---

# Altio Code Checker

Tu es un expert en qualité de code spécialisé dans React Native (Expo) + Supabase.
Tu connais les pièges spécifiques de cette stack et les bugs silencieux de Supabase RLS.

## Stack Altio

- **Frontend** : React Native, Expo, TypeScript, NativeWind, React Navigation, Reanimated
- **Backend** : Supabase (PostgreSQL, RLS, Auth, Storage, Realtime)
- **Paiements** : Stripe Connect (commission split owner/provider)
- **Icônes** : Lucide React Native

## Vérifications automatiques

### 1. Supabase RLS (PRIORITÉ CRITIQUE)

C'est le bug #1 d'Altio. Les politiques RLS mal configurées retournent silencieusement
des tableaux vides au lieu d'erreurs.

**Checklist RLS :**
```sql
-- Vérifie que TOUTES les tables ont RLS activé
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Vérifie les politiques existantes
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

**Patterns corrects pour Altio :**
```sql
-- Les propriétaires voient LEURS missions
CREATE POLICY "owners_see_own_missions" ON missions
  FOR SELECT USING (auth.uid() = owner_id);

-- Les prestataires voient les missions PUBLIÉES (pas seulement les leurs !)
CREATE POLICY "providers_see_published_missions" ON missions
  FOR SELECT USING (
    status = 'published' 
    AND auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'provider'
    )
  );

-- Les prestataires voient aussi les missions qu'ils ont acceptées
CREATE POLICY "providers_see_accepted_missions" ON missions
  FOR SELECT USING (
    provider_id = auth.uid()
  );
```

**Red flags RLS :**
- ❌ Table sans aucune policy SELECT → personne ne voit rien
- ❌ Policy qui filtre sur `auth.uid() = owner_id` sans policy séparée pour les providers
- ❌ `USING (true)` sur des tables sensibles → faille de sécurité
- ❌ Oubli de policy pour les opérations INSERT/UPDATE/DELETE

### 2. TypeScript

- Vérifie que les types Supabase sont générés et à jour
  ```bash
  npx supabase gen types typescript --project-id <ref> > src/types/database.ts
  ```
- Pas de `any` sauf cas exceptionnels documentés
- Types pour les réponses API Supabase correctement typés
- Enums pour les statuts : `mission_status`, `emergency_level`, `user_role`

### 3. React Native / Expo

- Pas d'import de modules Node.js incompatibles (fs, path, crypto natif)
- `useEffect` avec cleanup pour les subscriptions Supabase Realtime
- Pas de state update sur un composant démonté
- `FlatList` au lieu de `ScrollView` + `.map()` pour les longues listes
- Images optimisées (pas de PNG haute résolution non compressé)

### 4. Navigation

- Deep linking configuré pour les notifications
- Pas de navigation stack infinie (reset quand approprié)
- Guards d'authentification sur les routes protégées
- Redirection correcte selon le rôle (owner vs provider)

### 5. Stripe Connect

- Les montants sont en centimes (pas en euros)
- Le calcul de commission est côté serveur (Supabase Edge Function), jamais côté client
- Vérification du statut `onboarding_complete` avant de permettre les paiements
- Gestion des webhooks Stripe avec vérification de signature

### 6. Sécurité générale

- Pas de clés API en dur dans le code (utiliser les variables d'environnement Expo)
- `SUPABASE_ANON_KEY` uniquement côté client, `SERVICE_ROLE_KEY` uniquement côté serveur
- Pas de données sensibles dans AsyncStorage sans chiffrement
- Validation des inputs côté serveur (Edge Functions)

## Format de sortie

```
## Code Review — [Fichier/Fonctionnalité]

### 🔴 Critiques (bloquants)
1. [RLS] Description du problème + fix SQL
2. [SECURITY] Description + fix

### 🟡 Warnings (à corriger)
1. [TYPE] Description + fix TypeScript
2. [PERF] Description + optimisation

### 🟢 Suggestions (nice to have)
1. [CLEAN] Description + refacto proposé

### 📊 Score de qualité : X/10
```

## Commande de diagnostic rapide

Si l'utilisateur dit "ça marche pas" ou "les missions ne s'affichent pas", commence
TOUJOURS par vérifier les politiques RLS :

1. Lister les policies sur la table concernée
2. Vérifier le rôle de l'utilisateur connecté
3. Tester la query avec et sans RLS
4. Vérifier les logs Supabase pour des erreurs silencieuses
