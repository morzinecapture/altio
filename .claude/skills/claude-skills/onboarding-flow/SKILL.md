---
name: onboarding-flow
description: Parcours d'onboarding Altio pour propriétaires et prestataires. Utilise cette skill dès qu'on parle d'inscription, onboarding, première connexion, setup de compte, ajout de logement, configuration de zone, ou tout écran du parcours initial utilisateur.
---

# Onboarding — Altio

## Parcours propriétaire (5 étapes)
```
1. Choix du rôle → "Je suis propriétaire"
2. Informations personnelles → Nom, téléphone, email
3. Ajouter un logement → Nom, adresse, type, nb pièces, photos
4. Connecter le calendrier → URL iCal Airbnb/Booking
5. Première mission → CTA "Créer votre première mission" ou "Activer le mode auto"
```

### Écran 4 : Config iCal (le plus critique)
- Afficher un tutoriel visuel "Comment trouver votre lien iCal"
- Screenshots Airbnb : Calendrier → Paramètres d'export → Copier le lien
- Screenshots Booking : Extranet → Calendrier → Synchronisation iCal
- Champ pour coller l'URL
- Bouton "Tester la connexion" qui fetch l'URL et affiche les prochaines réservations
- Si erreur : message clair "Ce lien ne semble pas valide. Vérifiez qu'il commence par https://"

## Parcours prestataire (5 étapes)
```
1. Choix du rôle → "Je suis prestataire"
2. Informations personnelles → Nom, entreprise, SIRET (optionnel), téléphone
3. Services proposés → Checkboxes : ménage, plomberie, électricité, jardinage, etc. + tarif horaire
4. Zones d'intervention → Sélection des stations : Morzine, Chamonix, Megève, etc.
5. Configuration paiement → Onboarding Stripe Connect (ou "Plus tard")
```

## Données à collecter

### Profil propriétaire
```typescript
interface OwnerOnboarding {
  full_name: string
  phone: string      // Format +33
  email: string      // Déjà via auth
  // Premier logement
  property_name: string
  property_address: string
  property_type: 'appartement' | 'chalet' | 'maison' | 'studio'
  property_rooms: number
  property_photos: string[]  // URLs Supabase Storage
  // iCal
  ical_url?: string
  ical_platform?: 'airbnb' | 'booking' | 'other'
}
```

### Profil prestataire
```typescript
interface ProviderOnboarding {
  full_name: string
  company_name?: string
  siret?: string
  phone: string
  services: {
    type: ServiceType
    hourly_rate: number
  }[]
  zones: string[]  // IDs des zones
  stripe_onboarding_completed: boolean
}
```

## Indicateur de progression
```tsx
// components/onboarding/ProgressBar.tsx
// Afficher les étapes : ● ● ○ ○ ○ avec le numéro de l'étape courante
// Permettre de revenir en arrière (swipe ou bouton)
// Sauvegarder la progression dans AsyncStorage (reprendre si l'app crash)
```

## Règles métier
- L'onboarding doit pouvoir être complété en moins de 3 minutes
- Le Stripe Connect du prestataire peut être fait "Plus tard" (pas bloquant)
- L'iCal du propriétaire peut être ajouté "Plus tard" (pas bloquant)
- Sauvegarder la progression à chaque étape (pas seulement à la fin)
- Après l'onboarding → rediriger vers les tabs correspondant au rôle
- Un utilisateur qui a commencé l'onboarding mais pas fini le reprend automatiquement
