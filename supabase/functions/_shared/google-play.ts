// Google Play subscription verification.
//
// The Android half of validate-receipt. A Play purchase reaches the server as a
// purchase token, which proves nothing on its own: it is only a handle the
// Google Play Developer API resolves into the real state of the subscription.
// So every token is looked up with Google before it can grant anything, exactly
// as every Apple JWS is verified against Apple's root before its payload is read.
//
// Acknowledgement is the part with no Apple equivalent. Google refunds and
// revokes any subscription purchase that is not acknowledged within three days.
// The app acknowledges when it finishes the transaction, but only after the
// server has confirmed Pro, and a crash or a dropped connection in that window
// would refund a student who was told they had paid. The server acknowledges
// as well, right after it writes the entitlement, so the one step that must
// happen does not depend on a phone staying online.
//
// Pure interpretation lives apart from the network calls so it can be tested
// without a service account (see __tests__/google-play.test.ts).

export const ANDROID_PACKAGE_NAME = 'com.rajeshpanta.syllabussnap';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const GOOGLE_TIMEOUT_MS = 15_000;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** The fields of SubscriptionPurchaseV2 this server reads. */
export interface SubscriptionPurchaseV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  // Present (as an empty object) only for license-tester purchases.
  testPurchase?: Record<string, unknown>;
  linkedPurchaseToken?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
  }>;
}

export type PlayOutcome =
  | { kind: 'active'; productId: string; expiresAt: Date }
  | { kind: 'ended' }
  | { kind: 'unknown' };

export interface PlayInterpretation {
  outcome: PlayOutcome;
  // 'Sandbox' for license testers, mirroring Apple's label so the existing
  // environment column and every report built on it keep one vocabulary.
  environment: 'Production' | 'Sandbox';
  needsAcknowledgement: boolean;
}

// States in which the student has paid for access that has not run out yet.
// CANCELED belongs here: cancelling stops the NEXT renewal, and Google keeps the
// subscription usable until expiryTime, the same as Apple does.
const ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

// States that positively say access is over. ON_HOLD is a failed payment after
// grace, PAUSED is a student-chosen pause; neither carries access.
const ENDED_STATES = new Set([
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_PAUSED',
]);

/**
 * Turn Google's answer into the same three outcomes the Apple path uses.
 *
 * 'unknown' is reserved, as on Apple, for answers that say nothing about
 * whether this account is subscribed: a purchase still waiting on a slow
 * payment method (PENDING), a pending purchase the student abandoned, or a
 * state this code has never seen. Those must never write is_pro:false over a
 * subscription that is actually live.
 */
export function interpretSubscription(
  purchase: SubscriptionPurchaseV2,
  productIds: readonly string[],
  now: number = Date.now(),
): PlayInterpretation {
  const environment = purchase.testPurchase ? 'Sandbox' : 'Production';
  const state = purchase.subscriptionState ?? '';
  const ours = (purchase.lineItems ?? []).filter(
    (item) => typeof item.productId === 'string' && productIds.includes(item.productId),
  );

  const none = (outcome: PlayOutcome): PlayInterpretation => ({
    outcome,
    environment,
    needsAcknowledgement: false,
  });

  // A token for some other product says nothing about Semora Pro.
  if (ours.length === 0) return none({ kind: 'unknown' });
  if (ENDED_STATES.has(state)) return none({ kind: 'ended' });
  if (!ENTITLED_STATES.has(state)) return none({ kind: 'unknown' });

  let best: { productId: string; expiresMs: number } | null = null;
  for (const item of ours) {
    const expiresMs = item.expiryTime ? Date.parse(item.expiryTime) : NaN;
    if (!Number.isFinite(expiresMs)) continue;
    if (!best || expiresMs > best.expiresMs) {
      best = { productId: item.productId!, expiresMs };
    }
  }

  // An entitled state with no readable expiry is anomalous, not expired.
  if (!best) return none({ kind: 'unknown' });
  if (best.expiresMs <= now) return none({ kind: 'ended' });

  return {
    outcome: { kind: 'active', productId: best.productId, expiresAt: new Date(best.expiresMs) },
    environment,
    needsAcknowledgement: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}

/**
 * The value stored in original_transaction_id for a Play subscription.
 *
 * A Play purchase token stays the same across every renewal of one
 * subscription, which is exactly the job Apple's original_transaction_id does:
 * it is what the cross-account guard and the consumed_transactions ledger key
 * on. It is hashed because the raw token is a live credential for querying the
 * subscription, and the prefix keeps the two stores from ever colliding in the
 * shared unique index.
 */
export async function playTransactionKey(purchaseToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(purchaseToken));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `gp:${hex}`;
}

export function parseServiceAccount(raw: string): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
    if (!parsed.private_key.includes('PRIVATE KEY')) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The signed assertion exchanged for an access token (RFC 7523). */
export async function buildServiceAccountJwt(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const enc = new TextEncoder();
  const signingInput =
    `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(signingInput) as BufferSource,
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** A failure talking to Google, classified for the HTTP status we return. */
export class GooglePlayError extends Error {
  constructor(
    // 'config'   our service account is missing or not permitted (a deploy fault)
    // 'invalid'  Google does not recognise this token for this app
    // 'gone'     the token existed but is too old for Google to still answer
    // 'upstream' Google failed or timed out; retryable
    public readonly kind: 'config' | 'invalid' | 'gone' | 'upstream',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number; email: string } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  // Isolates are reused across requests; a token is good for an hour, so
  // minting one per validation would double every purchase's round trips.
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const assertion = await buildServiceAccountJwt(sa, Math.floor(Date.now() / 1000));
  let resp: Response;
  try {
    resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GooglePlayError('upstream', `token request failed: ${String(err)}`);
  }
  const payload = (await resp.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string }
    | null;
  if (!resp.ok || !payload?.access_token) {
    // invalid_grant / unauthorized_client = a bad or revoked key: ours to fix.
    const kind = resp.status >= 500 ? 'upstream' : 'config';
    throw new GooglePlayError(kind, `token exchange refused: ${payload?.error ?? resp.status}`, resp.status);
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    email: sa.client_email,
  };
  return payload.access_token;
}

export async function fetchSubscription(
  sa: ServiceAccount,
  purchaseToken: string,
): Promise<SubscriptionPurchaseV2> {
  const accessToken = await getAccessToken(sa);
  const url = `${API_BASE}/${ANDROID_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GooglePlayError('upstream', `subscription lookup failed: ${String(err)}`);
  }
  if (resp.ok) return (await resp.json()) as SubscriptionPurchaseV2;

  const detail = await resp.text().catch(() => '');
  // 401/403: the service account is not linked in Play Console, or lacks the
  // financial-data permission. The single most likely setup mistake, and it
  // must read as ours, never as the student's bad purchase.
  if (resp.status === 401 || resp.status === 403) {
    throw new GooglePlayError('config', `play api denied: ${detail.slice(0, 200)}`, resp.status);
  }
  if (resp.status === 410) throw new GooglePlayError('gone', 'purchase token expired', 410);
  if (resp.status === 400 || resp.status === 404) {
    throw new GooglePlayError('invalid', `token not recognised: ${detail.slice(0, 200)}`, resp.status);
  }
  throw new GooglePlayError('upstream', `play api ${resp.status}`, resp.status);
}

export async function acknowledgeSubscription(
  sa: ServiceAccount,
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const accessToken = await getAccessToken(sa);
  const url =
    `${API_BASE}/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new GooglePlayError('upstream', `acknowledge ${resp.status}: ${detail.slice(0, 200)}`, resp.status);
  }
}
