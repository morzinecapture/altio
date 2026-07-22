---
name: chr-auth-nextjs
description: >
  Authentification Supabase pour CHR Recruiter — Next.js App Router (pas Expo).
  Utilise cette skill pour tout ce qui touche à login, signup, logout, session, protection de routes,
  middleware, cookies, Server Components, ou gestion du profil recruteur.
  Triggers : "auth", "connexion", "inscription", "login", "logout", "session", "middleware",
  "protéger route", "recruteur connecté", "mot de passe oublié", "supabase auth nextjs".
---

# Auth Supabase — CHR Recruiter / Next.js App Router

## Installation

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

## Client Supabase — Server et Client

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## Middleware — Protection des routes

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protéger le dashboard
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rediriger les utilisateurs connectés hors du login
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
}
```

---

## Page Login

```tsx
// app/login/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl border border-blue-100 p-8 w-full max-w-md shadow-sm"
      >
        <h1 className="text-2xl font-bold text-[#0C4A6E] mb-2">Connexion</h1>
        <p className="text-sm text-slate-500 mb-8">Accédez à vos candidatures</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0369A1] focus:border-transparent"
              placeholder="vous@restaurant.fr"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0369A1] focus:border-transparent"
              required
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-[#0369A1] text-white rounded-xl py-3 font-semibold text-sm hover:bg-[#0C4A6E] transition disabled:opacity-60 mt-2"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </motion.button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Pas encore de compte ?{' '}
          <a href="/signup" className="text-[#0369A1] font-medium hover:underline">
            S'inscrire gratuitement
          </a>
        </p>
      </motion.div>
    </div>
  )
}
```

---

## Signup (recruteur)

```typescript
// actions/auth.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signUp(formData: FormData) {
  const supabase = createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Erreur lors de l\'inscription. Réessayez.' }
  }

  // Créer l'entrée dans la table recruiters
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('recruiters').insert({
      id: user.id,
      email: user.email!,
      plan: 'free',
    })
  }

  redirect('/dashboard')
}
```

---

## Logout (Server Action)

```typescript
// actions/auth.ts (suite)
export async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

```tsx
// Dans le nav ou le dashboard
import { logout } from '@/actions/auth'

<form action={logout}>
  <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
    Déconnexion
  </button>
</form>
```

---

## Hook — utilisateur côté client

```typescript
// hooks/useRecruiter.ts
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useRecruiter() {
  const [recruiter, setRecruiter] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('recruiters')
        .select('*')
        .eq('id', user.id)
        .single()
      setRecruiter(data)
      setLoading(false)
    })
  }, [])

  return { recruiter, loading }
}
```

---

## Règles
- Toujours utiliser `@supabase/ssr` — jamais `@supabase/auth-helpers-nextjs` (déprécié)
- Le middleware doit tourner sur **toutes** les routes `/dashboard/*`
- Après signup, envoyer vers `/dashboard` (pas de page intermédiaire)
- `router.refresh()` après login pour que les Server Components relisent la session
