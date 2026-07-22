---
name: altio-admin
description: >
  Crée et gère le panneau d'administration Altio pour le fondateur. Utilise cette skill
  quand l'utilisateur veut un accès admin, un dashboard de contrôle, voir les stats de la
  plateforme, gérer les utilisateurs, modérer le contenu, ou superviser les paiements.
  Déclenche aussi pour "admin", "back-office", "tableau de bord", "dashboard", "stats",
  "gestion des utilisateurs", "modération", "voir les missions", "contrôler la plateforme",
  "KPI", "métriques", ou "overview".
---

# Altio Admin Dashboard

Tu construis le panneau d'administration pour le fondateur d'Altio. Ce dashboard
donne une vue complète sur l'activité de la plateforme et permet d'intervenir si nécessaire.

## Architecture

L'admin dashboard peut être implémenté de deux manières :

### Option A : Admin dans l'app mobile (recommandé pour le MVP)
- Écrans supplémentaires accessibles uniquement si `profiles.role = 'admin'`
- Avantage : une seule codebase, accès mobile immédiat
- Navigation : onglet caché ou accès via les Settings

### Option B : Web dashboard séparé (recommandé pour la scale)
- App Next.js ou React séparée connectée au même Supabase
- Avantage : écrans plus riches, tableaux complexes, exports
- Hébergement : Vercel ou Supabase hosting

## Setup de la base de données

### Rôle admin
```sql
-- Ajouter la valeur admin à l'enum des rôles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- Ou si c'est un champ texte
UPDATE profiles SET role = 'admin' WHERE email = 'maxime@altio.fr';

-- RLS : l'admin voit TOUT
CREATE POLICY "admin_full_access" ON missions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Appliquer la même policy sur toutes les tables
-- profiles, missions, emergencies, payments, reviews, etc.
```

### Vue agrégée pour les stats
```sql
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE role = 'owner') AS total_owners,
  (SELECT COUNT(*) FROM profiles WHERE role = 'provider') AS total_providers,
  (SELECT COUNT(*) FROM missions) AS total_missions,
  (SELECT COUNT(*) FROM missions WHERE status = 'published') AS active_missions,
  (SELECT COUNT(*) FROM missions WHERE status = 'completed') AS completed_missions,
  (SELECT COUNT(*) FROM emergencies WHERE status = 'active') AS active_emergencies,
  (SELECT COUNT(*) FROM missions WHERE created_at > NOW() - INTERVAL '7 days') AS missions_this_week,
  (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_this_week;
```

## Sections du Dashboard

### 1. Overview (écran principal)
```
┌─────────────────────────────────────────┐
│  📊 Altio Admin                         │
├──────────┬──────────┬──────────┬────────┤
│ 👥 Users │ 📋 Miss. │ 🚨 Urg. │ 💰 Rev │
│   142    │   89     │    3     │  2.4k€ │
├──────────┴──────────┴──────────┴────────┤
│  📈 Graphique : missions/semaine        │
│  [sparkline sur 30 jours]               │
├─────────────────────────────────────────┤
│  🔔 Alertes récentes                    │
│  • Nouvelle urgence — il y a 5min       │
│  • Paiement échoué — il y a 1h         │
│  • Nouveau prestataire inscrit — 2h     │
└─────────────────────────────────────────┘
```

### 2. Gestion des utilisateurs
- Liste paginée avec recherche et filtres (rôle, statut, date d'inscription)
- Détail utilisateur : profil, historique missions, paiements, avis
- Actions : suspendre, bannir, vérifier manuellement, envoyer un message
- Badge de vérification : approuver/rejeter les documents des prestataires

### 3. Gestion des missions
- Vue liste et vue carte (localisation des missions)
- Filtres : statut, catégorie, zone géographique, date
- Détail mission : owner, provider assigné, timeline, paiement
- Actions : annuler, réassigner, rembourser, contacter les parties

### 4. Urgences en temps réel
- Liste des urgences actives avec timer (temps depuis la déclaration)
- Localisation sur carte
- Statut : en attente, prestataire en route, résolu
- Action manuelle : assigner un prestataire, escalader

### 5. Finances
- Revenue total (commissions Altio)
- Volume de transactions (Stripe Connect)
- Paiements en attente / échoués
- Export CSV pour la comptabilité
- Préparation e-invoicing (Factur-X, deadline septembre 2026)

### 6. Modération & Support
- Signalements utilisateurs
- Avis en attente de modération
- Litiges de paiement
- Chat support (optionnel, intégrable via Crisp ou Intercom)

## Composants React Native (Option A mobile)

### AdminGuard
```tsx
// HOC qui vérifie le rôle admin
import { useAuth } from '@/hooks/useAuth';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  
  if (profile?.role !== 'admin') {
    return null; // ou redirection
  }
  
  return <>{children}</>;
}
```

### StatCard
```tsx
interface StatCardProps {
  icon: string;       // Nom Lucide
  label: string;
  value: number | string;
  trend?: number;     // % de variation
  trendPeriod?: string;
}
// Card avec icône, valeur grande, trend en vert/rouge
```

### AdminActionButton
```tsx
// Boutons d'action admin avec confirmation
// Ex: "Suspendre cet utilisateur ?" → Modal de confirmation
// Logging de toutes les actions admin dans une table audit_log
```

## Table d'audit
```sql
CREATE TABLE admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'user', 'mission', 'payment'
  target_id UUID NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches rapides
CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_target ON admin_audit_log(target_type, target_id);
```

## Notifications admin

Configurer des alertes temps réel via Supabase Realtime :
- Nouvelle urgence déclarée
- Paiement échoué
- Nouveau signalement
- Prestataire en attente de vérification

```tsx
// Subscription Realtime pour les événements critiques
useEffect(() => {
  const channel = supabase
    .channel('admin-alerts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'emergencies',
    }, (payload) => {
      showAdminNotification('Nouvelle urgence !', payload.new);
    })
    .subscribe();
    
  return () => { supabase.removeChannel(channel); };
}, []);
```

## Sécurité admin

- Le rôle admin ne doit JAMAIS être assignable côté client
- Toutes les actions admin doivent être loguées (audit_log)
- Rate limiting sur les endpoints admin
- 2FA recommandé pour le compte admin
- Edge Function pour les actions sensibles (suppression, remboursement)
