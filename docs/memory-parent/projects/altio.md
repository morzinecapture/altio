# Altio

## Description
Marketplace de services pour la gestion locative saisonnière. Connecte des propriétaires (owners) de logements saisonniers avec des prestataires (providers) de services : ménage, conciergerie, maintenance, check-in/check-out.

## Architecture
- **Frontend** : React Native + Expo Router (file-based routing)
- **Backend** : Supabase (PostgreSQL, Auth, Storage, Edge Functions en Deno)
- **Paiements** : Stripe Connect pour les prestataires, Stripe Payments pour les transactions
- **Auth** : Google OAuth (+ email en Sprint 2)
- **i18n** : Prévu Sprint 5 (i18next + react-i18next)

## Structure des dossiers
```
altio/
  frontend/
    app/           → Routes Expo Router
      (admin)/     → Dashboard admin
      (owner)/     → Écrans propriétaire
      (provider)/  → Écrans prestataire
      property/    → Gestion propriétés
      mission/     → Détail missions
    src/
      api.ts       → Fonctions API centralisées
      theme.ts     → Design tokens (COLORS, FONTS, SHADOWS, RADIUS)
      components/  → Composants réutilisables
      i18n/        → Internationalisation
      config/      → Configuration
  supabase/
    functions/     → Edge Functions Deno
    migrations/    → Migrations SQL
```

## Sprints planifiés
7 sprints, 14-22 jours estimés total. Voir SPRINTS.md pour le détail.

## Réglementaire
- RGPD : suppression de compte obligatoire (Sprint 2)
- Facturation électronique : Factur-X obligatoire sept 2026 pour grandes entreprises, sept 2027 pour toutes (Sprint 4)
- CGU/CGV et mentions légales obligatoires avant mise en production (Sprint 6)
