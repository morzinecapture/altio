---
name: supabase-auth
description: Authentification Supabase dans Expo pour Altio. Utilise cette skill pour tout ce qui touche à login, signup, logout, session, token, refresh, mot de passe oublié, magic link, OAuth, protection de routes, ou gestion du profil utilisateur. Déclenche aussi quand un bug semble lié à l'authentification ou aux sessions.
---

# Authentification Supabase — Altio / Expo

## Configuration du client
```typescript
// lib/supabase.ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Important pour React Native
    },
  }
)
```

## Flux d'inscription Altio
L'inscription détermine le rôle : **propriétaire** ou **prestataire**.

```typescript
// services/auth.ts
export async function signUp(
  email: string,
  password: string,
  role: 'owner' | 'provider',
  profileData: OwnerProfile | ProviderProfile
) {
  // 1. Créer le compte
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role }, // Stocké dans user_metadata
    },
  })
  if (authError) throw authError

  // 2. Créer le profil (trigger Supabase ou appel manuel)
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user!.id,
      role,
      ...profileData,
    })
  if (profileError) throw profileError

  return authData
}
```

## Hook d'authentification
```typescript
// hooks/useAuth.ts
import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Récupérer la session existante
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Écouter les changements
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    isOwner: session?.user?.user_metadata?.role === 'owner',
    isProvider: session?.user?.user_metadata?.role === 'provider',
  }
}
```

## Protection des routes (Expo Router)
```typescript
// app/_layout.tsx
import { useAuth } from '@/hooks/useAuth'
import { Redirect, Stack } from 'expo-router'

export default function RootLayout() {
  const { session, loading } = useAuth()

  if (loading) return <SplashScreen />
  if (!session) return <Redirect href="/login" />

  return <Stack />
}
```

## Règles strictes
- Toujours `detectSessionInUrl: false` dans la config Supabase (React Native)
- Jamais stocker le token manuellement — Supabase gère via AsyncStorage
- Toujours vérifier `session.user.user_metadata.role` pour conditionner la navigation
- Le mot de passe oublié utilise un deep link Expo : configurer le scheme dans `app.json`
- Après signup, envoyer l'utilisateur vers un écran d'onboarding (pas directement le dashboard)
