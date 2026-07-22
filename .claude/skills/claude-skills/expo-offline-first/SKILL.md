---
name: expo-offline-first
description: Stratégie offline-first pour Altio — cache, sync, gestion de la connectivité en zone montagne. Utilise cette skill dès qu'on parle de mode hors-ligne, cache, synchronisation, connectivité, réseau, NetInfo, file d'attente, ou quand on traite un cas d'usage en zone de mauvaise couverture réseau.
---

# Offline First — Altio

## Pourquoi c'est critique pour Altio
Les prestataires interviennent dans des chalets en montagne, souvent avec une couverture réseau faible ou inexistante. L'app doit fonctionner en mode dégradé.

## Stratégie par fonctionnalité

| Fonctionnalité | Offline | Stratégie |
|---|---|---|
| Liste des missions assignées | ✅ | Cache React Query + AsyncStorage |
| Détail d'une mission | ✅ | Cache React Query |
| Marquer "en cours" | ✅ | Queue offline, sync au retour |
| Prendre des photos | ✅ | Stockage local, upload différé |
| Marquer "terminé" | ✅ | Queue offline, sync au retour |
| Messagerie | ❌ | Nécessite connexion |
| Candidater à une mission | ❌ | Nécessite connexion |
| Paiements | ❌ | Nécessite connexion |

## Détection de connectivité
```typescript
// hooks/useNetworkStatus.ts
import NetInfo from '@react-native-community/netinfo'
import { useEffect, useState } from 'react'

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false)
    })
    return () => unsubscribe()
  }, [])

  return { isConnected }
}
```

## File d'attente offline
```typescript
// services/offline-queue.ts
import AsyncStorage from '@react-native-async-storage/async-storage'

interface QueuedAction {
  id: string
  type: 'update_mission_status' | 'upload_photo' | 'add_note'
  payload: Record<string, unknown>
  created_at: string
}

const QUEUE_KEY = 'altio_offline_queue'

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'created_at'>) {
  const queue = await getQueue()
  queue.push({
    ...action,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  })
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export async function processQueue() {
  const queue = await getQueue()
  const failed: QueuedAction[] = []

  for (const action of queue) {
    try {
      await executeAction(action)
    } catch {
      failed.push(action) // Retenter plus tard
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed))
}

// Appeler processQueue quand le réseau revient
```

## Bannière de connectivité
```tsx
// components/ui/OfflineBanner.tsx
export function OfflineBanner() {
  const { isConnected } = useNetworkStatus()
  if (isConnected) return null

  return (
    <View className="bg-amber-500 px-4 py-2">
      <Text className="text-white text-center text-sm font-medium">
        Mode hors-ligne — Les modifications seront synchronisées
      </Text>
    </View>
  )
}
// Ajouter dans le root layout, au-dessus du contenu
```

## Règles
- Toujours afficher un indicateur visuel quand l'app est offline
- Les actions offline sont exécutées dans l'ordre FIFO au retour du réseau
- Les photos prises offline sont stockées localement et uploadées après
- Ne jamais bloquer l'UI à cause du réseau — toujours optimistic update
- React Query `staleTime: 5 * 60 * 1000` pour les données de mission (5 min)
- Précharger les missions assignées au prestataire pour accès offline
