---
name: supabase-realtime
description: Supabase Realtime pour Altio — mises à jour en temps réel des missions, statuts, messages. Utilise cette skill dès qu'on parle de temps réel, websocket, subscription, écouter les changements, notifications live, mise à jour instantanée, ou synchronisation entre propriétaire et prestataire.
---

# Supabase Realtime — Altio

## Cas d'usage temps réel dans Altio
1. **Mission broadcast** : un prestataire voit apparaître une nouvelle mission en live
2. **Changement de statut** : le propriétaire voit quand le prestataire accepte/commence/termine
3. **Messagerie** : messages instantanés entre propriétaire et prestataire
4. **Position prestataire** : suivi en temps réel (optionnel, phase future)

## Pattern de subscription
```typescript
// hooks/useMissionRealtime.ts
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

export function useMissionRealtime(missionId?: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel(`mission-${missionId ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions',
          ...(missionId ? { filter: `id=eq.${missionId}` } : {}),
        },
        (payload) => {
          // Invalider le cache React Query pour refresh
          queryClient.invalidateQueries({ queryKey: ['missions'] })
          if (missionId) {
            queryClient.invalidateQueries({ queryKey: ['mission', missionId] })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [missionId, queryClient])
}
```

## Messagerie temps réel
```typescript
// hooks/useMessages.ts
export function useMessagesRealtime(conversationId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Ajouter le message au cache sans refetch complet
          queryClient.setQueryData(
            ['messages', conversationId],
            (old: Message[] = []) => [...old, payload.new as Message]
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])
}
```

## Activer Realtime côté Supabase
```sql
-- Dans le SQL Editor de Supabase, activer la réplication pour les tables concernées
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_applications;
```

## Règles
- Toujours `removeChannel` dans le cleanup du useEffect
- Utiliser React Query `invalidateQueries` plutôt que du state local pour rester cohérent
- Filtrer côté subscription (pas côté client) pour réduire le trafic
- Les policies RLS s'appliquent aussi au Realtime — pas besoin de filtre supplémentaire
- Limiter le nombre de channels actifs (1 par écran visible max)
- Ne pas écouter les tables volumineuses sans filtre (`filter: ...`)
