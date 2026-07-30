import { supabase } from '@/lib/supabase';

// The server-side half of Pro entitlement — deliberately free of any
// StoreKit / react-native-iap import so it can be shared by the native
// purchases module AND the web shim (purchases.web.ts). react-native-iap
// pulls in react-native-nitro-modules, which deep-imports react-native
// internals and hard-crashes a web bundle, so nothing web-reachable may
// touch it. See lib/purchases.web.ts.

export interface ProEntitlement {
  is_pro: boolean;
  plan: 'monthly' | 'annual' | null;
  expires_at: string | null;
  /**
   * Reason a restore/validation didn't activate Pro for this account,
   * even though the device receipt is valid. Set by validateProEntitlement
   * when the edge function returns 409 (subscription bound to another
   * Semora account, or to a deleted account). Callers that surface UI
   * (e.g. the Restore button) should check this and show a specific
   * message instead of a generic "no subscription found".
   */
  restoreError?: 'linked_other_account' | null;
  /**
   * True when this result reflects a TRANSIENT failure (network down,
   * server 5xx) rather than a real "not subscribed" answer. Callers that
   * persist Pro state must skip the write when this is set — otherwise a
   * blip would visibly downgrade a paying user until the next refresh.
   */
  transient?: boolean;
  /**
   * Internal: true when this answer came from actually validating a
   * credential (JWS or receipt) with the server — false/absent when we
   * had nothing to validate and just read the DB row. Lets
   * validateAfterPurchase skip its rescue pass when the first pass
   * already searched (and possibly prompted) and found no credential.
   */
  usedCredential?: boolean;
}

export const EMPTY_ENTITLEMENT: ProEntitlement = {
  is_pro: false,
  plan: null,
  expires_at: null,
};

/**
 * Read the server-validated entitlement for the current user.
 * This is the single source of truth — `isPro` should always
 * reflect what's in this row, never what local StoreKit reports.
 *
 * Returns an inactive entitlement if no row exists or the user
 * isn't signed in. Never throws.
 */
export async function getServerEntitlement(): Promise<ProEntitlement> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return EMPTY_ENTITLEMENT;

    const { data, error } = await supabase
      .from('entitlements')
      .select('is_pro, plan, expires_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // Query error = we don't KNOW the answer — mark transient so callers
    // don't write a false downgrade. A missing row is a genuine "not pro".
    if (error) return { ...EMPTY_ENTITLEMENT, transient: true };
    if (!data) return EMPTY_ENTITLEMENT;

    // Honor expiry on the client too — if the row says active but the
    // date is past, treat as inactive for DISPLAY. Mark it transient:
    // the row may simply be stale (Apple auto-renewed but nothing has
    // re-validated since), and the client clock isn't authoritative —
    // writing a hard downgrade here visibly de-Pro'd paying subscribers
    // mid-session at every billing boundary. The heavy path (full
    // receipt re-validation) is the only one allowed to say "expired".
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
    const clockSaysExpired = data.is_pro && expiresAt !== null && expiresAt <= Date.now();

    return {
      is_pro: data.is_pro && !clockSaysExpired,
      plan: (data.plan as 'monthly' | 'annual' | null) ?? null,
      expires_at: data.expires_at,
      ...(clockSaysExpired ? { transient: true } : {}),
    };
  } catch {
    return { ...EMPTY_ENTITLEMENT, transient: true };
  }
}
