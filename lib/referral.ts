import { getDeviceItem, setDeviceItem, deleteDeviceItem } from '@/lib/deviceStore';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { refreshProStatus } from '@/lib/purchases';
import { MARKETING_URL } from '@/lib/constants';

// ── Referral system ─────────────────────────────────────────
//
// Free Pro month for BOTH sides. A user shares https://semoraai.com/invite/<code>
// (a landing page that hands off to semora://invite?code=<code>);
// a friend opens it, and on redemption the referrer and the friend each get a
// 30-day promo grant. Server-side (redeem-referral + migration 028) owns all
// the guards and the grants; this module is the thin client:
//
//   getMyCode()             — fetch-or-create the caller's referral code
//   getRedemptionCount()    — "N friends joined" for the Me tab
//   redeem(code)            — call the edge function to redeem a code
//   stashPendingReferral()  — save a code before auth (invite.tsx, signed out)
//   applyPendingReferral()  — redeem a stashed code after signup
//   syncPromoPro()          — reflect promo Pro locally (entitlements read misses it)
//
// ENTITLEMENT NOTE: the app's `isPro` derives from the `entitlements` table
// (lib/purchases.getServerEntitlement), which by design never carries a promo
// grant — validate-receipt would clobber it. So after a successful redemption
// we read promo_grants directly and OR it into the local store, matching what
// the DB is_pro() already does server-side. This keeps a referral's free month
// visible in the UI without ever writing a promo to entitlements.

// Device-store key for a code stashed while the user is signed out (a friend
// who tapped an invite link before creating an account). Applied post-signup.
const PENDING_REFERRAL_KEY = 'semora_pending_referral_code';

// A device-local guard so applyPendingReferral() (called on every Me-tab
// mount and from invite.tsx) never fires a redundant redeem after it has
// already succeeded/exhausted the stashed code. The server is the real
// idempotency authority (a user can be referred only once), but this avoids
// pointless round-trips.
const REFERRAL_APPLIED_KEY = 'semora_referral_applied';

// Unguessable code: not derivable from the user_id (which would let anyone
// forge a "friend's" code from a known account). ~11 chars of crockford-ish
// base32 (no 0/1/o/i/l to avoid transcription confusion) ≈ 55 bits of entropy.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function generateCode(): string {
  let out = '';
  for (let i = 0; i < 11; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/**
 * Fetch the caller's referral code, creating it lazily on first call. Returns
 * null only if the user isn't signed in or the DB is unreachable.
 *
 * Create-then-read races (two devices, or a double mount) are resolved by the
 * unique pk on referral_codes: an insert conflict just means the row already
 * exists, so we re-read it.
 */
export async function getMyCode(): Promise<string | null> {
  try {
    const userId = await getUserId();
    if (!userId) return null;

    const { data: existing, error: readErr } = await supabase
      .from('referral_codes')
      .select('code')
      .eq('user_id', userId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (existing?.code) return existing.code;

    // No code yet — create one. Retry a couple of times on the (astronomically
    // unlikely) code-uniqueness collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      const { error: insertErr } = await supabase
        .from('referral_codes')
        .insert({ user_id: userId, code });
      if (!insertErr) return code;

      // Someone else created OUR row first (pk conflict), or a rare code
      // collision (unique on code). Re-read: if our row now exists, use it.
      const { data: row } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', userId)
        .maybeSingle();
      if (row?.code) return row.code;
      // Otherwise it was a code collision — loop and try a fresh code.
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the shareable invite link for a code.
 *
 * This is an https page on the marketing site rather than a bare
 * `semora://invite?code=...`. The custom scheme only resolves on a device that
 * already has Semora installed — i.e. never for the friend an invite is meant
 * to reach — and pastes into a group chat as dead grey text with no preview.
 * The landing page explains the offer, previews properly, and hands off to the
 * scheme (still routed to app/invite.tsx) for recipients who do have the app.
 */
export function inviteLink(code: string): string {
  return `${MARKETING_URL}/invite/${encodeURIComponent(code)}`;
}

/**
 * How many friends have joined via the caller's code ("N friends joined").
 * Counts referral_redemptions where the caller is the referrer (RLS-scoped).
 */
export async function getRedemptionCount(): Promise<number> {
  try {
    const userId = await getUserId();
    if (!userId) return 0;
    const { count, error } = await supabase
      .from('referral_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export type RedeemStatus =
  | 'ok'
  | 'invalid_code'
  | 'self_referral'
  | 'already_redeemed'
  | 'referrer_capped'
  | 'error';

export interface RedeemResult {
  status: RedeemStatus;
  /** Human-readable message from the server (safe to surface in an Alert). */
  message?: string;
}

/**
 * Redeem a referral code for the signed-in user via the redeem-referral edge
 * function. On 'ok' both sides get a 30-day promo grant; we then refresh local
 * Pro state so the referred user sees Pro immediately (see syncPromoPro).
 *
 * Never throws — returns a typed status the caller branches on.
 */
export async function redeem(code: string): Promise<RedeemResult> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return { status: 'invalid_code', message: 'A referral code is required.' };

  try {
    const { data, error } = await supabase.functions.invoke('redeem-referral', {
      body: { code: trimmed },
    });

    if (error) {
      // supabase-js wraps non-2xx as a FunctionsHttpError; the JSON body (with
      // our `status`) rides on error.context. Try to recover it so the caller
      // gets the specific decline reason, not a generic error.
      const parsed = await parseFunctionError(error);
      if (parsed) return parsed;
      return { status: 'error', message: 'Something went wrong. Please try again.' };
    }

    const status = (data?.status as RedeemStatus) ?? 'error';
    if (status === 'ok') {
      // Reflect the fresh promo grant in the local store immediately.
      await syncPromoPro().catch(() => {});
    }
    return { status, message: data?.error };
  } catch {
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}

// Recover the JSON body from a supabase-js FunctionsHttpError so a non-2xx
// decline (invalid_code / already_redeemed / etc.) still yields its typed
// status. Best-effort — returns null if the body can't be read.
async function parseFunctionError(error: any): Promise<RedeemResult | null> {
  try {
    const res: Response | undefined = error?.context;
    if (!res || typeof res.json !== 'function') return null;
    const body = await res.json();
    const status = body?.status as RedeemStatus | undefined;
    if (status) return { status, message: body?.error };
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the signed-in user has an active (unexpired) promo grant. Read
 * directly from promo_grants (owner-readable RLS) because the app's `isPro`
 * comes from the entitlements table, which never carries a promo — this is the
 * client mirror of is_pro()'s promo branch.
 */
export async function hasActivePromoGrant(): Promise<boolean> {
  try {
    const userId = await getUserId();
    if (!userId) return false;
    const { count, error } = await supabase
      .from('promo_grants')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Reflect promo Pro in the local store. If the user has an active promo grant
 * and isn't already Pro from a real subscription, flip isPro on so the free
 * month is visible immediately. We never turn isPro OFF here — a lapsed promo
 * is reconciled by the normal entitlement refresh path (which is authoritative
 * for purchased Pro), and stripping Pro on a transient read would flicker a
 * paying user. Safe to call fire-and-forget.
 */
export async function syncPromoPro(): Promise<void> {
  try {
    const store = useAppStore.getState();
    if (store.isPro) return; // already Pro (subscription or a prior sync)
    if (await hasActivePromoGrant()) {
      store.setIsPro(true);
    }
  } catch {
    // Best-effort — never let promo sync break a render path.
  }
}

// ── Pending-referral attribution (deep link before auth) ────

/**
 * Stash a code from an invite deep link the user opened while signed out (a
 * friend who doesn't have an account yet). AuthGate will bounce them to
 * onboarding/auth; applyPendingReferral() redeems it once they've signed up.
 */
export async function stashPendingReferral(code: string): Promise<void> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return;
  // Web included. SecureStore's web build is a stub, so this used to lose the
  // code silently for anyone opening an invite in a browser — the exact person
  // an invite link is for. See lib/deviceStore.ts.
  setDeviceItem(PENDING_REFERRAL_KEY, trimmed);
  // A newly-stashed code hasn't been applied yet — clear any stale flag so
  // applyPendingReferral will actually attempt it after signup.
  deleteDeviceItem(REFERRAL_APPLIED_KEY);
}

/**
 * Redeem a code stashed before signup, if any. Invoked on the Me tab's mount
 * AND from invite.tsx when already signed in (so a code applies post-signup
 * without editing _layout.tsx). Idempotent: the server allows a user to be
 * referred only once, and a device-local "applied" flag skips redundant calls.
 *
 * Returns the redeem status when it actually attempted a redemption, or null
 * when there was nothing to do (no stashed code / already applied / signed out).
 */
export async function applyPendingReferral(): Promise<RedeemStatus | null> {
  try {
    const userId = await getUserId();
    if (!userId) return null;

    // Already applied on this device — don't re-hit the server every mount.
    const applied = getDeviceItem(REFERRAL_APPLIED_KEY);
    if (applied === 'true') return null;

    const code = getDeviceItem(PENDING_REFERRAL_KEY);
    if (!code) return null;

    const result = await redeem(code);

    // Any TERMINAL outcome means we're done with this stashed code: clear it
    // and mark applied so we never retry. 'ok' obviously; the decline states
    // ('already_redeemed', 'self_referral', 'invalid_code') are also terminal —
    // retrying can't change them. Only a transient 'error' / 'referrer_capped'
    // is left stashed so a later mount can try again.
    const terminal =
      result.status === 'ok' ||
      result.status === 'already_redeemed' ||
      result.status === 'self_referral' ||
      result.status === 'invalid_code';
    if (terminal) {
      deleteDeviceItem(PENDING_REFERRAL_KEY);
      setDeviceItem(REFERRAL_APPLIED_KEY, 'true');
      // On success, make sure promo Pro is reflected even if redeem's own
      // sync raced the store init.
      if (result.status === 'ok') {
        await refreshLocalProAfterGrant().catch(() => {});
      }
    }
    return result.status;
  } catch {
    return null;
  }
}

// After a grant lands, reconcile local Pro. Prefer the authoritative
// entitlement refresh (covers the case where the user ALSO has a subscription),
// then fall back to the promo mirror so a promo-only user still shows Pro.
async function refreshLocalProAfterGrant(): Promise<void> {
  try {
    const entitlement = await refreshProStatus();
    if (!entitlement.transient && entitlement.is_pro) {
      useAppStore.getState().setIsPro(true);
      return;
    }
  } catch {
    // fall through to the promo mirror
  }
  await syncPromoPro();
}
