---
name: altio-onboarding
description: >
  Génère et améliore les flux d'onboarding pour Altio (propriétaires et prestataires).
  Utilise cette skill quand l'utilisateur veut créer ou modifier un parcours d'inscription,
  un flow de première utilisation, un tutoriel in-app, ou des écrans de bienvenue.
  Déclenche aussi pour "onboarding", "inscription", "premier lancement", "welcome screen",
  "tutoriel", "guide utilisateur", "KYC", "vérification prestataire", ou "Stripe onboarding".
---

# Altio Onboarding Flow

Tu génères des parcours d'onboarding complets pour les deux types d'utilisateurs Altio :
les propriétaires de biens et les prestataires de services.

## Contexte métier

Altio est une marketplace de gestion immobilière connectant :
- **Propriétaires** : possèdent des résidences secondaires ou locations saisonnières en France
- **Prestataires** : plombiers, électriciens, serruriers, agents d'entretien locaux

La confiance est le facteur clé. Les propriétaires confient l'accès à leur bien,
les prestataires engagent leur réputation professionnelle.

## Principes d'onboarding

1. **Progressif** : ne demande que le strict minimum pour commencer, complète ensuite
2. **Rôle-aware** : le parcours bifurque dès le choix du rôle
3. **Value-first** : montre la valeur avant de demander des efforts
4. **Frictionless** : chaque étape supplémentaire = des utilisateurs perdus

## Flow Propriétaire

```
1. Welcome Screen
   → Illustration + proposition de valeur
   → "Gérez vos biens à distance, en toute sérénité"
   
2. Choix du rôle
   → Card "Je suis propriétaire" / "Je suis prestataire"
   → Animation de sélection (Reanimated)

3. Inscription rapide
   → Email + mot de passe (Supabase Auth)
   → OU connexion Google/Apple
   → Prénom + Nom (minimum vital)

4. Ajouter un premier bien
   → Nom du bien + Adresse (autocomplete Google Places)
   → Type (appartement, maison, local commercial)
   → Photo principale (optionnel mais encouragé)
   → Skip possible : "Je ferai ça plus tard"

5. Découverte guidée (optionnel)
   → 3 tooltips sur l'écran principal :
     • "Créez une mission ici"
     • "Déclarez une urgence ici"  
     • "Vos prestataires favoris ici"

6. Écran de confirmation
   → "Votre espace est prêt !"
   → CTA : "Créer ma première mission"
```

## Flow Prestataire

```
1. Welcome Screen (même que propriétaire)

2. Choix du rôle → "Je suis prestataire"

3. Inscription rapide
   → Email + mot de passe (Supabase Auth)
   → OU connexion Google/Apple
   → Prénom + Nom + Téléphone

4. Profil professionnel
   → Métier(s) : sélection multiple avec icônes
     (Plomberie, Électricité, Serrurerie, Ménage, Jardinage, Multi-services)
   → Zone d'intervention : carte interactive ou code postal
   → Photo de profil (encouragé)

5. Vérification (différé)
   → Explication : "Pour garantir la confiance..."
   → Upload SIRET / Kbis (optionnel au départ)
   → Upload assurance RC Pro (optionnel au départ)
   → Badge "Vérifié" après validation

6. Stripe Connect Onboarding
   → Explication : "Pour recevoir vos paiements..."
   → Redirection vers Stripe Connect Onboarding
   → Callback de succès → profil complété
   → Skip possible mais rappel récurrent

7. Découverte guidée
   → "Les missions disponibles près de vous"
   → "Activez les notifications pour ne rien rater"
   → "Votre tableau de bord"

8. Écran de confirmation
   → "Bienvenue dans le réseau Altio !"
   → CTA : "Voir les missions disponibles"
```

## Composants React Native à générer

### ProgressBar d'onboarding
```tsx
// Barre de progression en haut de chaque écran
interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}
```

### Écran de choix de rôle
```tsx
// Deux cards animées avec Reanimated
// Effet de sélection : scale + border color change
// Icônes Lucide : Home pour propriétaire, Wrench pour prestataire
```

### Écran de complétion de profil
```tsx
// Checklist visuelle du profil
// Chaque item complété = animation checkmark
// Pourcentage de complétion affiché
// Items manquants en grisé avec CTA "Compléter"
```

## Données Supabase

### Table profiles (extension)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  onboarding_completed_at TIMESTAMPTZ DEFAULT NULL,
  onboarding_step INTEGER DEFAULT 0,
  profile_completion_pct INTEGER DEFAULT 0;
```

### Tracking d'onboarding
```sql
CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  step_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  skipped BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'
);
```

## Métriques clés à tracker

- Taux de complétion par étape (funnel)
- Temps moyen par étape
- Taux de skip par étape
- Drop-off points
- Temps entre inscription et première mission créée/acceptée

## Règles NativeWind

- Padding horizontal des écrans : `px-6`
- Espacement entre sections : `gap-6` ou `space-y-6`
- Boutons primaires : `bg-primary rounded-xl py-4 px-6`
- Boutons secondaires : `border border-gray-200 rounded-xl py-4 px-6`
- Texte de skip : `text-gray-400 underline text-sm`
- Illustrations : utiliser des SVG ou Lottie, pas des PNG lourds
