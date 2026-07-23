import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface StoredLmsCredential {
  accessToken: string;
  accountLabel?: string | null;
}

const CREDENTIAL_PREFIX = 'semora.lms.credential.';

function credentialKey(connectionId: string) {
  return `${CREDENTIAL_PREFIX}${connectionId}`;
}

export async function storeLmsCredential(
  connectionId: string,
  credential: StoredLmsCredential,
) {
  const value = JSON.stringify(credential);
  if (Platform.OS === 'web') {
    localStorage.setItem(credentialKey(connectionId), value);
    return;
  }
  await SecureStore.setItemAsync(credentialKey(connectionId), value);
}

export async function readLmsCredential(
  connectionId: string,
): Promise<StoredLmsCredential | null> {
  try {
    const raw = Platform.OS === 'web'
      ? localStorage.getItem(credentialKey(connectionId))
      : await SecureStore.getItemAsync(credentialKey(connectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.accessToken === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function removeLmsCredential(connectionId: string) {
  try {
    if (Platform.OS === 'web') localStorage.removeItem(credentialKey(connectionId));
    else await SecureStore.deleteItemAsync(credentialKey(connectionId));
  } catch {}
}

export async function removeLmsCredentials(connectionIds: string[]) {
  await Promise.all(connectionIds.map(removeLmsCredential));
}
