import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  classifyRequest,
  isAnonAuthorization,
  noteProtectedRequest,
  recordRefreshAttempt,
  recordStorageRead,
  recordStorageWriteFailure,
  type RequestKind,
} from '@/lib/authTelemetry';

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
  // The recordStorageRead calls below are OBSERVATION ONLY — every return value
  // and every branch is exactly what it was. They exist because this function
  // answers "is there a session?" for every request the app makes, and it
  // answers `null` for six different reasons that the server can never tell
  // apart. See lib/authTelemetry.ts.
  getItem: async (key: string): Promise<string | null> => {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head == null) {
        recordStorageRead('miss');
        return null;
      }
      if (!head.startsWith(CHUNK_MARKER)) {
        recordStorageRead('hit_single');
        return head; // legacy / small single value
      }
      const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
      if (!Number.isFinite(count) || count <= 0) {
        recordStorageRead('bad_manifest', Number.isFinite(count) ? count : null, null);
        return null;
      }
      let out = '';
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.chunk.${i}`);
        if (part == null) {
          // incomplete write — treat as no session. `i` is how many chunks were
          // readable before the gap, which distinguishes a torn write from a
          // keychain that went away mid-read.
          recordStorageRead('partial', count, i);
          return null;
        }
        out += part;
      }
      recordStorageRead('hit_chunked', count, count);
      return out;
    } catch {
      recordStorageRead('error');
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
    } catch {
      // Still swallowed — changing that is the fix, not the instrumentation.
      // But a write that failed after clearSecureChunks and before the manifest
      // commit is exactly how a session becomes present-but-unreadable, so the
      // failure is at least counted now instead of vanishing.
      recordStorageWriteFailure();
    }
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

/** Read the outgoing Authorization header without retaining it. */
function authorizationOf(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  // fetchWithAuth always hands us a Headers instance; the rest is belt and braces.
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get('Authorization');
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([name]) => String(name).toLowerCase() === 'authorization');
    return found ? found[1] : null;
  }
  const record = headers as Record<string, string>;
  return record.Authorization ?? record.authorization ?? null;
}

/**
 * A pass-through fetch that answers one question: did this request carry a user?
 *
 * supabase-js sets Authorization to the anon key when it cannot produce a
 * session (SupabaseClient._getAccessToken), so by the time a request reaches
 * here the header already says whether the caller is somebody or nobody. This
 * is the only place in the app where that distinction is observable — the
 * server cannot report it, because "nobody" is a perfectly valid caller and
 * RLS answers it with an honest, quiet, empty result.
 *
 * Behaviour is unchanged in every case: the underlying fetch is always called
 * with the arguments it was given, its response is returned untouched, and its
 * rejections are rethrown. Every line of bookkeeping sits inside its own
 * try/catch so instrumentation can never become the reason a request fails.
 */
const instrumentedFetch: typeof fetch = async (input, init) => {
  let kind: RequestKind = 'other';
  let usedAnonKey = false;
  try {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : ((input as Request)?.url ?? '');
    kind = classifyRequest(url);
    if (kind === 'protected') {
      usedAnonKey = isAnonAuthorization(authorizationOf(init?.headers), supabaseAnonKey);
    }
  } catch {
    kind = 'other';
  }

  try {
    const response = await fetch(input, init);
    try {
      if (kind === 'protected') noteProtectedRequest(usedAnonKey);
      else if (kind === 'auth_token') recordRefreshAttempt(response.status);
    } catch {}
    return response;
  } catch (error) {
    try {
      // A refresh that never reached the edge leaves NO trace in server logs —
      // and "was a refresh even attempted?" is the field that separates an
      // unreadable session from an expired one. Count it here or lose it.
      if (kind === 'auth_token') recordRefreshAttempt(null);
    } catch {}
    throw error;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: { fetch: instrumentedFetch },
});
