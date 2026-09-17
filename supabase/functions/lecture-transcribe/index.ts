import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  AiTask, callGroqTranscription, groqAudioSeconds,
  isProviderConfigured, logAiCall, modelFor, providerFor,
} from '../_shared/ai.ts';
import {
  appBuildFrom, buildPromptHint, clientTooOld, decideLectureLanguage, isDailyQuotaError, keptTranscript,
  requestLanguage, shouldReprobeLanguage, storeNameFor, termsFromNotes, transcriptTimings, type LectureLanguage,
} from '../_shared/lectureTranscript.ts';
import { withRequestLogging, errorFields } from '../_shared/log.ts';

// ── Lecture recording pipeline ──────────────────────────────────────────────
// Structured on tutor-chat/index.ts (CORS, Content-Length guard, JWT check via
// the anon client, service-role admin client, explicit ownership re-checks,
// withRequestLogging). Three actions share one function because they share one
// invariant — the capacity a lecture will consume:
//
//   start   → entitlement + global capacity check, THEN create the row
//   segment → transcribe one ~5-minute chunk
//   cancel  → give the reservation back
//
// WHY `start` EXISTS AT ALL. Both gates it runs (does this free user still have
// their one lecture, and does the shared speech-to-text pool have room today)
// could technically be checked at transcription time. They are checked BEFORE
// the microphone opens because the alternative is telling a student their
// 90-minute lecture cannot be transcribed after they have already recorded it.
// That is unrecoverable — the class is over.
//
// WHY SEGMENTS. A lecture is captured as ~5-minute chunks, so one invocation
// handles ~300s of audio and finishes in seconds, nowhere near the platform
// wall-clock limit. A single 90-minute file would not fit, and an .m4a killed
// before finalization has no moov atom and is unplayable, not merely truncated.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Ceiling on audio-seconds the whole app may transcribe in one UTC day.
 *
 * The provider bills its quota per ORGANIZATION, not per end user: every Semora
 * user draws from one pool. On the free provider tier that pool is 28,800
 * audio-seconds/day — about five 90-minute lectures for the ENTIRE app — so
 * without this ledger a handful of students can deny the feature to everyone
 * else, at no cost to themselves. Raise this secret after moving to a paid
 * provider tier; no migration or redeploy is needed.
 */
const GLOBAL_DAILY_AUDIO_SECONDS = (() => {
  const raw = parseInt(Deno.env.get('LECTURE_DAILY_AUDIO_SECONDS') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 25_000;
})();

/**
 * Longest single recording, in seconds. The app reads this from `start`'s
 * response, so raising it needs no app release.
 *
 * Defaults to 90 minutes. LECTURE_MAX_SECONDS raises it (up to 4 hours) — do
 * that together with LECTURE_DAILY_AUDIO_SECONDS and a paid provider tier,
 * because every recording reserves this much of the shared daily pool when it
 * starts. Old app versions keep their own 90-minute cap regardless.
 */
const MAX_LECTURE_SECONDS = (() => {
  const raw = parseInt(Deno.env.get('LECTURE_MAX_SECONDS') ?? '', 10);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 90 * 60), 4 * 60 * 60) : 90 * 60;
})();

/**
 * A claim older than this is assumed dead and may be taken over.
 *
 * 5 minutes, not the 10 it was (142): an edge invocation cannot outlive 150
 * seconds, and every provider call now runs inside TRANSCRIBE_DEADLINE_MS, so a
 * claim this old has nobody behind it. Mirrors lecture_take_over_arrived_audio.
 */
const STALE_CLAIM_MS = 5 * 60 * 1000;

/** The whole transcription call, retries included, must end inside the isolate's 150s. */
const TRANSCRIBE_DEADLINE_MS = 100_000;

/**
 * When a provider failure stops being "try again later".
 *
 * A 5xx, a timeout or a network error says nothing about the audio, so the part
 * stays reclaimable and the arrival job retries it (142). Only a part that has
 * failed this many times across this long is given up on — a genuine outage
 * lasts hours, not days, and giving up sooner is how audio used to be deleted
 * during one.
 */
const PROVIDER_GIVE_UP_FAILURES = 6;
const PROVIDER_GIVE_UP_MS = 12 * 60 * 60 * 1000;

/**
 * Oldest app allowed to start a recording.
 *
 * LECTURE_MIN_VERSION (e.g. "1.15") is compared with the version apps from 1.15
 * send in x-semora-app-version; LECTURE_MIN_BUILD with the build number older
 * apps carry in their iOS user agent. Both unset means every app may record —
 * the default, and the only safe one until a version that records reliably is
 * live in the App Store. An app that cannot be identified is always allowed.
 */
const MIN_RECORDING_VERSION = Deno.env.get('LECTURE_MIN_VERSION')?.trim() || null;
const MIN_RECORDING_BUILD = (() => {
  const raw = parseInt(Deno.env.get('LECTURE_MIN_BUILD') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
})();

/**
 * Remote kill switches (plan Phase 5). Each new behaviour can be turned off by
 * setting its secret to "off" — no app release, no redeploy of code:
 *   LECTURE_SILENCE_FILTER=off     keep every segment Whisper returns (pre-142)
 *   LECTURE_AUTO_LANGUAGE=off      transcribe in the student's app language (pre-142)
 *   LECTURE_COURSE_VOCABULARY=off  prompt with the title and previous tail only (pre-145)
 *   LECTURE_BACKGROUND_UPLOADS=off the app uploads only while it is open
 * (LECTURE_SECTIONED_NOTES and LECTURE_NOTES live in lecture-study-kit.)
 *
 * And two that stop the feature itself (147, audit): for a provider outage, a
 * billing incident, or a bad build. Both read the same way; unset means on.
 *   LECTURE_RECORDING=off  `start` answers the localized NOT_CONFIGURED 503 —
 *                          the message every shipped app already shows — before
 *                          anything is reserved and before the mic opens.
 *                          Lectures already under way keep uploading and
 *                          transcribing; only new ones are refused.
 *   LECTURE_RECOVERY=off   the arrival job's `recover` calls answer
 *                          {ok, status:'paused'} without spending or refunding
 *                          an attempt, so nothing is written off while the
 *                          provider is down. Parts stay where they are.
 */
const switchOn = (name: string) => (Deno.env.get(name) ?? '').trim().toLowerCase() !== 'off';
const SILENCE_FILTER = switchOn('LECTURE_SILENCE_FILTER');
const AUTO_LANGUAGE = switchOn('LECTURE_AUTO_LANGUAGE');
const COURSE_VOCABULARY = switchOn('LECTURE_COURSE_VOCABULARY');
const BACKGROUND_UPLOADS = switchOn('LECTURE_BACKGROUND_UPLOADS');
const RECORDING_ON = switchOn('LECTURE_RECORDING');
const RECOVERY_ON = switchOn('LECTURE_RECOVERY');

/**
 * A segment that has not reached a terminal state in this long is written off.
 *
 * Generous on purpose: a segment legitimately sits in 'pending' for as long as
 * its upload takes, and a student on bad campus wifi can be slow. This is the
 * backstop that stops one dead upload from stranding an entire lecture, not a
 * timeout anyone should hit.
 */
const STALE_SEGMENT_MS = 30 * 60 * 1000;

/** Free accounts get exactly one charged lecture, ever. */
const FREE_LECTURE_ALLOWANCE = 1;

/**
 * How many recordings one user may have in flight at once.
 *
 * Each in-flight recording holds MAX_LECTURE_SECONDS of the shared daily pool,
 * so without this a single account can reserve the entire day's capacity for
 * every user with a handful of `start` calls and never record a thing.
 */
const MAX_CONCURRENT_LECTURES = 2;

/** A recording untouched for this long is abandoned; its capacity is reclaimed. */
const STALE_RESERVATION_MINUTES = 180;

/**
 * How many times the unattended recovery pass may try one stranded segment.
 *
 * Mirrors lecture_stranded_segments' own default (127). A segment the provider
 * will never accept — a corrupt .m4a, a path that fails the ownership prefix
 * check — would otherwise be retried every twenty minutes forever against a
 * shared daily quota that five lectures exhaust. Past the cap its audio also
 * becomes eligible for deletion: nothing will transcribe it, so keeping it is
 * liability with no purpose.
 */
const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Sanity ceiling on one part's audio.
 *
 * A normal part is ~1.2 MB (5 minutes at 32 kbps). 24 MiB (142, was 12) because
 * an app that cannot change parts while the phone is locked records the whole
 * locked stretch as one part — up to 90 minutes, ~21.6 MB — and refusing it
 * would throw away exactly the audio that fix exists to keep. Stays under the
 * provider's 25 MB free-tier file limit.
 */
const MAX_SEGMENT_BYTES = 24_000_000;

/** Tail of the previous segment fed to the model to repair the boundary word. */
const PROMPT_TAIL_CHARS = 400;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-semora-app-version',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Locale = 'en' | 'es';

// User-facing strings. The client renders server errors verbatim, so every
// message here needs a matching entry in lib/i18n/es.ts — except these, which
// are already localized at the source.
const MSG = {
  freeUsed: {
    en: "You've used your free action. Upgrade to Pro for unlimited lectures and syllabus scans.",
    es: 'Ya usaste tu acción gratuita. Hazte Pro para grabar clases y escanear programas sin límite.',
  },
  atCapacity: {
    en: 'Lecture transcription is at capacity today. Please try again tomorrow.',
    es: 'La transcripción de clases alcanzó su capacidad de hoy. Inténtalo mañana.',
  },
  notConfigured: {
    en: 'Lecture transcription is not available right now. Please try again later.',
    es: 'La transcripción de clases no está disponible ahora. Inténtalo más tarde.',
  },
  transient: {
    en: 'Service temporarily unavailable',
    es: 'El servicio no está disponible temporalmente.',
  },
  transcribeFailed: {
    en: "Couldn't transcribe this part of your lecture. Please try again.",
    es: 'No se pudo transcribir esta parte de tu clase. Inténtalo de nuevo.',
  },
  quotaHit: {
    en: 'Lecture transcription is busy right now. Your recording is saved — try again in a few minutes.',
    es: 'La transcripción de clases está saturada. Tu grabación está guardada; inténtalo en unos minutos.',
  },
  // 147: a spent DAILY quota is not "a few minutes". The arrival job retries
  // the part on its own once the quota resets, so the student need do nothing.
  quotaDay: {
    en: "Today's transcription capacity is used up — your recording is saved and will be transcribed automatically.",
    es: 'La capacidad de transcripción de hoy se agotó. Tu grabación está guardada y se transcribirá automáticamente.',
  },
  noAudio: {
    en: 'That part of the recording is missing its audio and cannot be transcribed.',
    es: 'A esa parte de la grabación le falta el audio y no se puede transcribir.',
  },
  tooManyInFlight: {
    en: 'You already have a lecture still processing. Let it finish before starting another.',
    es: 'Ya tienes una clase procesándose. Espera a que termine antes de empezar otra.',
  },
  tooLong: {
    en: `This recording has reached its ${MAX_LECTURE_SECONDS / 60}-minute limit.`,
    es: `Esta grabación alcanzó su límite de ${MAX_LECTURE_SECONDS / 60} minutos.`,
  },
  notFound: {
    en: 'Lecture not found',
    es: 'No se encontró esta clase.',
  },
  // Shown by every app version: they all display the server's message when a
  // recording cannot start. 'App Store' is replaced by the store the app came
  // from (updateRequiredMessage) — Android users have no App Store to go to.
  updateRequired: {
    en: 'Please update Semora from the App Store to record lectures. The new version keeps recording while your phone is locked.',
    es: 'Actualiza Semora desde la App Store para grabar clases. La nueva versión sigue grabando con el teléfono bloqueado.',
  },
} as const;

const t = (key: keyof typeof MSG, locale: Locale) => MSG[key][locale];

/** 147: the update prompt names the Play Store when the user agent says Android. */
const updateRequiredMessage = (locale: Locale, userAgent: string | null, platform: string | null) =>
  t('updateRequired', locale).replace('App Store', storeNameFor(userAgent, platform));

/** Mirrors lecture_transcript_words (138): the words, without gap markers or layout. */
const GAP_MARKERS = /\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]/g;
function transcriptWords(text: string): string {
  return text.replace(GAP_MARKERS, ' ').replace(/\s+/g, ' ').trim();
}

serve(withRequestLogging('lecture-transcribe', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. Bound the body. Every action carries only ids and small scalars.
    const MAX_BODY_BYTES = 4 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) return jsonResponse({ error: 'Content-Length required' }, 411);
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Request too large' }, 413);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Authenticate the caller.
    //
    // TWO CALLERS, ONE OF WHICH HAS NO USER. Everything a student does arrives
    // with their JWT. The unattended recovery pass (127) does not have one and
    // cannot get one — it is a cron tick acting on a segment whose owner it
    // reads from the row — so it presents the same shared lecture secret the
    // notes worker and the retention sweep already use.
    //
    // That door opens onto EXACTLY ONE action. `recover` cannot start a
    // lecture, cancel one, or name its own user; it takes a segment id and
    // derives everything else from the database. Letting the secret stand in
    // for a session on `start` or `segment` would mean a leaked scheduler
    // credential could transcribe against any account.
    const cronSecret = req.headers.get('x-semora-lecture-cron-secret');
    let userId: string | null = null;
    let viaCron = false;

    if (cronSecret) {
      const { data: expected, error: secretErr } = await adminClient.rpc('read_lecture_cron_secret');
      if (secretErr || typeof expected !== 'string' || cronSecret !== expected) {
        log.warn('cron_secret_rejected');
        return jsonResponse({ error: 'Unauthorized scheduler' }, 401);
      }
      viaCron = true;
    } else {
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
      userId = userData.user.id;
      log.setUser(userId);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const locale: Locale = body.locale === 'es' ? 'es' : 'en';
    const action = typeof body.action === 'string' ? body.action : '';

    // The scheduler may do one thing; a student may do everything but that.
    if (viaCron && action !== 'recover') {
      return jsonResponse({ error: 'Unknown action' }, 400);
    }
    if (!viaCron && action === 'recover') {
      return jsonResponse({ error: 'Unknown action' }, 400);
    }

    // Only the actions that actually call the provider are gated on its key.
    // Gating the whole function meant `cancel` also 503'd when the key was
    // missing — leaving a user unable to release a reservation they were
    // holding, which is the one thing they should always be able to do.
    if (
      (action === 'start' || action === 'segment' || action === 'recover') &&
      !isProviderConfigured(providerFor(AiTask.transcription))
    ) {
      // Deliberately loud in logs, generic to the user: a missing key is our
      // deployment mistake, not something a student can act on.
      log.error('provider_not_configured', { provider: providerFor(AiTask.transcription) });
      return jsonResponse({ error: t('notConfigured', locale), code: 'NOT_CONFIGURED' }, 503);
    }

    // Handled before the Pro gate below because it has no user yet: `recover`
    // reads the owner off the segment row and runs its own is_pro lookup.
    if (action === 'recover') return await handleRecover(adminClient, body, locale, log);

    if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);

    // 2. Pro gate. Fail CLOSED as transient (503) on an RPC blip so a paying
    //    user is never demoted to the free allowance by a database hiccup.
    const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
    if (proErr) {
      log.error('is_pro_failed', errorFields(proErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    const isPro = proResult === true;

    if (action === 'start') {
      return await handleStart(adminClient, userId, body, locale, isPro, log, {
        versionHeader: req.headers.get('x-semora-app-version'),
        userAgent: req.headers.get('user-agent'),
        platform: req.headers.get('x-semora-platform'),
      });
    }
    if (action === 'segment') return await handleSegment(adminClient, userId, body, locale, isPro, log);
    if (action === 'finalize') return await handleFinalize(adminClient, userId, body, locale, log);
    if (action === 'cancel') return await handleCancel(adminClient, userId, body, locale, log);

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));

/**
 * How many completed lectures this user has already been charged for,
 * ignoring one lecture in progress.
 *
 * Counts `lecture_usage_log`, which only the service role can write, NOT
 * `lecture_recordings`. Counting the recordings table is the mistake
 * `enforce_free_scan_limit` makes: the user can delete their own rows, so
 * delete-and-retry mints unlimited free lectures. The cost is spent when the
 * audio is transcribed, so the quota is consumed by the CALL and must be
 * recorded somewhere the caller cannot reach.
 *
 * `exceptLectureId` keeps a lecture already under way from locking out its own
 * remaining segments.
 */
async function chargedLectureCount(
  admin: any,
  userId: string,
  exceptLectureId?: string | null,
): Promise<number | null> {
  let q = admin
    .from('lecture_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'success');
  if (exceptLectureId) q = q.neq('lecture_id', exceptLectureId);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

/**
 * Has this account spent its ONE free AI action, on either side?
 *
 * The free tier is a single action for the life of the account (migration
 * 071): one syllabus scan OR one lecture. So a student who already scanned a
 * syllabus has nothing left for a lecture, and the reverse.
 *
 * Reads the two ledgers directly rather than calling free_action_used(),
 * because that function cannot express `exceptLectureId` — and excluding the
 * lecture in progress is what keeps an authorized recording able to finish.
 *
 * Returns null on a read failure so callers can fail closed as TRANSIENT
 * rather than either granting a second free action or accusing a student of
 * spending one they still have.
 */
async function freeActionSpent(
  admin: any,
  userId: string,
  exceptLectureId?: string | null,
): Promise<boolean | null> {
  const lectures = await chargedLectureCount(admin, userId, exceptLectureId);
  if (lectures === null) return null;
  if (lectures >= FREE_LECTURE_ALLOWANCE) return true;

  const { count, error } = await admin
    .from('scan_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'success');
  if (error) return null;
  return (count ?? 0) > 0;
}

// ── start ───────────────────────────────────────────────────────────────────// Runs BEFORE the microphone opens. Creates the row the client will hang
// segments off, and reserves the capacity the recording may consume.
async function handleStart(
  admin: any,
  userId: string,
  body: Record<string, unknown>,
  locale: Locale,
  isPro: boolean,
  log: any,
  client: { versionHeader: string | null; userAgent: string | null; platform: string | null },
): Promise<Response> {
  const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const courseId = typeof body.courseId === 'string' && body.courseId ? body.courseId : null;

  // 147: recording switched off (LECTURE_RECORDING=off). The same answer as a
  // missing provider key, which every shipped app words as "not available
  // right now" — before any reservation, before the microphone.
  if (!RECORDING_ON) {
    log.warn('recording_switched_off');
    return jsonResponse({ error: t('notConfigured', locale), code: 'NOT_CONFIGURED' }, 503);
  }

  // An app too old to record reliably is asked to update BEFORE anything is
  // reserved. Every shipped version shows this message as-is. Unidentifiable
  // clients are always let through: a wrong guess here blocks a student from
  // recording a class, which is worse than an older recorder.
  const build = appBuildFrom(client.versionHeader, client.userAgent);
  const tooOld = clientTooOld({
    versionHeader: client.versionHeader,
    userAgent: client.userAgent,
    minVersion: MIN_RECORDING_VERSION,
    minBuild: MIN_RECORDING_BUILD,
  });
  if (tooOld === true) {
    log.info('recording_app_too_old', { build, version: client.versionHeader });
    return jsonResponse({ error: updateRequiredMessage(locale, client.userAgent, client.platform), code: 'UPDATE_REQUIRED' }, 426);
  }

  if (!isPro) {
    const spent = await freeActionSpent(admin, userId);
    if (spent === null) {
      log.error('usage_count_failed');
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (spent) {
      log.info('free_action_exhausted');
      return jsonResponse({ error: t('freeUsed', locale), code: 'FREE_LECTURE_USED' }, 402);
    }
    // The one free lecture is reserved the moment it STARTS, not when its
    // first part is charged (audit): a second lecture started while the first
    // was still on the phone used to be authorised, then refused part by part
    // once the first charged — and sat "Uploading" forever with its audio.
    const { data: freeInFlight } = await admin
      .from('lecture_recordings')
      .select('id')
      .eq('user_id', userId)
      .eq('source', 'recording')
      .in('status', ['recording', 'uploading', 'transcribing'])
      .order('created_at', { ascending: false })
      .limit(1);
    if ((freeInFlight ?? []).length > 0) {
      log.info('free_lecture_in_flight');
      // The lecture's id travels with the refusal so the app can open it.
      return jsonResponse({ error: t('tooManyInFlight', locale), code: 'TOO_MANY_IN_FLIGHT', lectureId: freeInFlight![0].id }, 409);
    }
  }

  // Ownership of the course, if one was named. service_role bypasses RLS, so
  // this check is the only thing standing between a forged courseId and a
  // cross-tenant write. (The DB trigger backstops it, but a clean 404 beats a
  // 500 from a raised exception.)
  if (courseId) {
    const { data: course, error: courseErr } = await admin
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('user_id', userId)
      .maybeSingle();
    if (courseErr) {
      log.error('course_lookup_failed', errorFields(courseErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (!course) return jsonResponse({ error: 'Course not found' }, 404);
  }

  // Reclaim capacity from recordings that were abandoned (app killed, phone
  // died, student walked out). Done here because this is both the moment
  // capacity matters and a request that is already doing work — there is no
  // scheduler in this stack to do it on a timer.
  const { data: reclaimed } = await admin.rpc('reclaim_stale_lecture_reservations', {
    p_older_than_minutes: STALE_RESERVATION_MINUTES,
  });
  if (typeof reclaimed === 'number' && reclaimed > 0) {
    log.info('reservations_reclaimed', { seconds: reclaimed });
  }

  // One user may not hold the whole day's pool. Each in-flight recording holds
  // the 90-minute worst case, so without this cap a handful of `start` calls
  // from one account denies the feature to everyone else.
  const { count: inFlight, error: inFlightErr } = await admin
    .from('lecture_recordings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('reserved_seconds', 0)
    .in('status', ['recording', 'uploading', 'transcribing']);
  if (inFlightErr) {
    log.error('in_flight_count_failed', errorFields(inFlightErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if ((inFlight ?? 0) >= MAX_CONCURRENT_LECTURES) {
    log.warn('too_many_in_flight', { in_flight: inFlight });
    const { data: newest } = await admin
      .from('lecture_recordings')
      .select('id')
      .eq('user_id', userId)
      .eq('source', 'recording')
      .in('status', ['recording', 'uploading', 'transcribing'])
      .order('created_at', { ascending: false })
      .limit(1);
    return jsonResponse({ error: t('tooManyInFlight', locale), code: 'TOO_MANY_IN_FLIGHT', lectureId: newest?.[0]?.id ?? null }, 409);
  }

  // Create the row first, then reserve against it. The reservation is stamped
  // on the row inside the same transaction as the pool debit, so capacity can
  // never be taken without something recording that it was taken.
  const { data: lecture, error: insertErr } = await admin
    .from('lecture_recordings')
    .insert({
      user_id: userId,
      course_id: courseId,
      title: rawTitle || (locale === 'es' ? 'Clase' : 'Lecture'),
      status: 'recording',
      // 142: a Pro lecture may finish if Pro lapses mid-lecture. Server-owned;
      // no client can write it.
      authorized_pro_at: isPro ? new Date().toISOString() : null,
      app_build: client.versionHeader?.slice(0, 32) ?? (build !== null ? String(build) : null),
    })
    .select('id')
    .single();

  if (insertErr || !lecture) {
    log.error('lecture_insert_failed', errorFields(insertErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  const { data: reserved, error: reserveErr } = await admin.rpc('reserve_lecture_for_recording', {
    p_lecture_id: lecture.id,
    p_seconds: MAX_LECTURE_SECONDS,
    p_cap_seconds: GLOBAL_DAILY_AUDIO_SECONDS,
  });
  if (reserveErr || reserved !== true) {
    // No capacity: drop the row we just made rather than leaving an unusable
    // lecture in the user's list.
    await admin.from('lecture_recordings').delete().eq('id', lecture.id);
    if (reserveErr) {
      log.error('reserve_failed', errorFields(reserveErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    log.warn('global_capacity_exhausted', { cap: GLOBAL_DAILY_AUDIO_SECONDS });
    return jsonResponse({ error: t('atCapacity', locale), code: 'AT_CAPACITY' }, 503);
  }

  // Another phone on this account recording right now? Two devices recording
  // the same class charge twice and split the audio; the app warns about it
  // rather than refusing (a student may genuinely be recording two sections).
  const liveSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { count: otherLive } = await admin
    .from('lecture_recordings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('id', lecture.id)
    .in('capture_state', ['recording', 'paused'])
    .gt('last_heartbeat_at', liveSince)
    .in('status', ['recording', 'uploading', 'transcribing']);

  log.info('lecture_started', { lecture_id: lecture.id, has_course: Boolean(courseId), is_pro: isPro, build });
  return jsonResponse(
    {
      lectureId: lecture.id,
      maxSeconds: MAX_LECTURE_SECONDS,
      reservedSeconds: MAX_LECTURE_SECONDS,
      otherLiveRecording: (otherLive ?? 0) > 0,
      backgroundUploads: BACKGROUND_UPLOADS,
    },
    200,
  );
}

// ── cancel ──────────────────────────────────────────────────────────────────
async function handleCancel(
  admin: any,
  userId: string,
  body: Record<string, unknown>,
  locale: Locale,
  log: any,
): Promise<Response> {
  const lectureId = typeof body.lectureId === 'string' ? body.lectureId : null;
  if (!lectureId) return jsonResponse({ error: 'lectureId is required' }, 400);

  const { data: lecture } = await admin
    .from('lecture_recordings')
    .select('id, status')
    .eq('id', lectureId)
    .eq('user_id', userId)
    .maybeSingle();
  // Already gone is a success — cancel must be safe to call twice.
  if (!lecture) return jsonResponse({ ok: true }, 200);

  // The amount released is whatever this specific lecture is holding, read and
  // zeroed under a row lock. The caller does not get to say how much to refund:
  // an earlier version took a client-supplied `reservedSeconds` and could be
  // replayed to zero out the whole day's ledger, handing free capacity back
  // against other users' live reservations.
  const { data: released, error: releaseErr } = await admin.rpc('release_lecture_reservation', {
    p_lecture_id: lectureId,
  });
  if (releaseErr) {
    log.error('release_failed', errorFields(releaseErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  // Releasing the reservation is not enough on its own: the row itself stays,
  // and a lecture still marked 'recording' with nothing in it renders in the
  // Lectures list as a permanently "Uploading" ghost the user cannot clear.
  // A start that failed after the row was created produced one of these EVERY
  // time it was retried. Cancel means abandon, so delete it — but only while it
  // is still un-finalized, so this can never destroy a finished transcript.
  if (lecture.status === 'recording') {
    const { data: segments } = await admin
      .from('lecture_segments')
      .select('storage_path')
      .eq('lecture_id', lectureId)
      .eq('user_id', userId);
    // Abandon means abandon: the student asked for this recording to go away,
    // so every object goes, transcribed or not.
    await deleteLectureAudio(admin, lectureId, segments ?? [], log, { includeUnfinished: true });
    const { error: delErr } = await admin
      .from('lecture_recordings')
      .delete()
      .eq('id', lectureId)
      .eq('user_id', userId)
      .eq('status', 'recording');
    if (delErr) {
      // The reservation is already back, which is the part that costs money.
      // A stray row is worth logging, not failing the request over.
      log.warn('cancel_delete_failed', errorFields(delErr));
    }
  }

  log.info('lecture_cancelled', { lecture_id: lectureId, released: released ?? 0 });
  return jsonResponse({ ok: true, released: released ?? 0 }, 200);
}

// ── finalize ────────────────────────────────────────────────────────────────
/**
 * Ask the server to complete a lecture whose capture is done.
 *
 * WHY THIS EXISTS. `maybeFinalize` only assembles a transcript once
 * `segment_count` is set, and the client can only set it after capture ends —
 * which is AFTER the last segment's transcription has usually already run. The
 * final `segment` call therefore saw `segment_count = 0`, declined to finalize,
 * and nothing ever asked again: the lecture sat at 'uploading' forever with
 * every segment marked done. This is the client's explicit "capture is complete,
 * check again" nudge, and it is idempotent — an already-finished lecture just
 * reports its state.
 */
async function handleFinalize(
  admin: any,
  userId: string,
  body: Record<string, unknown>,
  locale: Locale,
  log: any,
): Promise<Response> {
  const lectureId = typeof body.lectureId === 'string' ? body.lectureId : null;
  if (!lectureId) return jsonResponse({ error: 'lectureId is required' }, 400);

  const { data: lecture, error } = await admin
    .from('lecture_recordings')
    .select('id, user_id, course_id, title, segment_count, status')
    .eq('id', lectureId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    log.error('finalize_lookup_failed', errorFields(error));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!lecture) return jsonResponse({ error: 'Lecture not found' }, 404);

  return await maybeFinalize(admin, userId, lecture, locale, log);
}

// ── segment ─────────────────────────────────────────────────────────────────
async function handleSegment(
  admin: any,
  userId: string,
  body: Record<string, unknown>,
  locale: Locale,
  isPro: boolean,
  log: any,
  recovery = false,
): Promise<Response> {
  const lectureId = typeof body.lectureId === 'string' ? body.lectureId : null;
  const segmentId = typeof body.segmentId === 'string' ? body.segmentId : null;
  if (!lectureId || !segmentId) {
    return jsonResponse({ error: 'lectureId and segmentId are required' }, 400);
  }

  const { data: lecture, error: lectureErr } = await admin
    .from('lecture_recordings')
    .select('id, user_id, course_id, title, segment_count, status, authorized_pro_at, language')
    .eq('id', lectureId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lectureErr) {
    log.error('lecture_lookup_failed', errorFields(lectureErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!lecture) return jsonResponse({ error: 'Lecture not found' }, 404);

  // 142: a lecture authorized while the student was Pro finishes even if Pro
  // lapses mid-lecture. The stamp is written only by `start`, only after the
  // server itself confirmed Pro, and no client can write it — so this is not a
  // way around the free allowance, and an unstamped lecture gets no exemption.
  const authorizedAsPro = Boolean(lecture.authorized_pro_at);

  // Re-check the free allowance here too, not just at start: `start` may have
  // run days ago, or a second lecture may have completed since. Excluding this
  // lecture keeps an authorized recording able to finish.
  //
  // DELIBERATELY lecture-only — this does NOT use freeActionSpent(). A student
  // who started a recording and then scanned a syllabus would otherwise be
  // told, with the audio already captured, that it cannot be transcribed. This
  // file's own rule: refusing a lecture AFTER it was recorded is the worst
  // possible failure. `start` is where the shared allowance is enforced; once
  // a recording is authorized, only another completed LECTURE can stop it.
  //
  // A RECOVERY IS NOT EXEMPT, and an earlier draft of 127 made it exempt on the
  // reasoning that refusing already-captured audio is this file's worst
  // failure. That reasoning is right and the exemption was still wrong, because
  // chargedLectureCount already encodes it: it EXCLUDES the lecture being
  // worked on, so recovering a segment of the lecture the student was charged
  // for passes this check on its own. The only thing an exemption would have
  // added is the case that must not pass — a free user who starts a second
  // lecture before the first charges, kills the app mid-upload, and collects a
  // second free transcription twenty minutes later.
  if (!isPro && !authorizedAsPro) {
    const used = await chargedLectureCount(admin, userId, lectureId);
    if (used === null) {
      log.error('usage_count_failed');
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (used >= FREE_LECTURE_ALLOWANCE) {
      // Audit: refusing part after part left a lecture "Uploading" forever with
      // its audio kept. The lecture fails once, and its parts are handed to
      // retention (attempts spent, so nothing dispatches them again).
      await failLectureForAllowance(admin, lectureId, 'FREE_LECTURE_USED', log);
      return jsonResponse({ error: t('freeUsed', locale), code: 'FREE_LECTURE_USED' }, 402);
    }
  }

  // CLAIM. This conditional update is the entire concurrency story: whichever
  // invocation flips 'uploaded' → 'transcribing' owns the segment. A duplicate
  // call (user taps retry, client reconnects) matches zero rows and no-ops
  // instead of paying the provider twice. A claim older than STALE_CLAIM_MS is
  // reclaimable, which is what makes a killed invocation recoverable without a
  // queue or a dead-letter table.
  //
  // A RECOVERY CLAIMS MORE. The normal filter is deliberately narrow — only a
  // segment the client said it finished uploading — and that narrowness is the
  // bug 127 fixes: a segment whose upload landed but whose status flip did not
  // stays 'pending' and is unclaimable forever. `failed` is included too,
  // because maybeFinalize's thirty-minute write-off can beat the recovery pass
  // to a segment whose audio is perfectly fine. Both are safe here because the
  // caller is a scheduler acting on rows the database itself selected as
  // stranded, and because recovery_attempts bounds how often it may try.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const claimable = recovery
    ? `status.eq.pending,status.eq.uploaded,status.eq.failed,and(status.eq.transcribing,claimed_at.lt.${staleBefore})`
    : `status.eq.uploaded,and(status.eq.transcribing,claimed_at.lt.${staleBefore})`;
  const { data: claimed, error: claimErr } = await admin
    .from('lecture_segments')
    .update({ status: 'transcribing', claimed_at: new Date().toISOString() })
    .eq('id', segmentId)
    .eq('lecture_id', lectureId)
    .eq('user_id', userId)
    .or(claimable)
    .select('id, seq, storage_path, seconds, provider_failures, first_provider_failure_at')
    .maybeSingle();

  if (claimErr) {
    log.error('claim_failed', errorFields(claimErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!claimed) {
    // Someone else owns it, or it is already done. Both are success from the
    // caller's point of view.
    log.info('segment_not_claimable', { segment_id: segmentId });
    return await maybeFinalize(admin, userId, lecture, locale, log);
  }
  if (!claimed.storage_path) {
    await admin.from('lecture_segments')
      .update({ status: 'failed' }).eq('id', segmentId);
    log.warn('segment_missing_audio', { segment_id: segmentId, seq: claimed.seq });
    return jsonResponse({ error: t('noAudio', locale), code: 'SEGMENT_NO_AUDIO' }, 422);
  }

  // storage_path is written by the CLIENT, and it is about to be handed to a
  // service-role download that bypasses RLS. Without this check a crafted path
  // reads any object in the bucket — every other user's lecture audio.
  const requiredPrefix = `${userId}/${lectureId}/`;
  if (!claimed.storage_path.startsWith(requiredPrefix)) {
    await admin.from('lecture_segments').update({ status: 'failed' }).eq('id', segmentId);
    log.error('segment_path_rejected', { segment_id: segmentId, seq: claimed.seq });
    return jsonResponse({ error: t('noAudio', locale), code: 'SEGMENT_NO_AUDIO' }, 422);
  }

  // Cap the audio ONE lecture may consume. `start` reserves the 90-minute worst
  // case, but nothing stopped a client from hanging a thousand segments off a
  // single authorized lecture — 80+ hours of transcription against a shared
  // pool that still read as one lecture's worth of usage.
  const { data: doneSegments } = await admin
    .from('lecture_segments')
    .select('seconds')
    .eq('lecture_id', lectureId)
    .eq('status', 'done');
  const alreadyTranscribed = (doneSegments ?? [])
    .reduce((sum: number, s: any) => sum + (s.seconds || 0), 0);
  if (alreadyTranscribed >= MAX_LECTURE_SECONDS) {
    // Beyond the limit: this part and any later ones are given to retention
    // and the lecture is finished from what was transcribed.
    await admin.from('lecture_segments').update({ status: 'failed', recovery_attempts: 3 }).eq('id', segmentId);
    log.warn('lecture_length_cap_hit', { lecture_id: lectureId, seconds: alreadyTranscribed });
    await maybeFinalize(admin, userId, lecture, locale, log).catch(() => {});
    return jsonResponse({ error: t('tooLong', locale), code: 'LECTURE_TOO_LONG' }, 413);
  }

  // The lecture is now demonstrably being transcribed. Recording this is what
  // makes the list screen's "Transcribing" state true, and what the in-flight
  // reservation cap counts.
  //
  // 'failed' too (138): the stall sweep fails a lecture whose parts stopped
  // arriving, and a part that reaches us afterwards proves it was not over.
  // Left 'failed', that part was transcribed and then shown to no one.
  await admin.from('lecture_recordings')
    .update({ status: 'transcribing', error_code: null })
    .eq('id', lectureId)
    .in('status', ['recording', 'uploading', 'failed']);

  // ── Keep the row's clock honest while audio is still arriving ────────────
  // The update above is guarded, correctly: it must never drag a lecture that
  // has moved on back to 'transcribing'. But the guard means it matches ZERO
  // rows from the second segment onward, and a matched-nothing update fires no
  // trigger — so `updated_at` froze at the first segment and stayed there for
  // the rest of the recording, however long it ran.
  //
  // Everything that asks "is this lecture still alive?" reads that column, and
  // all of them were being lied to:
  //
  //   - sweep_stalled_lectures (082) finalises 'transcribing' rows untouched
  //     for 15 minutes. Every recording longer than that was being finalised
  //     MID-RECORDING, on a partial transcript.
  //   - isLectureStalled (lib/lectures.ts:106) marks the same rows stalled, and
  //     the detail screen stops polling when it does — so the student's own
  //     screen gave up on a lecture that was still running.
  //   - request_pending_lecture_notes (109) treats a quiet row as settled, and
  //     wrote notes from that partial transcript. On 2026-09-02 lecture
  //     a4a6aff3 got notes covering roughly a third of a 37,323-character
  //     class, and nothing regenerates them once notes_md is set.
  //
  // The premature finalise was survivable on its own: finishLecture writes the
  // final state with no status guard, so a student who presses stop undoes it
  // and the full transcript is rebuilt. That is why this went unnoticed for so
  // long. It stopped being survivable the moment something else started acting
  // on 'transcribed'.
  //
  // A separate statement rather than folding it into the update above, because
  // the two have genuinely different guards: the status may only move forward
  // from 'recording'/'uploading', while the clock must keep ticking through
  // 'transcribing' as well. Cheap — one row, once per five-minute segment.
  await admin.from('lecture_recordings')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', lectureId)
    .in('status', ['recording', 'uploading', 'transcribing']);

  // Previous text's tail keeps terminology stable across the boundary.
  //
  // 142: the nearest EARLIER part that has text, not strictly seq - 1. When the
  // part before this one is missing, silent or still in flight, the hint used to
  // be dropped entirely, and the part after every gap lost its terminology.
  let tail = '';
  if (claimed.seq > 0) {
    const { data: prev } = await admin
      .from('lecture_segments')
      .select('transcript')
      .eq('lecture_id', lectureId)
      .eq('status', 'done')
      .lt('seq', claimed.seq)
      .neq('transcript', '')
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    tail = typeof prev?.transcript === 'string'
      ? prev.transcript.slice(-PROMPT_TAIL_CHARS)
      : '';
  }
  // 145: and the course's own vocabulary. Best effort — a lookup that fails
  // costs accuracy, never the part.
  const vocabulary = COURSE_VOCABULARY
    ? await courseVocabulary(admin, userId, lecture.course_id ?? null, lectureId).catch(() => null)
    : null;
  const promptHint = buildPromptHint({
    title: typeof lecture.title === 'string' ? lecture.title : null,
    courseName: vocabulary?.courseName,
    instructor: vocabulary?.instructor,
    terms: vocabulary?.terms,
    tail,
  });

  const { data: file, error: dlErr } = await admin.storage
    .from('lectures')
    .download(claimed.storage_path);
  if (dlErr || !file) {
    await admin.from('lecture_segments').update({ status: 'uploaded', claimed_at: null }).eq('id', segmentId);
    log.error('segment_download_failed', errorFields(dlErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SEGMENT_BYTES) {
    await admin.from('lecture_segments').update({ status: 'failed' }).eq('id', segmentId);
    log.warn('segment_bad_size', { segment_id: segmentId, bytes: bytes.byteLength });
    return jsonResponse({ error: t('noAudio', locale), code: 'SEGMENT_NO_AUDIO' }, 422);
  }

  // The lecture's own language once it is known; until then the provider
  // detects it (142). The app's UI language is NOT the language of the class.
  const lectureLanguage = lecture.language as LectureLanguage | 'mixed' | null;
  const lockedLanguage = requestLanguage(lectureLanguage);
  // 147: the lock is not permanent. Every fourth part is sent without it, so a
  // class that changes language is heard doing so; two such parts in another
  // language make the lecture 'mixed' (decideLectureLanguage). Not with the
  // auto-language switch off, where every part is forced to the app language.
  const reprobing = AUTO_LANGUAGE && Boolean(lockedLanguage) && shouldReprobeLanguage(claimed.seq);
  // With LECTURE_AUTO_LANGUAGE=off, the student's app language, as before 142.
  const forcedRequestLanguage = reprobing ? undefined : (lockedLanguage ?? (AUTO_LANGUAGE ? undefined : locale));
  const deadline = { deadlineMs: TRANSCRIBE_DEADLINE_MS, attemptTimeoutMs: 90_000 };
  let result = await callGroqTranscription({
    audio: bytes,
    fileName: `seg_${String(claimed.seq).padStart(3, '0')}.m4a`,
    mimeType: 'audio/m4a',
    language: forcedRequestLanguage,
    promptHint,
    label: 'lecture-segment',
    deadline,
  });
  let kept = result.ok ? keptTranscript(result.data, { filter: SILENCE_FILTER }) : null;

  // Detection that lands on neither English nor Spanish, on a part with real
  // speech, is far more often a misheard quiet start than a class in Welsh.
  // One retry in the student's own language, inside the same time budget.
  // …but not for a class in a language Semora does not write notes in: after
  // two parts heard as something else, the retry stops (audit: a French class
  // paid for every part twice, forever).
  const heardOther = result.ok && kept && !forcedRequestLanguage && lectureLanguage !== 'mixed' &&
    kept.language === null && (kept.speechSeconds ?? 0) >= 5;
  const otherCount = heardOther
    ? ((await admin.from('lecture_segments').select('id', { count: 'exact', head: true })
        .eq('lecture_id', lectureId).eq('detected_language', 'other')).count ?? 0)
    : 0;
  if (heardOther && otherCount >= 2) {
    log.info('segment_language_other_kept', { segment_id: segmentId, detected: kept!.rawLanguage });
  }
  if (heardOther && otherCount < 2) {
    const retry = await callGroqTranscription({
      audio: bytes,
      fileName: `seg_${String(claimed.seq).padStart(3, '0')}.m4a`,
      mimeType: 'audio/m4a',
      // 147: a re-probed part of a locked lecture retries in the lecture's language.
      language: lockedLanguage ?? locale,
      promptHint,
      label: 'lecture-segment-language-retry',
      deadline: { deadlineMs: Math.max(5_000, TRANSCRIBE_DEADLINE_MS - result.durationMs), attemptTimeoutMs: 90_000 },
    });
    // Usage: the call that is being replaced is counted here; whichever result
    // is kept is counted once, below. A failed retry is counted as a failure.
    await admin.rpc('lecture_count_transcription', {
      p_seconds: retry.ok ? Math.round(groqAudioSeconds(result.data) ?? 0) : 0, p_failed: !retry.ok,
    }).then(undefined, () => {});
    if (retry.ok) {
      log.info('segment_language_retried', { segment_id: segmentId, detected: kept?.rawLanguage ?? null, retried_as: locale });
      result = retry;
      kept = { ...keptTranscript(retry.data, { filter: SILENCE_FILTER }), language: null };
    }
  }

  // 147: a re-probe heard the OTHER supported language. The disagreement counts
  // toward 'mixed' (below), but until a second one confirms it, this part's
  // TEXT is taken in the lecture's language — a quiet start misheard as the
  // other language used to be written as nonsense.
  if (
    reprobing && result.ok && kept && lockedLanguage && kept.language &&
    kept.language !== lockedLanguage && lectureLanguage !== 'mixed'
  ) {
    const heardAs = kept.language;
    const rerun = await callGroqTranscription({
      audio: bytes,
      fileName: `seg_${String(claimed.seq).padStart(3, '0')}.m4a`,
      mimeType: 'audio/m4a',
      language: lockedLanguage,
      promptHint,
      label: 'lecture-segment-locked-rerun',
      deadline: { deadlineMs: Math.max(5_000, TRANSCRIBE_DEADLINE_MS - result.durationMs), attemptTimeoutMs: 90_000 },
    });
    await admin.rpc('lecture_count_transcription', {
      p_seconds: rerun.ok ? Math.round(groqAudioSeconds(result.data) ?? 0) : 0, p_failed: !rerun.ok,
    }).then(undefined, () => {});
    if (rerun.ok) {
      log.info('segment_language_reprobe_disagreed', { segment_id: segmentId, heard: heardAs, kept_as: lockedLanguage });
      result = rerun;
      kept = { ...keptTranscript(rerun.data, { filter: SILENCE_FILTER }), language: heardAs };
    }
  }

  const model = modelFor(AiTask.transcription);
  const provider = providerFor(AiTask.transcription);

  if (!result.ok || !kept) {
    const rateLimited = result.status === 429;
    await logAiCall(admin, userId, {
      task: AiTask.transcription,
      provider,
      model,
      status: rateLimited ? 'rate_limited' : 'failed',
      errorCode: result.timedOut ? 'timeout' : String(result.status),
      // Groq's own words about the refusal, kept past the ~24h log retention.
      errorDetail: result.errorBody,
      durationMs: result.durationMs,
      attempts: result.attempts,
    });
    await admin.rpc('lecture_count_transcription', { p_seconds: 0, p_failed: true })
      .then(undefined, () => {});

    if (rateLimited) {
      // Leave the segment reclaimable so the client can retry later without
      // losing the audio, and do NOT charge the user's free lecture.
      // first_provider_failure_at marks it as waiting on the provider, so the
      // 30-minute write-off leaves it alone (review finding). provider_failures
      // is NOT raised: a quota wait is not a failure. The sweep counts the part
      // as in flight for PROVIDER_GIVE_UP_MS from that stamp (147); after that
      // the lecture is finished from its done parts and this part keeps being
      // retried by the arrival job, folding in when it succeeds.
      await admin.from('lecture_segments')
        .update({
          status: 'uploaded', claimed_at: null,
          first_provider_failure_at: claimed.first_provider_failure_at ?? new Date().toISOString(),
        }).eq('id', segmentId);
      // 147: a spent DAILY quota is worded as what it is — the provider says so
      // in its refusal, or today's own ledger is at the cap — so the student
      // is not told to try again in a few minutes for the rest of the day.
      const dailyQuota = isDailyQuotaError(result.errorBody) || await dayCapacitySpent(admin);
      if (dailyQuota) {
        log.warn('provider_daily_quota_spent', { segment_id: segmentId });
        return jsonResponse({ error: t('quotaDay', locale), code: 'PROVIDER_QUOTA_DAY' }, 429);
      }
      log.warn('provider_rate_limited', { segment_id: segmentId });
      return jsonResponse({ error: t('quotaHit', locale), code: 'PROVIDER_BUSY' }, 429);
    }

    // 142: A 5xx, a timeout or a lost connection says nothing about the audio.
    // It used to mark the part failed on the spot; the arrival job then spent
    // all three recovery attempts on the same outage and retention deleted the
    // only copy. The part stays reclaimable, and only a failure that has lasted
    // PROVIDER_GIVE_UP_MS across PROVIDER_GIVE_UP_FAILURES tries is final.
    if (result.retryable) {
      const failures = (claimed.provider_failures ?? 0) + 1;
      const firstAt = claimed.first_provider_failure_at ?? new Date().toISOString();
      const givingUp = failures >= PROVIDER_GIVE_UP_FAILURES &&
        Date.now() - new Date(firstAt).getTime() >= PROVIDER_GIVE_UP_MS;
      await admin.from('lecture_segments')
        .update({
          status: givingUp ? 'failed' : 'uploaded',
          claimed_at: null,
          provider_failures: failures,
          first_provider_failure_at: firstAt,
        })
        .eq('id', segmentId);
      if (!givingUp) {
        log.warn('provider_unavailable_part_kept', {
          segment_id: segmentId, status: result.status, timed_out: Boolean(result.timedOut), failures,
        });
        return jsonResponse({ error: t('quotaHit', locale), code: 'PROVIDER_BUSY' }, 503);
      }
      log.error('provider_unavailable_part_given_up', { segment_id: segmentId, failures });
      return await maybeFinalize(admin, userId, lecture, locale, log);
    }

    // A refusal about this file itself (a 4xx other than 429). ONE bad segment
    // must not cost the student the other 89 minutes: mark just this chunk
    // failed and let the finalizer assemble everything that did work, with a
    // visible marker where the hole is.
    await admin.from('lecture_segments').update({ status: 'failed' }).eq('id', segmentId);
    log.error('segment_transcription_failed', { segment_id: segmentId, status: result.status });
    return await maybeFinalize(admin, userId, lecture, locale, log);
  }

  // An empty transcript is a VALID outcome, not a failure — five minutes of a
  // professor writing silently on a whiteboard genuinely contains no speech.
  // Storing '' keeps the segment 'done' so the lecture can finalize.
  //
  // 142: the text is what survives keptTranscript — silence and repetition
  // loops removed — not the raw text, which invents words for empty rooms.
  const text = kept.text;
  const providerSeconds = groqAudioSeconds(result.data);

  await logAiCall(admin, userId, {
    task: AiTask.transcription,
    provider,
    model,
    status: 'success',
    durationMs: result.durationMs,
    attempts: result.attempts,
  });
  await admin.rpc('lecture_count_transcription', {
    p_seconds: Math.round(providerSeconds ?? claimed.seconds ?? 0), p_failed: false,
  }).then(undefined, () => {});

  // Only a part with a real minute of speech, transcribed WITHOUT a forced
  // language, says anything about the language: a forced request reports the
  // language it was forced to, which would make a wrong lock permanent.
  const forcedLanguage = Boolean(forcedRequestLanguage);
  const timings = transcriptTimings(result.data, { filter: SILENCE_FILTER });
  const detected = !forcedLanguage && kept.language && (kept.speechSeconds ?? 0) >= 60
    ? kept.language
    : (heardOther && (kept.speechSeconds ?? 0) >= 60 ? 'other' : null);
  if (reprobing) {
    log.info('segment_language_reprobed', {
      segment_id: segmentId, seq: claimed.seq, locked: lockedLanguage, heard: detected,
    });
  }

  const { error: writeErr } = await admin
    .from('lecture_segments')
    .update({
      transcript: text,
      status: 'done',
      seconds: providerSeconds !== null ? Math.round(providerSeconds) : claimed.seconds,
      speech_seconds: kept.speechSeconds,
      dropped_segments: kept.dropped,
      detected_language: detected,
      timings: timings.length ? timings : null,
    })
    .eq('id', segmentId);
  if (writeErr) {
    log.error('segment_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  if (detected && detected !== 'other' && lectureLanguage !== 'mixed') {
    const { data: heard } = await admin
      .from('lecture_segments')
      .select('detected_language')
      .eq('lecture_id', lectureId)
      .in('detected_language', ['en', 'es']);
    const next = decideLectureLanguage(
      lectureLanguage,
      ((heard ?? []) as { detected_language: LectureLanguage }[]).map((h) => h.detected_language),
    );
    if (next !== lectureLanguage) {
      await admin.from('lecture_recordings').update({ language: next }).eq('id', lectureId);
      log.info('lecture_language_set', { lecture_id: lectureId, language: next });
    }
  }

  // CHARGE THE LECTURE HERE — at the first segment we actually paid a provider
  // to transcribe, not when the client declares the recording finished.
  //
  // Charging at finalization was a free-tier bypass: finalization requires
  // `segment_count`, which the CLIENT sets, so a client that simply never said
  // "I'm done" transcribed unlimited audio, was never charged, and could still
  // read every segment's transcript directly under RLS. The quota has to be
  // consumed by the call that costs money.
  //
  // The partial unique index on (user_id, lecture_id) makes this safe to
  // attempt on every segment: the first wins and the rest are no-ops, so one
  // lecture is charged exactly once. 142: through lecture_charge_usage, which
  // also re-charges a lecture that was refunded for holding no speech the
  // moment speech arrives — a refund must never become a free lecture.
  const { error: chargeErr } = await admin.rpc('lecture_charge_usage', {
    p_user_id: userId,
    p_lecture_id: lectureId,
    p_seconds: Math.round(providerSeconds ?? claimed.seconds ?? 0),
  });
  if (chargeErr) {
    log.warn('usage_charge_failed', errorFields(chargeErr));
  }

  log.info('segment_transcribed', {
    segment_id: segmentId,
    seq: claimed.seq,
    chars: text.length,
    audio_seconds: providerSeconds,
    speech_seconds: kept.speechSeconds,
    dropped_segments: kept.dropped,
  });

  return await maybeFinalize(admin, userId, lecture, locale, log);
}

// ── recover (scheduler only) ────────────────────────────────────────────────
/**
 * Transcribe a segment that stopped moving before it reached `done`.
 *
 * WHY THIS IS A SEPARATE ENTRY POINT AND NOT JUST A RETRY. Everything else in
 * this file is driven by a student holding a phone. Recovery is driven by a
 * cron tick twenty minutes to an hour after that phone stopped talking to us,
 * and it therefore has no session, no locale preference, and no way to ask the
 * user anything. What it does have is a segment id chosen by
 * lecture_stranded_segments (127), which already answered the only question
 * that matters — is there actually an object at that storage_path — so this
 * function never has to guess whether there is audio to work with.
 *
 * The owner comes off the row, never off the request. That is what keeps a
 * leaked scheduler secret from being usable to transcribe against an arbitrary
 * account: the caller cannot name a user, only a segment.
 *
 * The attempt is charged BEFORE the work, for the reason 109 stamps
 * notes_auto_attempts before its POST — an invocation killed mid-transcription
 * must still spend one, or a segment that reliably crashes us is retried every
 * twenty minutes for the rest of the app's life.
 */
async function handleRecover(
  admin: any,
  body: Record<string, unknown>,
  locale: Locale,
  log: any,
): Promise<Response> {
  const segmentId = typeof body.segmentId === 'string' ? body.segmentId : null;
  if (!segmentId) return jsonResponse({ error: 'segmentId is required' }, 400);

  // 147: recovery switched off (LECTURE_RECOVERY=off). Nothing is spent,
  // nothing is refunded, nothing is written off: the part waits where it is
  // until the switch is cleared. (The arrival job's dispatched_at stamp still
  // spaces its calls ten minutes apart.)
  if (!RECOVERY_ON) {
    log.info('recovery_switched_off', { segment_id: segmentId });
    return jsonResponse({ ok: true, status: 'paused' }, 200);
  }

  const { data: segment, error: segErr } = await admin
    .from('lecture_segments')
    .select('id, lecture_id, user_id, seq, status, recovery_attempts, claimed_at')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) {
    log.error('recover_segment_lookup_failed', errorFields(segErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!segment) return jsonResponse({ error: 'Segment not found' }, 404);

  log.setUser(segment.user_id);

  // 142: the scheduler sends no locale, so this used to be 'en' for everyone —
  // and 'en' was then forced on the provider, turning a Spanish lecture's
  // recovered part into nonsense. The owner's saved language decides the
  // fallback now (the lecture's own detected language still wins inside
  // handleSegment).
  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('preferred_language')
    .eq('id', segment.user_id)
    .maybeSingle();
  if (ownerProfile?.preferred_language === 'es') locale = 'es';

  // Already finished — by the client coming back, or by an earlier tick. Not an
  // error; the scheduler asking twice is normal and must be cheap.
  if (segment.status === 'done') {
    return jsonResponse({ ok: true, status: 'already_done' }, 200);
  }

  // Someone is transcribing it right now — usually the phone, whose own call
  // landed moments before the scheduler's (139 asks every minute). The claim
  // would refuse us anyway; returning here keeps that race from spending one of
  // the part's three attempts on work that is already happening.
  if (
    segment.status === 'transcribing' && segment.claimed_at &&
    Date.now() - new Date(segment.claimed_at).getTime() < STALE_CLAIM_MS
  ) {
    return jsonResponse({ ok: true, status: 'in_progress' }, 200);
  }

  if ((segment.recovery_attempts ?? 0) >= MAX_RECOVERY_ATTEMPTS) {
    log.warn('recover_attempts_exhausted', {
      segment_id: segmentId, attempts: segment.recovery_attempts,
    });
    return jsonResponse({ ok: true, status: 'exhausted' }, 200);
  }

  // The owner's real entitlement, read here because the dispatch above skips
  // the Pro gate for this action (it has no user until the row is loaded).
  // Assuming `false` would refuse a paying subscriber their own audio the
  // moment they had a second lecture on file. Fail CLOSED as transient, the
  // same as the main gate: a database blip must not demote anyone.
  const { data: proResult, error: proErr } = await admin.rpc('is_pro', { uid: segment.user_id });
  if (proErr) {
    log.error('recover_is_pro_failed', errorFields(proErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  await admin.rpc('lecture_note_recovery_attempt', { p_segment_id: segmentId })
    .then(undefined, () => {});

  const response = await handleSegment(
    admin,
    segment.user_id,
    { lectureId: segment.lecture_id, segmentId },
    locale,
    proResult === true,
    log,
    // Recovery widens the CLAIM only — which statuses may be taken over. It
    // buys no exemption from the free-lecture allowance.
    true,
  );

  // FOLD IT BACK IN. maybeFinalize cannot: its terminal write is guarded
  // against regressing a lecture that has already moved on, which is precisely
  // the state every recovered segment's lecture is in. Without this the
  // segment reads `done` with its text stored and the transcript the student
  // opens is still missing that stretch of the class.
  const { data: rebuilt, error: rebuildErr } = await admin
    .rpc('lecture_rebuild_transcript', { p_lecture_id: segment.lecture_id });
  if (rebuildErr) {
    log.error('recover_rebuild_failed', {
      lecture_id: segment.lecture_id, ...errorFields(rebuildErr),
    });
  }

  // GIVE THE ATTEMPT BACK IF THE WORK NEVER HAPPENED (128). A 429 means the
  // provider was busy and a 503 means we were; both leave the segment
  // deliberately reclaimable, and both used to spend one of its three tries
  // anyway. Three busy afternoons would have exhausted a perfectly recoverable
  // segment's budget without its audio ever being sent anywhere — and then the
  // audio would be deleted as something nothing will ever transcribe.
  if (response.status === 429 || response.status === 503) {
    await admin.rpc('lecture_refund_recovery_attempt', { p_segment_id: segmentId })
      .then(undefined, () => {});
  }

  // Named for what actually happened. handleSegment can legitimately refuse —
  // a free allowance already spent, a provider outage — and logging every
  // outcome as `segment_recovered` would make the metric that tells us whether
  // this works report 100% forever.
  const fields = {
    segment_id: segmentId,
    lecture_id: segment.lecture_id,
    seq: segment.seq,
    from_status: segment.status,
    attempt: (segment.recovery_attempts ?? 0) + 1,
    attempt_refunded: response.status === 429 || response.status === 503,
    transcript_rebuilt: rebuilt === true,
    outcome: response.status,
  };
  if (response.status >= 200 && response.status < 300) {
    log.info('segment_recovered', fields);
  } else {
    log.warn('segment_recovery_refused', fields);
  }

  return response;
}

/**
 * Remove every audio object for a lecture and record that it is gone.
 *
 * Called on BOTH terminal paths — success and permanent failure — because the
 * retention promise in the privacy policy is not conditional on the
 * transcription having worked. Audio that will never be transcribed is pure
 * liability: a third party's voice sitting in storage with no purpose left.
 *
 * `storage_path` is nulled only AFTER the objects are confirmed gone, so a
 * failed delete leaves the paths intact and the cleanup retryable rather than
 * losing the only pointer to the orphaned files.
 *
 * ─── WHAT IT WILL NOT DELETE ───────────────────────────────────────────────
 * A segment that has not reached `done` and has not exhausted its recovery
 * attempts. Its audio is the ONLY copy of that stretch of the lecture and 127
 * is about to try transcribing it; deleting it here would destroy the content
 * the recovery pass exists to save, and would do it from inside the recovery
 * pass itself — a lecture with two stranded segments would lose the second the
 * moment the first was rescued.
 *
 * 117 already states this rule for the retention sweep. This function did not
 * follow it: it filtered on `storage_path` alone, so a pending segment that
 * happened to be in the caller's snapshot was deleted along with the rest.
 *
 * Once recovery has given up the audio goes, and that is the point — it stops
 * being content we might still deliver and becomes a third party's voice in
 * storage with no purpose left. `includeUnfinished` is for cancel, where the
 * student has said to abandon the whole recording and every byte should go.
 */
async function deleteLectureAudio(
  admin: any,
  lectureId: string,
  segments: { storage_path: string | null; status?: string; recovery_attempts?: number }[],
  log: any,
  opts: { includeUnfinished?: boolean } = {},
): Promise<void> {
  const deletable = segments.filter((s) => {
    if (!s.storage_path) return false;
    if (opts.includeUnfinished) return true;
    if (s.status === 'done') return true;
    // No status in the snapshot means we cannot prove it is safe. Leave it;
    // the retention sweep asks the same question again every twenty minutes.
    if (!s.status) return false;
    return (s.recovery_attempts ?? 0) >= MAX_RECOVERY_ATTEMPTS;
  });
  const paths = deletable.map((s) => s.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    const { error } = await admin.storage.from('lectures').remove(paths);
    if (error) {
      log.warn('audio_delete_failed', errorFields(error));
      return;
    }
    // Scoped to the paths actually removed, NOT to the whole lecture. The
    // unscoped `.eq('lecture_id', ...)` cleared storage_path on segments whose
    // objects were never in `paths` — anything that arrived after this
    // snapshot was taken. Those objects then had nothing pointing at them and
    // a row claiming the audio was gone, which is how one file ended up in the
    // bucket with no segment referencing it at all.
    await admin.from('lecture_segments')
      .update({ storage_path: null })
      .eq('lecture_id', lectureId)
      .in('storage_path', paths);
  }

  // Only once nothing is left. Stamping unconditionally is what let a lecture
  // report its audio deleted while later segments sat in the bucket: on
  // 2026-08-31 lecture 17433304 recorded this at 09:30:13 and then uploaded
  // seven more segments between 09:34 and 10:06, none of which any cleanup
  // could see afterwards because the row already said it was done.
  const { count: remaining } = await admin
    .from('lecture_segments')
    .select('id', { count: 'exact', head: true })
    .eq('lecture_id', lectureId)
    .not('storage_path', 'is', null);

  if ((remaining ?? 0) > 0) {
    log.info('audio_partially_deleted', { lecture_id: lectureId, remaining });
    return;
  }

  await admin.from('lecture_recordings')
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq('id', lectureId);
}

/** Statuses a lecture only reaches once its transcript has been assembled. */
const FINISHED_STATUSES = new Set(['transcribed', 'generating', 'ready']);

/**
 * Bring a finished lecture's transcript up to date with its parts, then delete
 * whatever audio is now safe to delete.
 *
 * lecture_rebuild_transcript does the work under a row lock: it reassembles from
 * the done parts, returns false when the words are unchanged, and otherwise
 * writes the transcript, recounts the missing parts and marks existing notes
 * stale. The audio delete is the one handleRecover's caller relied on the
 * not-finalized branch for.
 */
async function foldInLateParts(
  admin: any,
  lectureId: string,
  segments: { storage_path: string | null; status?: string; recovery_attempts?: number }[],
  log: any,
): Promise<void> {
  const { data: rebuilt, error: rebuildErr } = await admin
    .rpc('lecture_rebuild_transcript', { p_lecture_id: lectureId });
  if (rebuildErr) {
    log.error('late_part_rebuild_failed', { lecture_id: lectureId, ...errorFields(rebuildErr) });
  } else if (rebuilt === true) {
    log.info('late_part_folded_in', { lecture_id: lectureId });
  }

  const { data: current } = await admin
    .from('lecture_recordings')
    .select('audio_deleted_at')
    .eq('id', lectureId)
    .maybeSingle();
  if (current && !current.audio_deleted_at) {
    await deleteLectureAudio(admin, lectureId, segments, log);
  }
}

/**
 * Assemble the full transcript once every segment is done, then delete the audio.
 *
 * Called after every segment because there is no queue: whichever invocation
 * happens to write the last `done` is the one that finalizes. It is safe to run
 * concurrently — the terminal update is conditioned on the lecture not already
 * being past 'transcribing'.
 */
async function maybeFinalize(
  admin: any,
  userId: string,
  lecture: { id: string; title: string; segment_count: number; status: string },
  locale: Locale,
  log: any,
): Promise<Response> {
  // Read fresh (138). The caller's copy was taken before a transcription that
  // can run for a minute, and the stall sweep may have finished the lecture in
  // the meantime; acting on the old status would leave this part out of it.
  const { data: fresh } = await admin
    .from('lecture_recordings')
    .select('status, segment_count')
    .eq('id', lecture.id)
    .maybeSingle();
  if (fresh) lecture = { ...lecture, status: fresh.status, segment_count: fresh.segment_count };

  const { data: segments, error } = await admin
    .from('lecture_segments')
    .select('id, seq, status, transcript, seconds, storage_path, has_gap, created_at, recovery_attempts, provider_failures, first_provider_failure_at')
    .eq('lecture_id', lecture.id)
    .eq('user_id', userId)
    .order('seq', { ascending: true });

  if (error) {
    log.error('segments_read_failed', errorFields(error));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  const all = segments ?? [];
  const done = all.filter((s: any) => s.status === 'done');

  // A segment whose upload died stays 'pending' forever, and a lecture with any
  // non-terminal segment never finalizes — so one dropped connection used to
  // strand the whole recording behind a spinner with no path out. Anything that
  // has not moved in STALE_SEGMENT_MS is written off, and the transcript is
  // assembled around the hole rather than never being assembled at all.
  //
  // Since 127 this is a hole that can still be filled in. The write-off unblocks
  // the lecture NOW, which is what the student in front of the screen needs, but
  // it no longer destroys the chance of recovering the segment: the audio is
  // left alone and the recovery pass will claim a `failed` segment whose object
  // still exists, then fold the text back into the transcript.
  const staleCutoff = Date.now() - STALE_SEGMENT_MS;
  // Not a part waiting out a provider outage (142): its audio is here and the
  // arrival job retries it until PROVIDER_GIVE_UP; writing it off would finish
  // the lecture as missing audio the provider was about to transcribe.
  // Exempt for as long as a provider outage is given (PROVIDER_GIVE_UP_MS);
  // after that it is written off like any other stuck part, so a quota that
  // never recovers cannot hold a lecture open forever.
  const waitingOnProvider = (s: any) =>
    s.status === 'uploaded' && Boolean(s.first_provider_failure_at) &&
    Date.now() - new Date(s.first_provider_failure_at).getTime() < PROVIDER_GIVE_UP_MS;
  const stale = all.filter((s: any) =>
    s.status !== 'done' && s.status !== 'failed' &&
    !waitingOnProvider(s) &&
    new Date(s.created_at).getTime() < staleCutoff);
  if (stale.length > 0) {
    await admin.from('lecture_segments')
      .update({ status: 'failed' })
      .in('id', stale.map((s: any) => s.id));
    for (const s of stale) s.status = 'failed';
    log.warn('segments_timed_out', { lecture_id: lecture.id, count: stale.length });
  }

  // A PART THAT ARRIVES AFTER THE LECTURE WAS FINISHED (138). The terminal
  // write below is guarded and will never match again, and the capture check
  // below never passes while a part is still missing, so without this a late
  // part was transcribed, stored, and left out of the transcript the student
  // reads. Stop used to paper over it by dragging the lecture back to
  // 'uploading'; the database no longer allows that. The rebuild compares
  // words, so this is a no-op unless the part actually added something, and
  // when it did it marks the notes to be rewritten.
  if (FINISHED_STATUSES.has(lecture.status)) {
    await foldInLateParts(admin, lecture.id, all, log);
    return jsonResponse({ ok: true, status: lecture.status, segmentsDone: done.length }, 200);
  }

  const pending = all.filter((s: any) => s.status !== 'done' && s.status !== 'failed');
  // segment_count is set by the client when it finishes capturing. Until then
  // it is 0 and the lecture is still recording, so finalizing would truncate.
  const captureComplete = lecture.segment_count > 0 && all.length >= lecture.segment_count;

  if (!captureComplete || pending.length > 0) {
    return jsonResponse({
      ok: true,
      status: 'transcribing',
      segmentsDone: done.length,
      segmentsTotal: Math.max(lecture.segment_count, all.length),
    }, 200);
  }

  // Every segment has reached a terminal state. Assemble what we have.
  //
  // 142: through lecture_assemble_transcript, the ONE assembler. This file used
  // to keep its own copy, which marked failed parts but not parts that never
  // got a row at all — so a lecture missing its middle twenty minutes read as
  // continuous. The SQL assembler walks every expected part and marks each run
  // of missing ones, in the lecture's language.
  const { data: assembled, error: assembleErr } = await admin
    .rpc('lecture_assemble_transcript', { p_lecture_id: lecture.id })
    .maybeSingle();
  if (assembleErr || !assembled) {
    log.error('assemble_failed', errorFields(assembleErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  const transcript = typeof assembled.transcript === 'string' ? assembled.transcript.trim() : '';
  // The markers are text too. A lecture whose every part failed would otherwise
  // read as success, burn the free lecture, and send the notes model a page of
  // apologies — so "real text" is counted separately by the assembler.
  // Also counted here from every finished part, whatever its number: the
  // assembler only walks the expected range, and a refund decided from that
  // alone could refund a lecture whose text the student can read.
  const hasRealText = (assembled.text_parts ?? 0) > 0 ||
    done.some((s: any) => typeof s.transcript === 'string' && s.transcript.trim() !== '');
  const audioSeconds = all.reduce((sum: number, s: any) => sum + (s.seconds || 0), 0);
  const anyFailed = all.some((s: any) => s.status === 'failed');

  if (!hasRealText) {
    // Distinguish "we broke" from "nobody spoke" — the student can act on one
    // of those and not the other, and the detail screen words them differently.
    const errorCode = anyFailed ? 'TRANSCRIBE_FAILED' : 'NO_SPEECH';
    await admin.from('lecture_recordings')
      .update({ status: 'failed', error_code: errorCode })
      .eq('id', lecture.id)
      .neq('status', 'ready');
    // Nothing of value was delivered, so the free lecture must not be burned.
    // 142: REFUNDED, not deleted. The row stays as a record, free_action_used()
    // ignores it, and lecture_charge_usage charges it again if a late part
    // turns out to hold speech.
    await admin.rpc('lecture_refund_usage', {
      p_user_id: userId, p_lecture_id: lecture.id, p_code: errorCode,
    }).then(undefined, () => {});
    await admin.from('lecture_usage_log').insert({
      user_id: userId, lecture_id: null, audio_seconds: audioSeconds,
      status: 'failed', error_code: errorCode,
    }).then(undefined, () => {});
    // Idempotent and day-correct: releases exactly what THIS lecture holds, and
    // nothing on a second call.
    await admin.rpc('release_lecture_reservation', { p_lecture_id: lecture.id })
      .then(undefined, () => {});
    // The audio of everything that genuinely finished goes now. What does NOT
    // go is a segment recovery has not finished with — since 127 a terminal
    // failure here is no longer the end of the line, and a lecture that failed
    // because two uploads stalled is exactly the one worth trying again. Those
    // objects are collected by the retention sweep once the attempts run out,
    // an hour later at the outside.
    await deleteLectureAudio(admin, lecture.id, all, log);
    log.warn('lecture_no_usable_text', {
      lecture_id: lecture.id, audio_seconds: audioSeconds, code: errorCode,
    });
    return jsonResponse({ ok: true, status: 'failed', code: errorCode }, 200);
  }

  // 143: a transcript too short to write notes from is shown as it is, not left
  // 'transcribed' where the notes job (200-character minimum) never picks it up
  // and the app spins "Writing notes" forever. The charge stands: the student
  // did get a transcript.
  const tooShortForNotes = transcriptWords(transcript).length < 200;

  // The charge normally lands with the first transcribed part; an isolate
  // killed between that write and the charge would have delivered a free
  // lecture. Idempotent, so this is a no-op on every lecture already charged.
  await admin.rpc('lecture_charge_usage', {
    p_user_id: userId, p_lecture_id: lecture.id, p_seconds: Math.round(audioSeconds),
  }).then(undefined, () => {});

  // Terminal write, guarded so a concurrent finalizer cannot regress a lecture
  // that has already moved on to notes generation.
  const { data: finalized, error: finalErr } = await admin
    .from('lecture_recordings')
    .update({
      transcript,
      status: tooShortForNotes ? 'ready' : 'transcribed',
      duration_seconds: audioSeconds,
      error_code: tooShortForNotes ? 'TOO_SHORT_FOR_NOTES' : null,
    })
    .eq('id', lecture.id)
    .in('status', ['recording', 'uploading', 'transcribing', 'failed'])
    .select('id')
    .maybeSingle();

  if (finalErr) {
    log.error('finalize_failed', errorFields(finalErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!finalized) {
    // Another invocation (or the stall sweep) finished this lecture between our
    // read and this write. This part may still be missing from that transcript,
    // and if that invocation's audio delete failed, this is the only place it
    // ever gets retried — the terminal update above will never match again.
    await foldInLateParts(admin, lecture.id, all, log);
    return jsonResponse({ ok: true, status: 'transcribed' }, 200);
  }

  // 138: record any part the phone declared that never became a row.
  const { error: missingErr } = await admin
    .rpc('lecture_set_parts_missing', { p_lecture_id: lecture.id });
  if (missingErr) log.warn('parts_missing_update_failed', errorFields(missingErr));

  // The lecture was already charged by its first transcribed segment; top up
  // the recorded duration now that the true total is known. (Insert-on-conflict
  // would need the row to exist, so this is a plain update that matches nothing
  // in the rare case the charge never landed.)
  await admin.from('lecture_usage_log')
    .update({ audio_seconds: audioSeconds })
    .eq('lecture_id', lecture.id)
    .eq('user_id', userId)
    .then(undefined, () => {});

  // The recording is over: release the whole remaining reservation. Settling to
  // the used amount would keep holding capacity for a lecture that is finished.
  await admin.rpc('release_lecture_reservation', { p_lecture_id: lecture.id })
    .then(undefined, () => {});

  await deleteLectureAudio(admin, lecture.id, all, log);

  log.info('lecture_transcribed', {
    lecture_id: lecture.id,
    audio_seconds: audioSeconds,
    chars: transcript.length,
    segments: all.length,
  });

  return jsonResponse({ ok: true, status: 'transcribed', segmentsDone: done.length }, 200);
}

/**
 * The words this course uses (4.1): its name and instructor, the topics the
 * student has practised, and the key terms of the last few lectures' notes.
 */
async function courseVocabulary(
  admin: any,
  userId: string,
  courseId: string | null,
  lectureId: string,
): Promise<{ courseName: string | null; instructor: string | null; terms: string[] } | null> {
  if (!courseId) return null;
  const [course, topics, lectures] = await Promise.all([
    admin.from('courses').select('name, instructor').eq('id', courseId).eq('user_id', userId).maybeSingle(),
    admin.from('course_topic_mastery').select('topic')
      .eq('user_id', userId).eq('course_id', courseId)
      .order('updated_at', { ascending: false }).limit(15),
    admin.from('lecture_recordings').select('notes_md')
      .eq('user_id', userId).eq('course_id', courseId).neq('id', lectureId)
      .not('notes_md', 'is', null)
      .order('created_at', { ascending: false }).limit(3),
  ]);
  if (!course.data) return null;
  const terms = [
    ...((lectures.data ?? []) as { notes_md: string }[]).flatMap((l) => termsFromNotes(l.notes_md, 15)),
    ...((topics.data ?? []) as { topic: string }[]).map((t) => t.topic),
  ];
  return {
    courseName: typeof course.data.name === 'string' ? course.data.name : null,
    instructor: typeof course.data.instructor === 'string' ? course.data.instructor : null,
    terms,
  };
}

/**
 * Has today's shared transcription capacity (the org-wide provider quota this
 * function mirrors in GLOBAL_DAILY_AUDIO_SECONDS) been used up, by our own
 * ledger? Read only when the provider has already refused a part, to word the
 * refusal. A failed read is "no": the provider's own words decide then.
 */
async function dayCapacitySpent(admin: any): Promise<boolean> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from('lecture_transcription_usage')
    .select('audio_seconds')
    .gte('hour', dayStart.toISOString());
  if (error || !Array.isArray(data)) return false;
  const used = data.reduce((sum: number, row: any) => sum + (row.audio_seconds || 0), 0);
  return used >= GLOBAL_DAILY_AUDIO_SECONDS;
}

/**
 * A lecture whose parts the free allowance (or the length limit) refuses is
 * finished as failed, once, with its audio handed to retention. Nothing is
 * refunded: nothing was charged.
 */
async function failLectureForAllowance(admin: any, lectureId: string, code: string, log: any): Promise<void> {
  await admin.from('lecture_segments')
    .update({ status: 'failed', recovery_attempts: 3, claimed_at: null })
    .eq('lecture_id', lectureId)
    .neq('status', 'done');
  await admin.from('lecture_recordings')
    .update({ status: 'failed', error_code: code })
    .eq('id', lectureId)
    .in('status', ['recording', 'uploading', 'transcribing']);
  await admin.rpc('release_lecture_reservation', { p_lecture_id: lectureId }).then(undefined, () => {});
  log.warn('lecture_refused_by_allowance', { lecture_id: lectureId, code });
}
