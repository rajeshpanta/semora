import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const QUERY_CACHE_KEY = 'semora.query-cache.v1';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1_000,
});

export async function clearPersistedQueryCache() {
  await queryPersister.removeClient();
}
