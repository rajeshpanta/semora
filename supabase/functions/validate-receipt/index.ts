// validate-receipt
// Server-side StoreKit receipt validation.
//
// Flow:
//   1. Verify caller's JWT (auth.getUser).
//   2. Receive the base64 transactionReceipt from the client.
//   3. POST to Apple's verifyReceipt (production -> sandbox fallback on 21007).
//   4. Extract latest active subscription, write it to public.entitlements
//      tied to the Semora user_id (NOT the Apple ID).
//   5. Return { is_pro, plan, expires_at } to the client.
//
// Why this exists: a local StoreKit query (getAvailablePurchases) tells you
// the *Apple ID* has an active subscription, but says nothing about which
// Semora account paid. Validating server-side and storing per user_id
// prevents StoreKit cross-account carry-over and client-side bypass.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as x509 from 'npm:@peculiar/x509@1.12.3';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') ?? '';

// When 'true', Sandbox/TestFlight transactions do NOT grant production Pro.
// Default OFF: App Review purchases in the Sandbox environment, so blocking
// it outright would fail review ("IAP doesn't work"). Keep this off through
// launch + each update review, then set BLOCK_SANDBOX_PRO=true once live so
// sandbox receipts can't mint real entitlements for TestFlight testers.
const BLOCK_SANDBOX = Deno.env.get('BLOCK_SANDBOX_PRO') === 'true';

const APPLE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

const PRODUCT_MONTHLY = 'semora_pro_monthly';
const PRODUCT_ANNUAL = 'semora_pro_annual';

// Per-user rolling 1-hour cap. Legitimate use: ~5–10 calls/hour
// (purchase + restore + cold-launch + retries on flaky network).
// 30 leaves comfortable headroom while blocking abuse that would
// otherwise burn our compute and Apple's shared-secret quota.
const HOURLY_CAP = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logCall(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  userId: string,
  status: 'success' | 'failed' | 'rate_limited',
  durationMs: number,
  errorCode?: string,
) {
  try {
    await adminClient.from('receipt_validation_log').insert({
      user_id: userId,
      status,
      error_code: errorCode ?? null,
      duration_ms: durationMs,
    });
  } catch (err) {
    // console, NOT `log` — this is a module-level helper and the structured
    // logger is created per request and never passed in, so `log` was an
    // undefined identifier here. Nothing caught it because supabase-js returns
    // { error } instead of throwing, so this branch only runs on a network
    // fault — at which point the handler for a failed telemetry insert would
    // itself have thrown a ReferenceError, out of a receipt validation.
    // Matches how _shared/ai.ts reports the same class of failure.
    console.error('[validate-receipt] failed_to_log_call:', errorFields(err));
  }
}

interface AppleReceiptInfo {
  product_id?: string;
  expires_date_ms?: string;
  original_transaction_id?: string;
  // Present when Apple Support refunded/revoked the transaction. A
  // cancelled transaction must never grant entitlement, even if its
  // expires_date is still in the future.
  cancellation_date_ms?: string;
}

interface AppleVerifyResponse {
  status: number;
  environment?: string; // "Sandbox" | "Production"
  latest_receipt_info?: AppleReceiptInfo[];
  receipt?: { in_app?: AppleReceiptInfo[] };
}

// Cap Apple's verifyReceipt round-trip. Apple has been observed to hang
// for 30s+ during incidents; without a timeout, the whole purchase
// verification flow stalls and the user stares at a paywall spinner.
// Both production and sandbox calls share this budget — if production
// times out, we fail rather than spending another 15s trying sandbox.
const APPLE_TIMEOUT_MS = 15_000;

async function verifyWithApple(receipt: string): Promise<AppleVerifyResponse> {
  const body = JSON.stringify({
    'receipt-data': receipt,
    password: APPLE_SHARED_SECRET,
    'exclude-old-transactions': true,
  });

  const prodResp = await fetch(APPLE_PROD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
  });
  const prodJson = (await prodResp.json()) as AppleVerifyResponse;

  // Status 21007 means "this is a sandbox receipt sent to production" — retry sandbox
  if (prodJson.status === 21007) {
    const sandboxResp = await fetch(APPLE_SANDBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    });
    return (await sandboxResp.json()) as AppleVerifyResponse;
  }

  return prodJson;
}

// ── StoreKit 2 JWS verification ─────────────────────────────────────
// Modern purchases arrive as an Apple-SIGNED JWS transaction (the
// client's purchase.purchaseToken). Verifying it here needs no shared
// secret, no verifyReceipt round-trip, and — crucially — no legacy app
// receipt on the device (whose absence caused Apple-ID password prompts
// and "no subscription found" loops in TestFlight).
//
// Trust model: the JWS embeds its x5c certificate chain. We (1) pin the
// chain's root to Apple Root CA - G3 by SHA-256 of its DER, (2) verify
// each certificate's signature against its issuer, (3) check validity
// windows, (4) verify the ES256 signature with the leaf key, and only
// then (5) trust the payload's bundleId/productId/expiry/revocation.

const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

x509.cryptoProvider.set(crypto);

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface JwsTransaction {
  bundleId?: string;
  productId?: string;
  originalTransactionId?: string;
  transactionId?: string;
  expiresDate?: number; // ms
  revocationDate?: number;
  type?: string;
  environment?: string;
}

async function verifyAppleJws(jws: string): Promise<{
  productId: string;
  expiresAt: Date;
  originalTransactionId: string;
} | null> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Malformed transaction token');

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error('Unsupported transaction token');
  }

  // Build the certificate chain (leaf first).
  const certs = header.x5c.map((b64: string) => new x509.X509Certificate(b64urlToBytes(b64.replace(/-/g, '+').replace(/_/g, '/')).buffer as ArrayBuffer));

  // 1. Root must be Apple Root CA - G3, byte-for-byte (pinned hash).
  const rootHash = await sha256Hex(certs[certs.length - 1].rawData);
  if (rootHash !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error('Untrusted certificate chain');
  }

  // 2. Each cert must be signed by the next one up, and currently valid.
  const now = new Date();
  for (let i = 0; i < certs.length; i++) {
    if (now < certs[i].notBefore || now > certs[i].notAfter) {
      throw new Error('Certificate expired');
    }
    const issuer = certs[i + 1] ?? certs[i]; // root self-signed
    const ok = await certs[i].verify({ publicKey: issuer.publicKey, signatureOnly: true });
    if (!ok) throw new Error('Broken certificate chain');
  }

  // 3. Verify the JWS signature with the leaf certificate's key.
  const leafKey = await certs[0].publicKey.export(crypto);
  // `as BufferSource` because TypeScript's newer lib types Uint8Array as
  // Uint8Array<ArrayBufferLike>, which no longer satisfies BufferSource's
  // ArrayBuffer-backed view. Same bytes, same call, purely a type assertion.
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as BufferSource;
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    leafKey,
    b64urlToBytes(parts[2]) as BufferSource,
    data,
  );
  if (!valid) throw new Error('Invalid transaction signature');

  // 4. Only now read the payload.
  const tx: JwsTransaction = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (tx.bundleId !== 'com.rajeshpanta.syllabussnap') throw new Error('Wrong app');
  // Don't let a Sandbox/TestFlight transaction grant production Pro (gated so
  // App Review's sandbox purchase still works until BLOCK_SANDBOX_PRO is set).
  if (BLOCK_SANDBOX && tx.environment && tx.environment !== 'Production') return null;
  if (tx.productId !== PRODUCT_MONTHLY && tx.productId !== PRODUCT_ANNUAL) return null;
  if (tx.revocationDate) return null; // refunded/revoked
  if (!tx.expiresDate || tx.expiresDate <= Date.now()) return null; // lapsed

  return {
    productId: tx.productId,
    expiresAt: new Date(tx.expiresDate),
    originalTransactionId: tx.originalTransactionId ?? tx.transactionId ?? '',
  };
}

function pickLatestActive(resp: AppleVerifyResponse): {
  productId: string;
  expiresAt: Date;
  originalTransactionId: string;
} | null {
  const candidates = [
    ...(resp.latest_receipt_info ?? []),
    ...(resp.receipt?.in_app ?? []),
  ];
  const now = Date.now();

  let best: {
    productId: string;
    expiresAt: Date;
    originalTransactionId: string;
  } | null = null;

  for (const tx of candidates) {
    if (
      tx.product_id !== PRODUCT_MONTHLY &&
      tx.product_id !== PRODUCT_ANNUAL
    ) {
      continue;
    }
    // Refunded/revoked by Apple — does not grant Pro regardless of expiry.
    if (tx.cancellation_date_ms) continue;
    const expiresMs = tx.expires_date_ms ? Number(tx.expires_date_ms) : NaN;
    if (!Number.isFinite(expiresMs) || expiresMs <= now) continue;

    if (!best || expiresMs > best.expiresAt.getTime()) {
      best = {
        productId: tx.product_id,
        expiresAt: new Date(expiresMs),
        originalTransactionId: tx.original_transaction_id ?? '',
      };
    }
  }

  return best;
}

serve(withRequestLogging('validate-receipt', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // 0. Bound the request body before req.json() buffers it.
    //    Apple receipts are ~150KB tops; 256KB is generous headroom.
    //    Two-step defense:
    //      a) Require a numeric Content-Length header. A chunked-encoded
    //         request omits it; without this guard an attacker could
    //         ship a 50MB body and we'd burn memory parsing it.
    //      b) Reject when the declared length exceeds the cap.
    //    Legitimate clients (supabase-js, native fetch with a JSON body)
    //    always set Content-Length, so this is safe to require.
    const MAX_BODY_BYTES = 256 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request body too large' }, 413);
    }

    // 1. Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }
    const userId = userData.user.id;

    // 1b. Per-user rolling 1-hour rate limit (service role bypasses RLS).
    // Apple's verifyReceipt has its own rate limit, but an authenticated
    // user can still burn our edge-function CPU and Apple's shared-secret
    // quota by hammering this endpoint. The cap also protects against a
    // misbehaving client stuck in a retry loop.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: recentCount, error: countError } = await adminClient
      .from('receipt_validation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      // Don't count throttle rows toward the cap — otherwise every
      // rejected retry extended the lockout (a user told "wait a few
      // minutes" who retried stayed locked out indefinitely).
      .neq('status', 'rate_limited')
      .gte('created_at', oneHourAgo);

    if (countError) {
      log.error('rate_limit_check_failed', errorFields(countError));
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }

    if ((recentCount ?? 0) >= HOURLY_CAP) {
      await logCall(adminClient, userId, 'rate_limited', Date.now() - startTime);
      return jsonResponse(
        {
          error:
            'Too many receipt validations. Please wait a few minutes before trying again.',
        },
        429,
      );
    }

    // 2. Apple shared secret must be configured for any validation to occur
    if (!APPLE_SHARED_SECRET) {
      log.error('apple_shared_secret_not_set_in_env');
      return jsonResponse(
        { error: 'Server is not configured for receipt validation. Please contact support.' },
        503,
      );
    }

    // 3. Parse + validate body. Two credential shapes:
    //    - jws: StoreKit2 signed transaction (preferred — verified locally
    //      against Apple's pinned root, no shared secret, no receipt file)
    //    - receipt: legacy base64 app receipt (verifyReceipt round-trip)
    let body: { receipt?: string; jws?: string; platform?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const receipt = typeof body.receipt === 'string' ? body.receipt : null;
    const jws = typeof body.jws === 'string' ? body.jws : null;
    const platform = body.platform === 'android' ? 'android' : 'ios';
    const receiptUsable = receipt != null && receipt.length >= 20 && receipt.length <= 200_000;
    const jwsUsable = jws != null && jws.length >= 100 && jws.length <= 64_000;
    if (!receiptUsable && !jwsUsable) {
      return jsonResponse({ error: 'Missing or malformed receipt' }, 400);
    }

    // 4. Validate (Android not yet supported)
    if (platform !== 'ios') {
      return jsonResponse({ error: 'Android receipt validation not yet supported' }, 501);
    }

    // ── Path A: signed JWS transaction ────────────────────────────
    if (jwsUsable) {
      let jwsActive: Awaited<ReturnType<typeof verifyAppleJws>>;
      try {
        jwsActive = await verifyAppleJws(jws!);
      } catch (err) {
        log.error('jws_verification_failed', errorFields(err));
        await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'jws_invalid');
        // If a legacy receipt was also provided, fall through to it below
        // instead of failing the whole request.
        jwsActive = null;
        if (!receiptUsable) {
          return jsonResponse({ error: 'Invalid purchase token' }, 400);
        }
      }
      if (jwsActive) {
        return await writeEntitlementAndRespond(adminClient, userId, platform, jwsActive, startTime, log);
      }
      // jws verified but inactive (lapsed/revoked/foreign product):
      // when no receipt fallback, record the inactive state honestly.
      if (!receiptUsable) {
        return await writeEntitlementAndRespond(adminClient, userId, platform, null, startTime, log);
      }
    }

    // ── Path B: legacy app receipt via Apple verifyReceipt ───────
    let appleResp: AppleVerifyResponse;
    try {
      appleResp = await verifyWithApple(receipt!);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      log.error('apple_fetch_failed', errorFields(err));
      await logCall(
        adminClient,
        userId,
        'failed',
        Date.now() - startTime,
        isTimeout ? 'apple_timeout' : 'apple_unreachable',
      );
      return jsonResponse(
        {
          error: isTimeout
            ? 'Apple is taking too long to verify. Please try again in a moment.'
            : 'Could not reach Apple. Please try again.',
        },
        isTimeout ? 504 : 502,
      );
    }

    if (appleResp.status !== 0) {
      log.error('apple_returned_status', errorFields(appleResp.status));
      await logCall(
        adminClient,
        userId,
        'failed',
        Date.now() - startTime,
        `apple_status_${appleResp.status}`,
      );
      // 21004 = OUR shared secret is wrong — a server misconfiguration,
      // not a bad receipt. 21005 = Apple temporarily unavailable. Both
      // must read as retryable/server-side (5xx) so the client treats
      // them as transient instead of telling a payer "validation failed".
      if (appleResp.status === 21004) {
        return jsonResponse(
          { error: 'Server is not configured for receipt validation. Please contact support.' },
          503,
        );
      }
      if (appleResp.status === 21005) {
        return jsonResponse(
          { error: 'Apple\'s servers are busy. Please try again in a moment.' },
          503,
        );
      }
      return jsonResponse(
        { error: `Receipt validation failed (Apple status ${appleResp.status})` },
        400,
      );
    }

    // Legacy receipt path: same Sandbox gate (write an inactive entitlement
    // rather than grant Pro from a sandbox receipt when blocking is enabled).
    const active =
      BLOCK_SANDBOX && appleResp.environment && appleResp.environment !== 'Production'
        ? null
        : pickLatestActive(appleResp);
    return await writeEntitlementAndRespond(adminClient, userId, platform, active, startTime, log);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));


// Shared by the JWS and legacy-receipt paths: cross-account OTI guard,
// entitlement upsert (inactive writes preserve the OTI binding), ledger,
// and the success response.
async function writeEntitlementAndRespond(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  userId: string,
  platform: string,
  active: { productId: string; expiresAt: Date; originalTransactionId: string } | null,
  startTime: number,
  // Passed in rather than closed over: `log` is bound as the handler's second
  // parameter, and this function lives at module scope. Referencing it here
  // without threading it through is a ReferenceError at runtime — which Deno
  // only surfaces when the line executes, and this file is excluded from
  // tsconfig so tsc never sees it either.
  // deno-lint-ignore no-explicit-any
  log: any,
): Promise<Response> {

    // 5. Upsert entitlement row (adminClient created above for rate-limit check)
    // Block cross-account claim. Two things to check:
    //   1. Is this OTI currently bound to a *different* Semora user?
    //   2. Was this OTI ever consumed by an account that's now deleted?
    //      (Entitlement row CASCADEd, but the consumed_transactions
    //      ledger row survives — that's its whole purpose.)
    if (active && active.originalTransactionId) {
      const oti = active.originalTransactionId;

      const { data: existing } = await adminClient
        .from('entitlements')
        .select('user_id')
        .eq('original_transaction_id', oti)
        .maybeSingle();

      if (existing && existing.user_id !== userId) {
        await logCall(
          adminClient,
          userId,
          'failed',
          Date.now() - startTime,
          'cross_account_oti',
        );
        return jsonResponse(
          {
            error:
              'This subscription is already linked to a different Semora account. ' +
              'Sign in with that account, or contact support to transfer it.',
          },
          409,
        );
      }

      // No live entitlement for this OTI — but maybe one was deleted.
      // Only check the ledger when there's no current entitlement,
      // otherwise we'd block the legitimate same-user re-validation.
      if (!existing) {
        const { data: consumed } = await adminClient
          .from('consumed_transactions')
          .select('original_transaction_id')
          .eq('original_transaction_id', oti)
          .maybeSingle();

        if (consumed) {
          await logCall(
            adminClient,
            userId,
            'failed',
            Date.now() - startTime,
            'oti_consumed_deleted_account',
          );
          return jsonResponse(
            {
              error:
                'This subscription was previously linked to a Semora account that has been deleted. ' +
                'Please contact support to transfer it to your current account.',
            },
            409,
          );
        }
      }
    }

    // ── DO NOT CLOBBER A WEB (STRIPE) SUBSCRIPTION ────────────────────────
    // This function writes is_pro:false whenever it finds no active Apple
    // receipt — correct when Apple is the only biller, catastrophic once
    // Stripe can bill too. A student who subscribes on app.semoraai.com and
    // then opens the iOS app has no Apple receipt, so this would have
    // downgraded them to free while Stripe kept charging their card.
    //
    // Stripe-billed rows are owned by the stripe-webhook function alone.
    // Apple may not write them: an Apple receipt that is genuinely active is
    // still refused below, because two live subscriptions for one account is
    // a billing problem to resolve with the user, not silently by whichever
    // validator ran last.
    const { data: currentRow } = await adminClient
      .from('entitlements')
      .select('platform, is_pro, expires_at, plan')
      .eq('user_id', userId)
      .maybeSingle();

    const webBilled =
      currentRow?.platform === 'web' &&
      currentRow?.is_pro === true &&
      (!currentRow.expires_at || new Date(currentRow.expires_at) > new Date());

    if (webBilled) {
      if (active) {
        // Both billers think they own this account. Say so rather than
        // picking a winner and quietly cancelling someone's access.
        log.warn('apple_receipt_over_web_subscription', { user_id: userId });
        return jsonResponse(
          {
            error:
              'This account already has an active Semora Pro subscription billed on the web. ' +
              'Manage or cancel it from Settings before subscribing through the App Store, ' +
              'so you are not charged twice.',
          },
          409,
        );
      }
      // No Apple receipt and a healthy web subscription: nothing to do, and
      // above all nothing to downgrade.
      log.info('skipped_write_web_billed', { user_id: userId });
      await logCall(adminClient, userId, 'success', Date.now() - startTime);
      return jsonResponse(
        {
          is_pro: true,
          plan: currentRow?.plan ?? null,
          expires_at: currentRow?.expires_at ?? null,
        },
        200,
      );
    }

    const entitlement = active
      ? {
          user_id: userId,
          is_pro: true,
          plan: active.productId === PRODUCT_ANNUAL ? 'annual' : 'monthly',
          expires_at: active.expiresAt.toISOString(),
          original_transaction_id: active.originalTransactionId,
          product_id: active.productId,
          platform,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          user_id: userId,
          is_pro: false,
          plan: null,
          expires_at: null,
          // Deliberately OMIT original_transaction_id / product_id here.
          // Nulling the OTI on a lapsed validation used to orphan the
          // binding: when the same user later renewed (same Apple OTI),
          // the entitlement lookup found no row carrying that OTI, fell
          // through to the consumed_transactions ledger, and 409'd a
          // legitimate renewal as "linked to a deleted account" —
          // permanently locking the subscriber out. Upsert only updates
          // the columns provided, so omitting them preserves the binding
          // across lapses while is_pro correctly goes false.
          platform,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    const { error: upsertError } = await adminClient
      .from('entitlements')
      .upsert(entitlement, { onConflict: 'user_id' });

    if (upsertError) {
      log.error('upsert_failed', errorFields(upsertError));
      await logCall(
        adminClient,
        userId,
        'failed',
        Date.now() - startTime,
        'entitlement_upsert_failed',
      );
      return jsonResponse({ error: 'Could not save entitlement. Please try again.' }, 500);
    }

    // Record this OTI in the ledger. Done AFTER the entitlement upsert
    // so that if entitlement write fails, we don't lock the user out
    // of their own subscription on retry. Ledger write failure is
    // logged but non-fatal — the entitlement uniqueness on OTI still
    // blocks cross-account claim while both rows exist.
    if (active && active.originalTransactionId) {
      const { error: ledgerError } = await adminClient
        .from('consumed_transactions')
        .upsert(
          { original_transaction_id: active.originalTransactionId },
          { onConflict: 'original_transaction_id' },
        );
      if (ledgerError) {
        log.error('ledger_write_failed', errorFields(ledgerError));
      }
    }

    await logCall(adminClient, userId, 'success', Date.now() - startTime);

    return jsonResponse(
      {
        is_pro: entitlement.is_pro,
        plan: entitlement.plan,
        expires_at: entitlement.expires_at,
      },
      200,
    );
}