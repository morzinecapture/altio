import 'react-native-url-polyfill/auto'
import 'react-native-get-random-values'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import * as ExpoCrypto from 'expo-crypto'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Dynamic require: expo-secure-store crashes at import time in Expo Go (no native module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SecureStore: any = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  console.warn('expo-secure-store not available, using AsyncStorage fallback (dev mode)');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

// Polyfill crypto.subtle.digest for supabase-js PKCE (SHA256) in Hermes/React Native
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as Record<string, any>
  if (!g.crypto) g.crypto = {}
  if (!g.crypto.subtle) g.crypto.subtle = {}
  g.crypto.subtle.digest = async (_algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> => {
    const bytes = new Uint8Array(data)
    // expo-crypto works on strings; encode bytes as binary string then hash
    let binary = ''
    bytes.forEach((b) => (binary += String.fromCharCode(b)))
    const hex = await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      binary,
      { encoding: ExpoCrypto.CryptoEncoding.HEX }
    )
    const result = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    return result.buffer
  }
}

// Storage adapter: SecureStore if available, AsyncStorage fallback
const createStorageAdapter = () => {
  if (SecureStore !== null) {
    return {
      getItem: async (key: string) => {
        try {
          return await SecureStore.getItemAsync(key);
        } catch {
          return await AsyncStorage.getItem(key);
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          await SecureStore.setItemAsync(key, value);
        } catch {
          await AsyncStorage.setItem(key, value);
        }
      },
      removeItem: async (key: string) => {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch {
          await AsyncStorage.removeItem(key);
        }
      },
    };
  }

  return {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
  };
};

const NativeStorageAdapter = createStorageAdapter();

// Simple Custom Storage that implements getItem, setItem, removeItem
// Avoiding window is not defined during SSR
const WebStorage = {
  getItem: (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return Promise.resolve();
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    if (typeof window === 'undefined') return Promise.resolve();
    window.localStorage.removeItem(key);
    return Promise.resolve();
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorage : NativeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: Platform.OS === 'web' ? 'pkce' : 'implicit',
  },
})
