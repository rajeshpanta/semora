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

async function verifyWithApple(receipt: string): Promise<AppleVerifyResponse> {
  const body = JSON.stringify({
    'receipt-data': receipt,
    password: APPLE_SHARED_SECRET,
    'exclude-old-transactions': true,
  });

  // Try production first
  const prodResp = await fetch(APPLE_PROD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const prodJson = (await prodResp.json()) as AppleVerifyResponse;

  // Status 21007 means "this is a sandbox receipt sent to production" — retry sandbox
  if (prodJson.status === 21007) {
    const sandboxResp = await fetch(APPLE_SANDBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
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

  try {
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
      console.error('[validate-receipt] Apple fetch failed:', err);
      return jsonResponse({ error: 'Could not reach Apple. Please try again.' }, 502);
    }

    if (appleResp.status !== 0) {
      console.error('[validate-receipt] Apple returned status:', appleResp.status);
      return jsonResponse(
        { error: `Receipt validation failed (Apple status ${appleResp.status})` },
        400,
      );
    }

    const active = pickLatestActive(appleResp);

    // 5. Upsert entitlement row (service role bypasses RLS)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Block cross-account claim: if this transaction is already
    // bound to a different Semora user, refuse rather than rebind.
    if (active && active.originalTransactionId) {
      const { data: existing } = await adminClient
        .from('entitlements')
        .select('user_id')
        .eq('original_transaction_id', active.originalTransactionId)
        .maybeSingle();

      if (existing && existing.user_id !== userId) {
        return jsonResponse(
          {
            error:
              'This subscription is already linked to a different Semora account. ' +
              'Sign in with that account, or contact support to transfer it.',
          },
          409,
        );
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
      return jsonResponse({ error: 'Could not save entitlement. Please try again.' }, 500);
    }

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
