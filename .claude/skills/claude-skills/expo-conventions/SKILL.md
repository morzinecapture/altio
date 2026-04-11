---
name: expo-conventions
description: Conventions React Native Expo pour le projet Altio (marketplace services saisonniers). Utilise cette skill dès qu'on crée un écran, un composant, un hook, un service, ou qu'on touche à la structure de fichiers. Déclenche aussi quand l'utilisateur mentionne Expo, React Native, structure projet, architecture, ou organisation du code.
---

# React Native Expo — Conventions Altio

## Stack technique
- **Runtime** : Expo SDK (managed workflow)
- **Language** : TypeScript strict
- **Backend** : Supabase (auth, DB, realtime, storage, edge functions)
- **Paiements** : Stripe Connect
- **Notifications** : Twilio (SMS) + Resend (email)
- **Navigation** : Expo Router (file-based)
- **State** : Zustand pour le state global, React Query pour le server state
- **Style** : NativeWind (Tailwind pour React Native)

## Structure du projet
```
altio/
├── app/                        # Expo Router (file-based routing)
│   ├── (auth)/                 # Groupe auth (login, signup)
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── _layout.tsx
│   ├── (tabs)/                 # Navigation principale (tab bar)
│   │   ├── index.tsx           # Dashboard / missions en cours
│   │   ├── missions.tsx        # Liste des missions
│   │   ├── messages.tsx        # Messagerie
│   │   ├── profile.tsx         # Profil et settings
│   │   └── _layout.tsx         # Tab bar layout
│   ├── mission/
│   │   ├── [id].tsx            # Détail mission
│   │   ├── create.tsx          # Créer une mission
│   │   └── review.tsx          # Noter un prestataire
│   ├── provider/
│   │   ├── [id].tsx            # Profil prestataire
│   │   └── search.tsx          # Recherche prestataires
│   ├── property/
│   │   ├── [id].tsx            # Détail logement
│   │   ├── add.tsx             # Ajouter un logement
│   │   └── ical-setup.tsx      # Configuration iCal
│   ├── _layout.tsx             # Root layout (auth provider)
│   └── index.tsx               # Redirect selon auth
├── components/
│   ├── ui/                     # Boutons, inputs, cards, badges
│   ├── mission/                # Composants liés aux missions
│   ├── property/               # Composants logement
│   ├── provider/               # Composants prestataire
│   └── layout/                 # Header, TabBar custom, etc.
├── lib/
│   ├── supabase.ts             # Client Supabase
│   ├── stripe.ts               # Helpers Stripe Connect
│   ├── ical.ts                 # Parser iCal
│   └── utils.ts                # Helpers divers
├── hooks/
│   ├── useAuth.ts              # Hook d'authentification
│   ├── useMissions.ts          # CRUD missions
│   ├── useProperties.ts        # CRUD logements
│   ├── useProviders.ts         # Recherche prestataires
│   └── useNotifications.ts     # Push + in-app
├── services/
│   ├── missions.ts             # Logique métier missions
│   ├── ical-sync.ts            # Sync calendriers
│   ├── matching.ts             # Algo matching prestataires
│   └── payments.ts             # Logique paiements
├── stores/
│   ├── auth.ts                 # Store Zustand auth
│   └── app.ts                  # Store Zustand global
├── types/
│   ├── database.ts             # Types générés depuis Supabase
│   ├── mission.ts              # Types métier missions
│   ├── property.ts             # Types logement
│   └── provider.ts             # Types prestataire
├── constants/
│   ├── services.ts             # Liste des types de services
│   ├── zones.ts                # Zones géographiques (Morzine, Chamonix, etc.)
│   └── pricing.ts              # Grilles tarifaires
└── assets/                     # Images, fonts, icônes
```

## Conventions de nommage
- **Fichiers** : kebab-case pour les fichiers utilitaires, PascalCase pour les composants
- **Composants** : PascalCase (`MissionCard.tsx`)
- **Hooks** : camelCase avec prefix `use` (`useMissions.ts`)
- **Services** : camelCase (`missions.ts`)
- **Types** : PascalCase pour les interfaces et types (`Mission`, `Provider`)

## Règles strictes
- Jamais de `any` en TypeScript — utiliser `unknown` puis type guard si nécessaire
- Tous les textes UI en français
- Tous les commentaires de code en français
- Chaque écran doit gérer 3 états : loading, error, empty
- Chaque appel Supabase doit être wrappé dans un try/catch
- Les couleurs viennent de la config Tailwind/NativeWind, jamais en dur
- Les données sensibles (clés API) dans `.env` uniquement, jamais commitées

## Deux profils utilisateurs distincts
L'app a deux parcours séparés :
1. **Propriétaire** : gère ses logements, crée/suit des missions, paie les prestataires
2. **Prestataire** : reçoit des missions, accepte/refuse, est payé via Stripe Connect

Le profil est déterminé à l'inscription et conditionne la navigation (tabs différentes).
