import { useEffect, useState } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  isInternetReachable: boolean;
}

/**
 * Synchronous observable for network status.
 * Other code can check `networkStatus$.current` without hooks.
 */
export const networkStatus$ = {
  current: {
    isOnline: true,
    isInternetReachable: true,
  } as NetworkStatus,
};

// Try to load NetInfo — may not be available in Expo Go
let NetInfoModule: any = null;
try {
  NetInfoModule = require('@react-native-community/netinfo').default;
} catch {
  // Native module not available
}

function deriveStatus(state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): NetworkStatus {
  return {
    isOnline: !!state.isConnected,
    isInternetReachable: state.isInternetReachable ?? !!state.isConnected,
  };
}

// Global listener — starts once on import, keeps networkStatus$ in sync
let listenerActive = false;
function ensureGlobalListener() {
  if (listenerActive || !NetInfoModule) return;
  listenerActive = true;
  NetInfoModule.addEventListener((state: any) => {
    networkStatus$.current = deriveStatus(state);
  });
}
ensureGlobalListener();

/**
 * React hook that tracks online/offline status via NetInfo.
 * Returns `{ isOnline, isInternetReachable }`.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(networkStatus$.current);

  useEffect(() => {
    if (!NetInfoModule) return;
    const unsubscribe = NetInfoModule.addEventListener((state: any) => {
      const next = deriveStatus(state);
      networkStatus$.current = next;
      setStatus(next);
    });
    return () => unsubscribe();
  }, []);

  return status;
}
