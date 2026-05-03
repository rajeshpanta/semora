import type { User } from '@supabase/supabase-js';

const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

/**
 * True if this user signed up with email/password (i.e. has an `email`
 * identity row in auth.identities). OAuth-only users return false.
 *
 * Used to gate password-related UI — Change Password, password-prompt
 * verification on Delete Account, etc. — that doesn't apply to users
 * who only authenticate via Apple/Google.
 */
export function hasEmailPassword(user: User | null | undefined): boolean {
  if (!user) return false;
  const identities = user.identities ?? [];
  if (identities.length > 0) {
    return identities.some((i) => i.provider === 'email');
  }
  const meta = user.app_metadata ?? {};
  const providers: string[] = Array.isArray(meta.providers)
    ? meta.providers
    : meta.provider
      ? [meta.provider]
      : [];
  return providers.includes('email');
}

/**
 * The provider the user most recently authenticated with, e.g. 'email',
 * 'apple', 'google'. Used by Delete Account to know which OAuth sheet
 * to re-prompt for verification.
 */
export function primaryProvider(user: User | null | undefined): string | null {
  if (!user) return null;
  return user.app_metadata?.provider ?? null;
}

/**
 * Friendly display name for a user. Prefers any name we captured at
 * sign-up time (Apple's FULL_NAME scope, Google's profile), falls back
 * to the email's local part — except for Apple "Hide My Email" relay
 * addresses, where the local part is a meaningless 16-char hex string.
 *
 * `fallback` is the last-resort string if nothing usable is available.
 */
export function displayName(user: User | null | undefined, fallback = 'Friend'): string {
  if (!user) return fallback;
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
    return meta.full_name.trim();
  }
  if (typeof meta.name === 'string' && meta.name.trim()) {
    return meta.name.trim();
  }
  const given = typeof meta.given_name === 'string' ? meta.given_name.trim() : '';
  const family = typeof meta.family_name === 'string' ? meta.family_name.trim() : '';
  if (given || family) {
    return [given, family].filter(Boolean).join(' ');
  }
  const email = user.email ?? '';
  if (email && !email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)) {
    const local = email.split('@')[0];
    if (local) return local;
  }
  return fallback;
}
