/**
 * A keychain that behaves like iOS in the two ways this codebase depends on.
 *
 * 1. ACCESSIBILITY IS SET ONCE. The native module calls SecItemAdd, and on
 *    errSecDuplicateItem falls through to update(), which writes kSecValueData
 *    only. So an existing item KEEPS the attribute it was created with, no
 *    matter what options a later write passes. That single fact is why the
 *    session had to move to new keys rather than just gain an option, and a
 *    stub that let the attribute change would have let the wrong fix pass.
 *
 * 2. A LOCKED DEVICE REFUSES WHEN_UNLOCKED ITEMS. `lock()` makes exactly those
 *    reads throw the message iOS produces for errSecInteractionNotAllowed,
 *    which is what the app sees in production.
 */
export const items = new Map<string, string>();
/** Attribute each key was CREATED with. Never changed by a later write. */
export const accessibility = new Map<string, string>();
export const throwOnGet = new Set<string>();

export const WHEN_UNLOCKED = 'whenUnlocked';
export const AFTER_FIRST_UNLOCK = 'afterFirstUnlock';

let locked = false;
export function lock(): void { locked = true; }
export function unlock(): void { locked = false; }

export function __reset(): void {
  items.clear();
  accessibility.clear();
  throwOnGet.clear();
  locked = false;
}

type Options = { keychainAccessible?: string } | undefined;

export async function getItemAsync(key: string): Promise<string | null> {
  if (throwOnGet.has(key)) throw new Error('User interaction is not allowed.');
  if (locked && accessibility.get(key) !== AFTER_FIRST_UNLOCK && items.has(key)) {
    // errSecInteractionNotAllowed, -25308, in the prose the native module uses.
    throw new Error('User interaction is not allowed.');
  }
  return items.has(key) ? (items.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string, options?: Options): Promise<void> {
  if (!items.has(key)) {
    // A genuine SecItemAdd: this is the only moment the attribute is decided.
    accessibility.set(key, options?.keychainAccessible ?? WHEN_UNLOCKED);
  }
  items.set(key, value);
}

export async function deleteItemAsync(key: string, _options?: Options): Promise<void> {
  items.delete(key);
  accessibility.delete(key);
}
