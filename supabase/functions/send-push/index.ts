import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

// ============================================================
// send-push — server/cron/admin re-engagement notifications
// ============================================================
// Delivers Expo push notifications to a set of users. This is the
// server-side complement to the app's LOCAL reminders: local
// notifications can't reach a closed app between semesters, so a daily
// cron job (see the follow-up SQL) calls this to nudge lapsed students.
//
// AUTH MODEL — IMPORTANT:
//   This function is NOT called by end-user clients. It is invoked by
//   trusted server callers (pg_cron, an admin script). It therefore
//   requires a SHARED SECRET, not a user JWT:
//     Authorization: Bearer <PUSH_SEND_SECRET>
//   Requests without a matching secret are rejected 401. There is no
//   per-user auth path — a client must never be able to make Semora
//   push arbitrary notifications to arbitrary users.
//
//   Set the secret with:  supabase secrets set PUSH_SEND_SECRET=<value>
//   The cron job passes it in the Authorization header (see follow-up).
//
//   DEPLOY FLAG — REQUIRED:
//     supabase functions deploy send-push --no-verify-jwt
//   Because auth here is the shared secret (NOT a Supabase-signed JWT), the
//   default gateway JWT verification would 401 every cron call BEFORE this
//   code runs. --no-verify-jwt hands the shared-secret check below the
//   request. (Shipping without this flag = the push channel silently never
//   delivers.) config.toml is intentionally NOT added — this Supabase
//   project is shared with the Citizen app, so a repo-level config could
//   change the other app's function deploys.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUSH_SEND_SECRET = Deno.env.get('PUSH_SEND_SECRET') ?? '';

// Expo's push API accepts at most 100 messages per request.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_CHUNK_SIZE = 100;

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
}

serve(withRequestLogging('send-push', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Shared-secret gate. This endpoint is server-only; reject anything
    //    that doesn't present the exact PUSH_SEND_SECRET. Fail closed if the
    //    secret isn't configured (never run wide-open).
    if (!PUSH_SEND_SECRET) {
      log.error('push_send_secret_not_configured_refusing_all_request');
      return jsonResponse({ error: 'Server not configured' }, 500);
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const provided = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;
    if (provided !== PUSH_SEND_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 2. Parse + validate the payload.
    let body: {
      user_ids?: unknown;
      title?: unknown;
      body?: unknown;
      data?: unknown;
      translations?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const userIds = Array.isArray(body.user_ids)
      ? body.user_ids.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : [];
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
    const data =
      body.data && typeof body.data === 'object' && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : undefined;
    const translations =
      body.translations && typeof body.translations === 'object' && !Array.isArray(body.translations)
        ? (body.translations as Record<string, { title?: unknown; body?: unknown }>)
        : {};

    if (userIds.length === 0) {
      return jsonResponse({ error: 'user_ids (non-empty string array) is required' }, 400);
    }
    if (!title || !messageBody) {
      return jsonResponse({ error: 'title and body are required' }, 400);
    }

    // 3. Look up the target users' push tokens (service role bypasses RLS).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: tokenRows, error: tokenErr } = await adminClient
      .from('push_tokens')
      .select('token, preferred_language')
      .in('user_id', userIds);

    if (tokenErr) {
      log.error('token_lookup_failed', errorFields(tokenErr));
      return jsonResponse({ error: 'Failed to look up push tokens' }, 500);
    }

    // De-dupe tokens (a user could have two rows pointing at the same device
    // after an account move) and keep only well-formed Expo tokens.
    const devices = Array.from(new Map(
      (tokenRows ?? [])
        .filter((row: any) => typeof row.token === 'string' && row.token.startsWith('ExponentPushToken'))
        .map((row: any) => [row.token, {
          token: row.token as string,
          language: row.preferred_language === 'es' ? 'es' : 'en',
        }]),
    ).values());

    if (devices.length === 0) {
      return jsonResponse({ sent: 0, tickets: 0, removed: 0, message: 'No registered devices for these users' }, 200);
    }

    // 4. POST to Expo in chunks of 100. Collect receipts so we can prune
    //    DeviceNotRegistered tokens afterward.
    const deadTokens: string[] = [];
    let ticketCount = 0;
    // Count only tickets Expo actually accepted ('ok'). Chunks that fail to
    // POST (network blip / Expo 5xx) `continue` without contributing, so the
    // returned `sent` reflects real delivery instead of the token total.
    let sentCount = 0;

    for (const deviceChunk of chunk(devices, EXPO_CHUNK_SIZE)) {
      const tokenChunk = deviceChunk.map((device) => device.token);
      const messages: ExpoMessage[] = deviceChunk.map((device) => {
        const localized = translations[device.language];
        const localizedTitle = typeof localized?.title === 'string' && localized.title.trim()
          ? localized.title.trim()
          : title;
        const localizedBody = typeof localized?.body === 'string' && localized.body.trim()
          ? localized.body.trim()
          : messageBody;
        return {
          to: device.token,
          title: localizedTitle,
          body: localizedBody,
          ...(data ? { data } : {}),
          sound: 'default',
        };
      });

      let expoResp: Response;
      try {
        expoResp = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
      } catch (err) {
        // Network blip to Expo — log and move on to the next chunk rather
        // than failing the whole run.
        log.error('expo_fetch_failed', errorFields(err));
        continue;
      }

      if (!expoResp.ok) {
        const errText = await expoResp.text().catch(() => '');
        log.error('expo_http_error', { status: expoResp.status, provider_error: errText.slice(0, 300) });
        continue;
      }

      // Expo returns { data: [ { status, id? , details? }, ... ] } aligned
      // 1:1 with the messages we sent. A per-message error status of
      // 'DeviceNotRegistered' means the token is dead — collect it for
      // deletion so we stop pushing to it (and Expo stops flagging us).
      const respJson = await expoResp.json().catch(() => null);
      const tickets = Array.isArray(respJson?.data) ? respJson.data : [];
      tickets.forEach((ticket: any, i: number) => {
        ticketCount += 1;
        if (ticket?.status === 'ok') {
          // Only 'ok' tickets were actually accepted for delivery by Expo.
          sentCount += 1;
        }
        if (
          ticket?.status === 'error' &&
          ticket?.details?.error === 'DeviceNotRegistered' &&
          tokenChunk[i]
        ) {
          deadTokens.push(tokenChunk[i]);
        }
      });
    }

    // 5. Prune dead tokens so future runs skip them.
    let removed = 0;
    if (deadTokens.length > 0) {
      const { error: delErr, count } = await adminClient
        .from('push_tokens')
        .delete({ count: 'exact' })
        .in('token', deadTokens);
      if (delErr) {
        log.error('dead_token_cleanup_failed', errorFields(delErr));
      } else {
        removed = count ?? deadTokens.length;
      }
    }

    return jsonResponse({ sent: sentCount, tickets: ticketCount, removed }, 200);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred.' }, 500);
  }
}));
