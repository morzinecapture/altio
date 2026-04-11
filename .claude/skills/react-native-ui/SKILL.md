---
name: react-native-ui
description: Composants UI et design system Altio avec NativeWind (Tailwind CSS pour React Native). Utilise cette skill dès qu'on crée un composant, qu'on parle de style, design, couleurs, typographie, boutons, cards, formulaires, ou interface utilisateur.
---

# Design System UI — Altio / NativeWind

## Palette de couleurs
```typescript
// constants/colors.ts
export const colors = {
  primary: '#2563eb',       // Bleu — actions principales
  primaryLight: '#dbeafe',
  secondary: '#059669',     // Vert — succès, confirmations
  secondaryLight: '#d1fae5',
  warning: '#d97706',       // Orange — alertes, missions urgentes
  warningLight: '#fef3c7',
  danger: '#dc2626',        // Rouge — erreurs, annulations
  dangerLight: '#fee2e2',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    500: '#6b7280',
    700: '#374151',
    900: '#111827',
  },
}
```

## Composants de base

### Bouton
```tsx
// components/ui/Button.tsx
interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
}

// Tailles : sm=40px, md=48px, lg=56px de hauteur
// Toujours min 48px pour les zones tactiles (accessibilité)
// Texte : sm=14px, md=16px, lg=18px
// Border radius : 12px partout
```

### Card de mission
```tsx
// components/mission/MissionCard.tsx
// Structure :
// ┌──────────────────────────┐
// │ 🔧 Plomberie    Urgente  │ ← Type + badge priorité
// │ Fuite sous évier          │ ← Titre
// │ 📍 Morzine · 🗓 15 mars  │ ← Lieu + date
// │ 💰 80-120€               │ ← Fourchette prix
// │ ─────────────────────────│
// │ 3 candidatures · Il y a 2h│ ← Stats
// └──────────────────────────┘
```

### Badge de statut
```tsx
// components/ui/StatusBadge.tsx
const STATUS_CONFIG = {
  broadcast: { label: 'En recherche', bg: 'bg-blue-100', text: 'text-blue-700' },
  assigned: { label: 'Assignée', bg: 'bg-amber-100', text: 'text-amber-700' },
  in_progress: { label: 'En cours', bg: 'bg-purple-100', text: 'text-purple-700' },
  completed: { label: 'Terminée', bg: 'bg-green-100', text: 'text-green-700' },
  paid: { label: 'Payée', bg: 'bg-green-100', text: 'text-green-700' },
  disputed: { label: 'Litige', bg: 'bg-red-100', text: 'text-red-700' },
  expired: { label: 'Expirée', bg: 'bg-gray-100', text: 'text-gray-500' },
  cancelled: { label: 'Annulée', bg: 'bg-gray-100', text: 'text-gray-500' },
}
```

## Typographie
- **Titres d'écran** : 24px bold
- **Titres de section** : 18px semibold
- **Titres de card** : 16px semibold
- **Corps de texte** : 14px regular
- **Labels** : 12px medium, couleur gray-500
- **Police** : System font (San Francisco iOS, Roboto Android)

## Espacement (multiples de 4)
- Padding écran : 16px horizontal
- Gap entre cards : 12px
- Padding interne card : 16px
- Gap entre éléments dans une card : 8px
- Marge entre sections : 24px

## Patterns NativeWind
```tsx
// Toujours utiliser className, jamais style inline (sauf animations)
<View className="flex-1 bg-gray-50 px-4 pt-4">
  <Text className="text-2xl font-bold text-gray-900">Missions</Text>
  <View className="mt-6 gap-3">
    {missions.map(m => <MissionCard key={m.id} mission={m} />)}
  </View>
</View>

// Card pattern standard
<Pressable className="bg-white rounded-xl p-4 border border-gray-200 active:bg-gray-50">
  {/* contenu */}
</Pressable>
```

## États obligatoires par écran
```tsx
// Chaque écran de liste gère :
if (loading) return <LoadingSkeleton />           // Skeleton, pas spinner
if (error) return <ErrorState onRetry={refetch} /> // Message + bouton retry
if (data.length === 0) return <EmptyState />       // Illustration + CTA
return <ListeNormale data={data} />
```

## Accessibilité
- Zones tactiles minimum 48x48px
- Contraste texte/fond minimum 4.5:1
- Labels sur tous les inputs
- `accessibilityLabel` sur les boutons icônes
- Tous les textes en français
