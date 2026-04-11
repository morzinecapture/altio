/**
 * Encrypted AsyncStorage wrapper.
 * Uses expo-crypto for encryption and expo-secure-store for the encryption key.
 * Falls back to plain AsyncStorage if native modules are unavailable (Expo Go).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  // expo-secure-store not available (Expo Go)
}

const KEY_ALIAS = 'altio_storage_key';

let cachedKey: string | null = null;

/** Get or create a 256-bit hex key stored in SecureStore */
async function getEncryptionKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  if (!SecureStore) return null;

  try {
    let key = await SecureStore.getItemAsync(KEY_ALIAS);
    if (!key) {
      key = Crypto.randomUUID() + Crypto.randomUUID();
      await SecureStore.setItemAsync(KEY_ALIAS, key);
    }
    cachedKey = key;
    return key;
  } catch {
    return null;
  }
}

/** Simple XOR-based obfuscation using a derived key. Not AES, but raises the bar vs plaintext. */
function xorCipher(data: string, key: string): string {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    result.push(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  // Encode as base64 via hex pairs
  return result.map(c => c.toString(16).padStart(2, '0')).join('');
}

function xorDecipher(hex: string, key: string): string {
  const result: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substring(i, i + 2), 16) ^ key.charCodeAt((i / 2) % key.length);
    result.push(String.fromCharCode(charCode));
  }
  return result.join('');
}

/** Store a value with encryption (falls back to plain storage if crypto unavailable) */
export async function setSecureItem(storageKey: string, value: string): Promise<void> {
  const encKey = await getEncryptionKey();
  if (encKey) {
    const encrypted = xorCipher(value, encKey);
    await AsyncStorage.setItem(storageKey, `enc:${encrypted}`);
  } else {
    await AsyncStorage.setItem(storageKey, value);
  }
}

/** Retrieve and decrypt a value */
export async function getSecureItem(storageKey: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return null;

  if (raw.startsWith('enc:')) {
    const encKey = await getEncryptionKey();
    if (!encKey) return null; // Can't decrypt without key
    return xorDecipher(raw.slice(4), encKey);
  }
  // Plain text (legacy or no encryption available) — return as-is
  return raw;
}

/** Remove a secure item */
export async function removeSecureItem(storageKey: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey);
}
