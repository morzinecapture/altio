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
- **Module urgence avec Stripe**: Flux complet urgence → acceptation prestataire → paiement déplacement (Stripe) → devis → paiement devis (Stripe) → travaux → terminé
- **Commission cachée 20%**: Ni le propriétaire ni le prestataire ne voient la commission plateforme
- **Bouton urgence flottant**: Toujours accessible depuis le dashboard

### Prestataire (Provider)
- **Dashboard**: Missions disponibles géolocalisées, toggle disponibilité on/off, urgences en cours
- **Acceptation urgence**: Frais déplacement + diagnostic + temps estimé d'arrivée
- **Devis in-app**: Lignes détaillées, calcul TVA auto (uniquement après paiement déplacement)
- **Complétion**: Marquer intervention terminée avec photos avant/après
- **Revenus**: Stats (missions complétées, en cours, gains totaux)

### Paiements Stripe
- **Stripe Checkout** via emergentintegrations (clé test sk_test_emergent)
- **Commission cachée**: Propriétaire paie montant_prestataire / 0.80 (20% commission)
- **2 paiements par urgence**: Déplacement + Réparation
- **Polling statut**: Vérification automatique du paiement après retour de Stripe
- **Webhook**: Endpoint /api/webhook/stripe pour notifications Stripe

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
