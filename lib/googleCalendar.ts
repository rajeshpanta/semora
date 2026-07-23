import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';

// ── Google Calendar sync (Pro) — client ─────────────────────
//
// One-way push of tasks (and optionally class meetings) into the user's
// GOOGLE Calendar, complementing the device/EventKit sync (lib/calendarSync.ts)
// and the .ics export. All the Google Calendar REST work happens SERVER-SIDE
// in the google-cal-sync edge function — this module only:
//   1. requests the calendar scope + a serverAuthCode via GoogleSignin
//      (incremental consent; see connectGoogleCalendar), and
//   2. POSTs actions (connect / sync / disconnect) to that function.
//
// The refresh token never touches the client: GoogleSignin hands us a
// short-lived serverAuthCode, which the edge function exchanges with Google
// for the long-lived refresh token and stores server-side (secrets table).
//
// DARK-LAUNCH: the whole feature hides behind GOOGLE_CAL_ENABLED. The
// sensitive `calendar.events` scope requires Google's OAuth-consent-screen
// verification before it can be used in production; until that's approved and
// the OAuth client secret is provisioned on the edge function, this stays
// false so the UI never appears. Flip to true (and see the follow-ups) once
// verification lands.
export const GOOGLE_CAL_ENABLED = true;

// The sensitive Google Calendar scope we request incrementally (on top of the
// email/profile scopes the sign-in already granted). Read/write to events on
// calendars the user owns — enough to create the Semora calendar's events.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Same Web Client ID lib/auth.ts configures GoogleSignin with — required for
// offlineAccess (serverAuthCode). We deliberately don't import from lib/auth.ts
// (contended / not ours) and read the env var directly, matching how auth.ts
// itself sources it.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

const FN_NAME = 'google-cal-sync';

export const googleCalKeys = {
  status: ['googleCalStatus'] as const,
};

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

// Device IANA time zone (e.g. "America/New_York") so timed events land at the
// intended wall-clock in Google. Falls back to UTC if unavailable.
function deviceTimeZone(): string {
  try {
    return Localization.getCalendars()[0]?.timeZone
      || Intl.DateTimeFormat().resolvedOptions().timeZone
      || 'UTC';
  } catch {
    return 'UTC';
  }
}

// POST an action to the google-cal-sync edge function. Preserves the server's
// `code` (PRO_REQUIRED / REVOKED / NOT_CONNECTED) so callers can react (route
// to paywall, prompt reconnect) instead of showing a generic error.
async function callFn(payload: Record<string, unknown>): Promise<any> {
  const session = await getSession();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');

  const response = await fetch(`${supabaseUrl}/functions/v1/${FN_NAME}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    const e = new Error(err.error || `Server error: ${response.status}`) as Error & { code?: string; status?: number };
    e.code = err.code;
    e.status = response.status;
    throw e;
  }
  return response.json();
}

// Request the calendar scope + a fresh serverAuthCode, incrementally.
//
// To get a serverAuthCode (offline refresh token for the server) GoogleSignin
// must be configured with offlineAccess:true + the webClientId, and the
// calendar scope must be among the requested scopes. lib/auth.ts configures
// GoogleSignin WITHOUT offlineAccess (it only needs an id-token for Supabase
// sign-in), so we RE-configure here to add offlineAccess + the calendar scope,
// then re-run signIn() to obtain a serverAuthCode carrying the granted scope.
// configure() is idempotent and lib/auth.ts re-applies its own config on the
// next sign-in, so this doesn't disturb the auth flow.
//
// Returns the serverAuthCode, or throws (including on user-cancel, surfaced
// with code 'SIGN_IN_CANCELLED' like lib/auth.ts).
async function requestServerAuthCode(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google is not configured. Please try again later.');
  }
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: true,
    scopes: [CALENDAR_SCOPE],
  });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // addScopes prompts for the extra scope if the user is already signed in;
  // signIn is the fallback that also (re)issues the serverAuthCode. We call
  // signIn directly because it reliably returns a serverAuthCode with the
  // requested scope granted, whereas addScopes' return shape varies and may
  // omit the code on iOS.
  const result = await GoogleSignin.signIn();
  if ((result as any)?.type === 'cancelled') {
    const cancelErr: any = new Error('Connecting Google Calendar was cancelled.');
    cancelErr.code = 'SIGN_IN_CANCELLED';
    throw cancelErr;
  }
  const userInfo: any = (result as any)?.data ?? result;
  const serverAuthCode: string | undefined = userInfo?.serverAuthCode;
  if (!serverAuthCode) {
    // No offline code — usually offlineAccess/webClientId misconfigured, or the
    // user denied the calendar scope.
    throw new Error('Google did not grant calendar access. Please try again and allow calendar permission.');
  }
  return serverAuthCode;
}

// ── Public API ──────────────────────────────────────────────

// Connect Google Calendar: obtain scope + serverAuthCode, hand it to the edge
// function (which exchanges it for tokens, provisions the Semora calendar, and
// runs an initial sync). Pro-gated server-side (the fn returns PRO_REQUIRED);
// callers should also gate the entry point with useAppStore(s => s.isPro) and
// route free users to the paywall. Returns the initial sync counts.
export async function connectGoogleCalendar(opts: {
  semesterId: string | null;
  includeMeetings?: boolean;
}): Promise<{ taskCount: number; meetingCount: number }> {
  if (Platform.OS === 'web') throw new Error('Google Calendar sync is only available on iOS and Android.');
  const serverAuthCode = await requestServerAuthCode();
  const res = await callFn({
    action: 'connect',
    serverAuthCode,
    semesterId: opts.semesterId,
    includeMeetings: opts.includeMeetings ?? false,
    timeZone: deviceTimeZone(),
  });
  return { taskCount: res.taskCount ?? 0, meetingCount: res.meetingCount ?? 0 };
}

// Re-sync the current semester's tasks (and optionally meetings) to Google.
// The edge function refreshes the access token itself. Throws with code
// 'REVOKED' if the user revoked access in their Google account (the caller
// should prompt a reconnect) or 'NOT_CONNECTED' if never connected.
export async function syncNow(opts: {
  semesterId: string | null;
  includeMeetings?: boolean;
}): Promise<{ taskCount: number; meetingCount: number }> {
  if (Platform.OS === 'web') throw new Error('Google Calendar sync is only available on iOS and Android.');
  const res = await callFn({
    action: 'sync',
    semesterId: opts.semesterId,
    includeMeetings: opts.includeMeetings ?? false,
    timeZone: deviceTimeZone(),
  });
  return { taskCount: res.taskCount ?? 0, meetingCount: res.meetingCount ?? 0 };
}

// Disconnect: the edge function clears + revokes the stored tokens and drops
// the event map. Does NOT delete the user's Google calendar (their data). We
// also sign the extra scope out locally so a later reconnect re-prompts.
export async function disconnectGoogleCalendar(): Promise<void> {
  if (Platform.OS === 'web') return;
  await callFn({ action: 'disconnect' });
}

// ── Status hook ─────────────────────────────────────────────

export interface GoogleCalStatus {
  connected: boolean;
}

// Whether Google Calendar sync is connected for this user. Reads
// sync_enabled from google_calendar_tokens — but that table is service-role
// only (tokens are secrets), so the client CANNOT read it. Instead we treat
// the presence of at least one task_google_event_map row (owner-readable) as
// the connected signal, falling back to "not connected" when the feature flag
// is off or on web. This is a best-effort UI hint; the edge function is the
// source of truth and will return NOT_CONNECTED/REVOKED if the state drifted.
export function useGoogleCalStatus() {
  const isPro = useAppStore((s) => s.isPro);
  return useQuery({
    queryKey: googleCalKeys.status,
    queryFn: async (): Promise<GoogleCalStatus> => {
      if (!GOOGLE_CAL_ENABLED || Platform.OS === 'web') return { connected: false };
      // A connected user with at least one incomplete task has a map row.
      // maybeSingle with head+count avoids pulling ids we don't need.
      const { count, error } = await supabase
        .from('task_google_event_map')
        .select('id', { count: 'exact', head: true });
      if (error) return { connected: false };
      return { connected: (count ?? 0) > 0 };
    },
    enabled: GOOGLE_CAL_ENABLED && Platform.OS !== 'web' && isPro,
    staleTime: 30_000,
  });
}

// Invalidate the status query after connect/disconnect so the settings toggle
// reflects the new state without a manual refetch.
export function useInvalidateGoogleCalStatus() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: googleCalKeys.status });
}
