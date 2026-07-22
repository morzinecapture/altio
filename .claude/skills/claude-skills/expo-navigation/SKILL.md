---
name: expo-navigation
description: Patterns de navigation Expo Router pour Altio — tabs, stacks, modales, deep links. Utilise cette skill dès qu'on crée un écran, qu'on parle de navigation, routing, tabs, stack, modale, deep link, redirect, ou structure des pages dans l'app.
---

# Expo Router Navigation — Altio

## Structure de navigation
```
app/
├── _layout.tsx              # Root: Auth guard + providers
├── index.tsx                # Redirect → /login ou /(tabs)
├── (auth)/
│   ├── _layout.tsx          # Stack sans header
│   ├── login.tsx
│   ├── signup.tsx
│   ├── forgot-password.tsx
│   └── onboarding/
│       ├── role-select.tsx  # Propriétaire ou Prestataire
│       ├── owner-setup.tsx  # Config propriétaire
│       └── provider-setup.tsx # Config prestataire + zones + services
├── (owner-tabs)/            # Tabs propriétaire
│   ├── _layout.tsx          # TabBar propriétaire
│   ├── index.tsx            # Dashboard missions
│   ├── properties.tsx       # Mes logements
│   ├── messages.tsx         # Messagerie
│   └── profile.tsx          # Mon profil
├── (provider-tabs)/         # Tabs prestataire
│   ├── _layout.tsx          # TabBar prestataire
│   ├── index.tsx            # Missions disponibles
│   ├── my-missions.tsx      # Mes missions en cours
│   ├── messages.tsx         # Messagerie
│   └── profile.tsx          # Mon profil + stats
├── mission/
│   ├── [id].tsx             # Détail mission (stack)
│   ├── create.tsx           # Créer mission (modale)
│   └── review/[id].tsx      # Noter après mission
├── property/
│   ├── [id].tsx             # Détail logement
│   ├── add.tsx              # Ajouter logement (modale)
│   └── ical-setup/[id].tsx  # Config iCal
└── provider/
    ├── [id].tsx             # Profil prestataire public
    └── stripe-onboarding.tsx
```

## Root Layout avec auth guard
```tsx
// app/_layout.tsx
import { Slot, useRouter, useSegments } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'

export default function RootLayout() {
  const { session, loading, isOwner, isProvider } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'

    if (!session && !inAuth) {
      router.replace('/login')
    } else if (session && inAuth) {
      // Rediriger vers les bons tabs selon le rôle
      if (isOwner) router.replace('/(owner-tabs)')
      else if (isProvider) router.replace('/(provider-tabs)')
    }
  }, [session, loading, segments])

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  )
}
```

## Tabs différenciés par rôle
```tsx
// app/(owner-tabs)/_layout.tsx
import { Tabs } from 'expo-router'
import { Home, Building2, MessageCircle, User } from 'lucide-react-native'

export default function OwnerTabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#2563eb' }}>
      <Tabs.Screen name="index" options={{
        title: 'Missions',
        tabBarIcon: ({ color }) => <Home size={22} color={color} />,
      }} />
      <Tabs.Screen name="properties" options={{
        title: 'Logements',
        tabBarIcon: ({ color }) => <Building2 size={22} color={color} />,
      }} />
      <Tabs.Screen name="messages" options={{
        title: 'Messages',
        tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profil',
        tabBarIcon: ({ color }) => <User size={22} color={color} />,
      }} />
    </Tabs>
  )
}
```

## Modales
```tsx
// Ouvrir une modale depuis n'importe où
router.push('/mission/create')

// app/mission/create.tsx — se présente comme modale
export default function CreateMission() {
  return (/* ... */)
}

// Dans le _layout parent, configurer comme modale :
<Stack.Screen name="mission/create" options={{ presentation: 'modal' }} />
```

## Deep Links (Expo)
```json
// app.json
{
  "expo": {
    "scheme": "altio",
    "plugins": [["expo-router", { "origin": "https://altio.app" }]]
  }
}
```
Permet : `altio://mission/abc123` ou `https://altio.app/mission/abc123`

## Règles
- Toujours 2 layouts tabs séparés (owner vs provider) — jamais un seul avec des conditions
- Les écrans de détail (mission, property, provider) sont dans des stacks hors tabs
- Les formulaires de création sont des modales
- Deep links pour : partage de profil prestataire, lien direct vers une mission
- Toujours un bouton retour explicite sur les stacks (pas que le swipe)
