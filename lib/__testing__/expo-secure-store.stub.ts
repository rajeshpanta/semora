/**
 * Scriptable SecureStore stand-in, for Deno tests only.
 *
 * The real module is an iOS keychain binding that only exists inside the Metro
 * bundle. This stand-in exists so lib/supabase.ts's chunked storage adapter —
 * the code that decides whether a stored session is readable — can be driven
 * through its failure branches without a device.
 *
 * Referenced only from lib/deno.test.json. Metro never sees this file.
 */

/** The fake keychain. Tests write straight into it to stage a torn write. */
export const items = new Map<string, string>();

/** Keys whose next read should throw, to stand in for a locked keychain. */
export const throwOnGet = new Set<string>();

export function __reset(): void {
  items.clear();
  throwOnGet.clear();
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (throwOnGet.has(key)) throw new Error('User interaction is not allowed.');
  return items.has(key) ? (items.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  items.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  items.delete(key);
}
