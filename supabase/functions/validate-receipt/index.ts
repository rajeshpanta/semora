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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') ?? '';

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
  adminClient: ReturnType<typeof createClient>,
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
    console.error('[validate-receipt] Failed to log call:', err);
  }
}

interface AppleReceiptInfo {
  product_id?: string;
  expires_date_ms?: string;
  original_transaction_id?: string;
}

interface AppleVerifyResponse {
  status: number;
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

serve(async (req) => {
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
      .gte('created_at', oneHourAgo);

    if (countError) {
      console.error('[validate-receipt] Rate limit check failed:', countError);
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
      console.error('[validate-receipt] APPLE_SHARED_SECRET not set in env');
      return jsonResponse(
        { error: 'Server is not configured for receipt validation. Please contact support.' },
        503,
      );
    }

    // 3. Parse + validate body
    let body: { receipt?: string; platform?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const receipt = body.receipt;
    const platform = body.platform === 'android' ? 'android' : 'ios';
    if (!receipt || typeof receipt !== 'string' || receipt.length < 20 || receipt.length > 200_000) {
      return jsonResponse({ error: 'Missing or malformed receipt' }, 400);
    }

    // 4. Validate with Apple (Android not yet supported)
    if (platform !== 'ios') {
      return jsonResponse({ error: 'Android receipt validation not yet supported' }, 501);
    }

    let appleResp: AppleVerifyResponse;
    try {
      appleResp = await verifyWithApple(receipt);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      console.error('[validate-receipt] Apple fetch failed:', err);
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
      console.error('[validate-receipt] Apple returned status:', appleResp.status);
      await logCall(
        adminClient,
        userId,
        'failed',
        Date.now() - startTime,
        `apple_status_${appleResp.status}`,
      );
      return jsonResponse(
        { error: `Receipt validation failed (Apple status ${appleResp.status})` },
        400,
      );
    }

    const active = pickLatestActive(appleResp);

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
          original_transaction_id: null,
          product_id: null,
          platform,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    const { error: upsertError } = await adminClient
      .from('entitlements')
      .upsert(entitlement, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('[validate-receipt] Upsert failed:', upsertError);
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
        console.error('[validate-receipt] Ledger write failed:', ledgerError);
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
  } catch (err) {
    console.error('[validate-receipt] Unhandled error:', err);
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
});
