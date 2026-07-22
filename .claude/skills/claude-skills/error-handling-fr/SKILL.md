---
name: error-handling-fr
description: Gestion d'erreurs et messages utilisateur en français pour Altio. Utilise cette skill dès qu'on gère des erreurs, des messages toast, des validations de formulaire, des retours utilisateur, ou qu'on écrit des try/catch. Déclenche aussi quand on veut standardiser la gestion d'erreurs.
---

# Gestion d'erreurs — Altio

## Messages d'erreur utilisateur (toujours en français, toujours humains)
```typescript
// constants/errors.ts
export const ERROR_MESSAGES = {
  // Auth
  auth_invalid_credentials: 'Email ou mot de passe incorrect',
  auth_email_taken: 'Un compte existe déjà avec cet email',
  auth_weak_password: 'Le mot de passe doit contenir au moins 8 caractères',
  auth_expired_session: 'Votre session a expiré, veuillez vous reconnecter',

  // Missions
  mission_not_found: 'Cette mission n\'existe plus',
  mission_already_applied: 'Vous avez déjà candidaté à cette mission',
  mission_expired: 'Cette mission n\'accepte plus de candidatures',
  mission_cannot_cancel: 'Impossible d\'annuler une mission en cours',

  // Paiements
  payment_failed: 'Le paiement a échoué. Vérifiez votre moyen de paiement.',
  payment_stripe_not_setup: 'Configurez votre compte de paiement pour recevoir des virements',

  // Réseau
  network_offline: 'Pas de connexion internet. Vos modifications seront synchronisées.',
  network_timeout: 'La connexion est lente. Réessayez dans un instant.',

  // Générique
  unknown: 'Une erreur est survenue. Réessayez ou contactez le support.',
}
```

## Pattern try/catch standard
```typescript
// Chaque appel Supabase suit ce pattern
export async function fetchMissions(): Promise<Result<Mission[]>> {
  try {
    const { data, error } = await supabase
      .from('missions')
      .select('*')

    if (error) {
      console.error('[fetchMissions]', error)
      return { success: false, error: mapSupabaseError(error) }
    }

    return { success: true, data: data ?? [] }
  } catch (err) {
    console.error('[fetchMissions] unexpected', err)
    return { success: false, error: ERROR_MESSAGES.unknown }
  }
}

// Type Result standardisé
type Result<T> = { success: true; data: T } | { success: false; error: string }
```

## Mapper les erreurs Supabase
```typescript
function mapSupabaseError(error: { code?: string; message?: string }): string {
  const map: Record<string, string> = {
    '23505': 'Cet élément existe déjà',
    '42501': 'Vous n\'avez pas les droits pour cette action',
    'PGRST301': 'Donnée introuvable',
    'invalid_credentials': ERROR_MESSAGES.auth_invalid_credentials,
    'user_already_exists': ERROR_MESSAGES.auth_email_taken,
  }
  return map[error.code ?? ''] ?? ERROR_MESSAGES.unknown
}
```

## Toast notifications
```typescript
// hooks/useToast.ts — utiliser react-native-toast-message
import Toast from 'react-native-toast-message'

export function showSuccess(message: string) {
  Toast.show({ type: 'success', text1: message, visibilityTime: 3000 })
}

export function showError(message: string) {
  Toast.show({ type: 'error', text1: 'Erreur', text2: message, visibilityTime: 4000 })
}

// Usage :
const result = await createMission(data)
if (result.success) showSuccess('Mission créée !')
else showError(result.error)
```

## Validation de formulaires
```typescript
// Utiliser zod pour la validation
import { z } from 'zod'

export const missionSchema = z.object({
  title: z.string().min(3, 'Le titre doit faire au moins 3 caractères'),
  service_type: z.enum(['menage', 'plomberie', 'electricite', 'jardinage', 'maintenance', 'autre']),
  date_needed: z.string().refine(d => new Date(d) > new Date(), {
    message: 'La date doit être dans le futur',
  }),
  description: z.string().optional(),
  proposed_price: z.number().min(1, 'Indiquez un prix').optional(),
})
```

## Règles
- JAMAIS afficher un message d'erreur technique à l'utilisateur (pas de "PGRST301")
- Toujours un message humain, en français, avec une action possible
- Logger les erreurs techniques dans la console pour le debug
- Chaque formulaire a sa validation zod avec messages en français
- Les erreurs réseau montrent la bannière offline, pas un toast
