import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  classifyRequest,
  describeStorageError,
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
// ── Why the session moved to a second set of keys ───────────────────────────
//
// expo-secure-store writes with kSecAttrAccessibleWhenUnlocked by default
// (SecureStoreOptions.swift: `var keychainAccessible: SecureStoreAccessible =
// .whenUnlocked`). iOS answers a read of such an item on a LOCKED device with
// errSecInteractionNotAllowed, -25308. supabase-js does not fail there — it
// substitutes the anon key (`data.session?.access_token ?? this.supabaseKey`)
// — so RLS answers honestly for nobody, every list returns 200 [], nothing
// throws, and the app keeps drawing a signed-in shell over an empty database.
//
// Measured over 7 days: 20 of 138 active devices hit it, 8 went fully
// anonymous, 7 were still hitting it days later. It compounds, because
// refreshing a token means reading and writing this same item: a phone that
// cannot read cannot refresh, so the token expires and stays expired. Two
// devices were carrying tokens dead for exactly 24 hours.
//
// AFTER_FIRST_UNLOCK fixes it: unreadable until the phone has been unlocked
// once after a reboot, readable while locked from then on.
//
// It cannot be applied in place. The native set() calls SecItemAdd, gets
// errSecDuplicateItem for an existing key, and falls through to update(),
// which writes kSecValueData ONLY and leaves kSecAttrAccessible untouched
// (SecureStoreModule.swift). Every phone already holding a session would keep
// the old attribute for ever.
//
// So writes go to keys that have never existed, where SecItemAdd is a genuine
// add and the attribute applies. Reads prefer those and fall back to the old
// ones, and the old copy is deleted only after the new one has been read back
// intact. There is no instant at which the device holds zero sessions, which is
// the property that makes this safe to ship to people already signed in.
const V2 = (key: string) => `${key}.v2`;
const LOCKED_READABLE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function clearSecureChunks(key: string, options?: SecureStore.SecureStoreOptions): Promise<void> {
  try {
    const head = await SecureStore.getItemAsync(key);
    if (!head || !head.startsWith(CHUNK_MARKER)) return;
    const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
    if (!Number.isFinite(count)) return;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}.chunk.${i}`, options).catch(() => {});
    }
  } catch {}
}

/**
 * Reassemble a value from one namespace.
 *
 * Four outcomes, not two, and collapsing them is a real bug: "nothing is
 * stored here" must fall through to the older namespace, while "something is
 * stored here and it is torn" must NOT — that one has to be reported as the
 * partial read it is. Returning null for both made a torn session look like a
 * signed-out one, which is the single most misleading answer this function can
 * give. A throw is left to the caller; only it knows the keychain refused.
 */
type NamespaceRead =
  | { kind: 'miss' }
  | { kind: 'value'; value: string; chunks: number | null }
  | { kind: 'partial'; expected: number; found: number }
  | { kind: 'bad_manifest'; expected: number | null };

async function readNamespace(base: string): Promise<NamespaceRead> {
  const head = await SecureStore.getItemAsync(base);
  if (head == null) return { kind: 'miss' };
  if (!head.startsWith(CHUNK_MARKER)) return { kind: 'value', value: head, chunks: null };
  const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
  if (!Number.isFinite(count) || count <= 0) {
    return { kind: 'bad_manifest', expected: Number.isFinite(count) ? count : null };
  }
  let out = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${base}.chunk.${i}`);
    if (part == null) return { kind: 'partial', expected: count, found: i };
    out += part;
  }
  return { kind: 'value', value: out, chunks: count };
}

/** Delete the pre-migration copy. Called ONLY after the new copy has been read
 *  back and matched, so a failure here leaves a device with two good copies
 *  rather than none. Best effort by design: a leftover old key is harmless,
 *  because reads prefer the new namespace. */
async function retireLegacy(key: string): Promise<void> {
  try {
    await clearSecureChunks(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  } catch {}
}

const secureStorage = {
  // The recordStorageRead calls below are OBSERVATION ONLY — every return value
  // and every branch is exactly what it was. They exist because this function
  // answers "is there a session?" for every request the app makes, and it
  // answers `null` for six different reasons that the server can never tell
  // apart. See lib/authTelemetry.ts.
  getItem: async (key: string): Promise<string | null> => {
    // New namespace first. A device that has migrated never touches the legacy
    // keys again; one that has not reads exactly what it read before.
    //
    // A REFUSAL here returns immediately rather than falling through. The
    // legacy keys sit behind the stricter attribute, so a locked device would
    // refuse those too, and the outcome would be misreported as a miss — which
    // is the one answer that makes a signed-in student look signed out.
    try {
      const fresh = await readNamespace(V2(key));
      if (fresh.kind === 'value') {
        recordStorageRead(fresh.chunks == null ? 'hit_single' : 'hit_chunked', fresh.chunks, fresh.chunks);
        return fresh.value;
      }
      // Present but broken. Reporting this as a miss, or falling through to the
      // older keys, would hide the one state that looks identical to being
      // signed out and is not.
      if (fresh.kind === 'partial') {
        recordStorageRead('partial', fresh.expected, fresh.found);
        return null;
      }
      if (fresh.kind === 'bad_manifest') {
        recordStorageRead('bad_manifest', fresh.expected, null);
        return null;
      }
      // kind === 'miss' — genuinely nothing here, so try the older namespace.
    } catch (err) {
      recordStorageRead('error', null, null, describeStorageError(err));
      return null;
    }
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
    } catch (err) {
      // The throw itself was the one thing this path never kept. `outcome:
      // 'error'` proved the store refused and could not say why, which on
      // 2026-09-02 left a 5m40s unauthenticated window — session intact, token
      // unexpired, zero refresh attempts — diagnosed only by inference.
      //
      // describeStorageError keeps a code and any OSStatus and nothing else;
      // the message never travels, because a keychain error can name the key it
      // was reading and these keys are named after the auth token.
      recordStorageRead('error', null, null, describeStorageError(err));
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Writes go to the NEW namespace only. Those keys have never existed, so
      // SecItemAdd is a genuine add and kSecAttrAccessible is honoured. Writing
      // to the old ones would hit the update() path, which changes the value and
      // leaves the attribute alone — the whole reason this migration exists.
      const base = V2(key);
      await clearSecureChunks(base, LOCKED_READABLE);
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(base, value, LOCKED_READABLE);
      } else {
        const count = Math.ceil(value.length / CHUNK_SIZE);
        for (let i = 0; i < count; i++) {
          await SecureStore.setItemAsync(`${base}.chunk.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), LOCKED_READABLE);
        }
        await SecureStore.setItemAsync(base, `${CHUNK_MARKER}${count}`, LOCKED_READABLE);
      }

      // Read it back before retiring the old copy. Until this line succeeds the
      // legacy session is still on the device and getItem still falls back to
      // it, so there is no instant at which a signed-in student has no session.
      // If the check fails we keep BOTH and try again on the next write.
      const check = await readNamespace(base);
      if (check.kind === 'value' && check.value === value) await retireLegacy(key);
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
      // Sign-out must clear BOTH namespaces. Leaving either behind would let a
      // stale session reappear on the next launch, which is worse than the bug
      // this change is fixing.
      await clearSecureChunks(V2(key), LOCKED_READABLE);
      await SecureStore.deleteItemAsync(V2(key), LOCKED_READABLE).catch(() => {});
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
