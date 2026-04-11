import { QueryClient, onlineManager } from '@tanstack/react-query';
import { processQueue } from './services/offline-queue';

// Sync React Query's online manager with NetInfo (guarded for Expo Go compatibility)
try {
  const NetInfo = require('@react-native-community/netinfo').default;
  onlineManager.setEventListener((setOnline: (online: boolean) => void) => {
    return NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
      const isOnline = !!state.isConnected;
      setOnline(isOnline);

      // When coming back online, replay queued offline mutations
      if (isOnline) {
        processQueue();
      }
    });
  });
} catch {
  // NetInfo native module not available (e.g. Expo Go) — skip offline sync
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute — balance freshness vs offline-friendliness
      gcTime: 1000 * 60 * 30, // 30 minutes — keep cache longer for offline access
      retry: 1,
      refetchOnWindowFocus: false, // not relevant on mobile
      refetchOnMount: 'always', // refetch when navigating back to a screen
    },
  },
});
