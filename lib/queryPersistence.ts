import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

export const QUERY_CACHE_KEY = 'semora.query-cache.v1';

/**
 * Query keys whose data must never be written to disk.
 *
 * The persister mirrors the whole react-query cache into AsyncStorage — which
 * on iOS is an unencrypted SQLite file inside the app container — and keeps it
 * for seven days so the app opens with content offline. That is the right
 * trade for deadlines and course names.
 *
 * It is the wrong trade for lecture transcripts. A transcript is a verbatim
 * record of a room full of people who never used this app, it is the most
 * sensitive thing Semora holds, and the server already deletes the audio it
 * came from as soon as the text exists. Caching it to disk for a week would
 * quietly undo that. Lectures are small and load fast online; there is no
 * offline story worth this.
 */
const NEVER_PERSIST_PREFIXES = ['lecture'];

export function shouldPersistQuery(query: Query): boolean {
  // Compose with the library default — do NOT replace it. The default is
  // `status === 'success'`, so returning a bare `true` here would start
  // persisting pending and errored queries for the WHOLE app, and rehydrate
  // them next launch as though they were real cached data. This filter is only
  // supposed to subtract lectures, never to widen what gets written to disk.
  if (!defaultShouldDehydrateQuery(query)) return false;

  const first = query.queryKey?.[0];
  if (typeof first !== 'string') return true;
  const key = first.toLowerCase();
  return !NEVER_PERSIST_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1_000,
});

export async function clearPersistedQueryCache() {
  await queryPersister.removeClient();
}
