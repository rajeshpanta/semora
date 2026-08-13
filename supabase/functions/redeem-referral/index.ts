import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

// Referral redemption endpoint. Structured on parse-syllabus/tutor-chat
// (CORS, Content-Length guard, JWT verification of the caller, service-role
// client, atomic RPC, error logging).
//
// Authenticated. Body: { code }. On success it records a redemption and
// grants a 30-day Pro promo to BOTH the referrer and the caller (the
// referred user), then returns { status: 'ok' }.
//
// ALL business guards live in the try_redeem_referral SQL function (migration
// 028), which runs under a per-referred-user advisory lock so a double-tap
// can't create two redemptions / two grant-pairs. This function only:
//   * authenticates the caller (their user_id is the referred user — never
//     trusted from the body, so a caller can't redeem "on behalf of" someone),
//   * validates the code shape,
//   * passes the referrer-cap ceiling in,
//   * maps the RPC's status string to an HTTP response.
//
// Promo Pro is intentionally NOT written to public.entitlements (which
// validate-receipt clobbers on every purchase) — try_redeem_referral writes
// promo_grants, and is_pro() ORs those in. See migration 028.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Max active (unexpired) referral grants a single referrer can hold. A coarse
// anti-fraud ceiling — OAuth-only signup already limits sock-puppet abuse.
// 12 active months is generous for a real power-sharer. Overridable via env
// without a redeploy of the constant.
const MAX_ACTIVE_REFERRER_GRANTS = (() => {
  const raw = parseInt(Deno.env.get('REFERRAL_MAX_ACTIVE_GRANTS') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
})();

// Codes are short unguessable strings (see lib/referral.generateCode); reject
// anything absurdly long before it reaches the DB.
const MAX_CODE_LEN = 64;

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

serve(withRequestLogging('redeem-referral', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. Bound the request body. The payload is tiny (just a code); require
    //    Content-Length like the sibling functions so a chunked stream can't
    //    bypass the check.
    const MAX_BODY_BYTES = 4 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request too large' }, 413);
    }

    // 1. Validate JWT against Supabase auth. The caller IS the referred user —
    //    we take their user_id from the verified token, never from the body,
    //    so nobody can redeem a code "as" another account.
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
    const referredUserId = userData.user.id;

    // 2. Parse + validate the body.
    let body: { code?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
      return jsonResponse({ error: 'A referral code is required', status: 'invalid_code' }, 400);
    }
    if (code.length > MAX_CODE_LEN) {
      return jsonResponse({ error: 'Invalid referral code', status: 'invalid_code' }, 400);
    }

    // 3. Atomic redemption via the service-role RPC. All guards (code exists,
    //    self-referral, already-referred, referrer cap) run inside the DB
    //    function under an advisory lock; we just translate its status.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: status, error: rpcErr } = await adminClient.rpc('try_redeem_referral', {
      redeem_code: code,
      referred: referredUserId,
      max_active_grants: MAX_ACTIVE_REFERRER_GRANTS,
    });

    if (rpcErr) {
      console.error('[redeem-referral] try_redeem_referral failed:', rpcErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }

    // 4. Map the RPC status to an HTTP response the client can branch on.
    switch (status) {
      case 'ok':
        // BOTH sides now have a 30-day promo grant. The client refreshes its
        // Pro state after this returns (is_pro() ORs in the grant).
        return jsonResponse({ status: 'ok' }, 200);
      case 'invalid_code':
        return jsonResponse(
          { error: "That referral code doesn't exist.", status: 'invalid_code' },
          404,
        );
      case 'self_referral':
        return jsonResponse(
          { error: "You can't redeem your own referral code.", status: 'self_referral' },
          400,
        );
      case 'already_redeemed':
        return jsonResponse(
          { error: "You've already redeemed a referral code.", status: 'already_redeemed' },
          409,
        );
      case 'referrer_capped':
        // The referrer maxed out their active referral months. Don't punish
        // the referred user with a scary error — treat as a soft decline.
        return jsonResponse(
          { error: 'This code has reached its limit right now.', status: 'referrer_capped' },
          409,
        );
      default:
        console.error('[redeem-referral] unexpected RPC status:', status);
        return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
    }
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));
