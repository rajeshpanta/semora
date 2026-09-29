type AccountIdentity = {
  identities?: { provider: string }[];
  app_metadata?: { provider?: string; providers?: string[] };
};

export type AccountVerificationProvider = 'apple' | 'google' | 'email';

/**
 * Prefer a linked OAuth identity over email for destructive-action verification.
 * An email identity does not prove that the person knows a Semora password
 * (accounts can have linked identities). Apple/Google passwords must only be
 * entered into the provider's own authentication UI.
 */
export function accountVerificationProvider(
  user: AccountIdentity | null | undefined,
): AccountVerificationProvider | null {
  if (!user) return null;
  const identities = user.identities ?? [];
  // Identity rows are authoritative when present; metadata is a fallback for
  // sessions that omit them, not a reason to use a removed identity.
  const providers = identities.length
    ? identities.map((identity) => identity.provider)
    : [...(user.app_metadata?.providers ?? []), user.app_metadata?.provider];
  const preferred = user.app_metadata?.provider;
  if ((preferred === 'apple' || preferred === 'google') && providers.includes(preferred)) {
    return preferred;
  }
  if (providers.includes('apple')) return 'apple';
  if (providers.includes('google')) return 'google';
  return providers.includes('email') ? 'email' : null;
}
