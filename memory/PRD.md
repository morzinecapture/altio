# MontRTO - Product Requirements Document

## Overview
Marketplace de services opérationnels pour propriétaires de locations saisonnières en montagne. Interface mobile-first construite avec React Native Expo, backend FastAPI + MongoDB.

## V1 Features (MVP)

### Authentication
- Google Auth via Emergent OAuth
- Role selection (Propriétaire / Prestataire)
- Session management with JWT tokens

### Propriétaire (Owner)
- **Dashboard**: Vue d'ensemble avec stats (logements, missions, urgences), missions à venir, actions rapides
- **Gestion logements**: CRUD propriétés, sync iCal Airbnb/Booking, codes d'accès, tarifs fixes
- **Missions**: Création manuelle, création automatique via iCal check-out, filtrage par statut, gestion des candidatures
- **Module urgence**: Formulaire urgence avec types de service (plomberie, électricité, etc.), alertes techniciens
- **Devis in-app**: Réception et validation de devis avec détail lignes, TVA auto
- **Bouton urgence flottant**: Toujours accessible depuis le dashboard

### Prestataire (Provider)
- **Dashboard**: Missions disponibles géolocalisées, toggle disponibilité on/off
- **Candidatures**: Postuler aux missions avec tarif proposé
- **Mes missions**: Missions assignées avec codes d'accès, démarrer/terminer
- **Devis urgence**: Formulaire devis avec lignes, calcul TVA auto
- **Revenus**: Stats (missions complétées, en cours, gains totaux)

### Technique
- **Backend**: FastAPI, MongoDB (12 collections), parsing iCal
- **Frontend**: Expo Router, React Native, SafeAreaView, AsyncStorage
- **Design**: Alpine Utility (#F4F6FA fond, cartes blanches, chips statut colorées)
- **Email**: MOCKED (logs en BDD)
- **Paiements**: Stripe Connect configuré (non implémenté en V1)

## Database Collections
users, user_sessions, properties, reservations, missions, mission_applications, emergency_requests, quotes, service_types, provider_profiles, notifications, email_logs

## API Endpoints (26+)
- Auth: /api/auth/session, /me, /logout
- Users: /api/users/role, /profile, /provider-profile
- Properties: CRUD + /sync-ical
- Missions: CRUD + /apply, /start, /complete, /applications
- Emergency: CRUD + quotes
- Provider: /availability, /stats
- Dashboard: /dashboard/owner

## V2 Roadmap
- [ ] Stripe Connect paiements réels avec séquestre
- [ ] Emails réels via Resend
- [ ] Affiliation partenaires (ESF, restaurants)
- [ ] Notifications push
- [ ] Upload photos avant/après mission
- [ ] Chronomètre mission
- [ ] Avis et notes prestataires
