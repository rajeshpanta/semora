import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    'Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
}

// iOS SecureStore items have a ~2048-byte soft limit. A Supabase session
// (access JWT + refresh token + user metadata) can exceed it, and the OS then
// warns it "may not be stored successfully" — which can silently drop the
// session and log the user out. So on native we transparently CHUNK large
// values across multiple SecureStore keys and reassemble them on read. Small
// values are still stored under a single key, so sessions written by older
// builds keep working and migrate seamlessly on the next write.
const CHUNK_SIZE = 1500; // chars per item — comfortably under the 2048-byte limit
const CHUNK_MARKER = '__sbchunk__'; // base-key sentinel meaning "split into N parts"

async function clearSecureChunks(key: string): Promise<void> {
  try {
    const head = await SecureStore.getItemAsync(key);
    if (!head || !head.startsWith(CHUNK_MARKER)) return;
    const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
    if (!Number.isFinite(count)) return;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}.chunk.${i}`).catch(() => {});
    }
  } catch {}
}

const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head == null) return null;
      if (!head.startsWith(CHUNK_MARKER)) return head; // legacy / small single value
      const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
      if (!Number.isFinite(count) || count <= 0) return null;
      let out = '';
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.chunk.${i}`);
        if (part == null) return null; // incomplete write — treat as no session
        out += part;
      }
      return out;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Clear chunks from any previous (possibly larger) write first, so we
      // never leave stale tail chunks behind.
      await clearSecureChunks(key);
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value); // single key, legacy-compatible
        return;
      }
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(`${key}.chunk.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`); // base key holds the manifest
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await clearSecureChunks(key);
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

// SecureStore is not available on web — fall back to localStorage.
const storage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) => {
          try {
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key: string, value: string) => {
          try {
            localStorage.setItem(key, value);
          } catch {}
        },
        removeItem: (key: string) => {
          try {
            localStorage.removeItem(key);
          } catch {}
        },
      }
    : secureStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
