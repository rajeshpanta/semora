import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  AiTask, callGroqTranscription, groqAudioSeconds, groqTranscriptText,
  isProviderConfigured, logAiCall, modelFor, providerFor,
} from '../_shared/ai.ts';
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

/** Longest single recording, in seconds. Mirrors MAX_RECORDING_SECONDS on the client. */
const MAX_LECTURE_SECONDS = 90 * 60;

/** A claim older than this is assumed dead and may be taken over. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

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

/** Segment audio never exceeds ~1.2 MB; this is a sanity ceiling, not a budget. */
const MAX_SEGMENT_BYTES = 12 * 1024 * 1024;

/** Tail of the previous segment fed to the model to repair the boundary word. */
const PROMPT_TAIL_CHARS = 400;

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
  noAudio: {
    en: 'That part of the recording is missing its audio and cannot be transcribed.',
    es: 'A esa parte de la grabación le falta el audio y no se puede transcribir.',
  },
  tooManyInFlight: {
    en: 'You already have a lecture still processing. Let it finish before starting another.',
    es: 'Ya tienes una clase procesándose. Espera a que termine antes de empezar otra.',
  },
  tooLong: {
    en: 'This recording has reached its 90-minute limit.',
    es: 'Esta grabación alcanzó su límite de 90 minutos.',
  },
  notFound: {
    en: 'Lecture not found',
    es: 'No se encontró esta clase.',
  },
} as const;

const t = (key: keyof typeof MSG, locale: Locale) => MSG[key][locale];

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

    if (action === 'start') return await handleStart(adminClient, userId, body, locale, isPro, log);
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
): Promise<Response> {
  const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const courseId = typeof body.courseId === 'string' && body.courseId ? body.courseId : null;

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
    return jsonResponse({ error: t('tooManyInFlight', locale), code: 'TOO_MANY_IN_FLIGHT' }, 409);
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

  log.info('lecture_started', { lecture_id: lecture.id, has_course: Boolean(courseId), is_pro: isPro });
  return jsonResponse(
    { lectureId: lecture.id, maxSeconds: MAX_LECTURE_SECONDS, reservedSeconds: MAX_LECTURE_SECONDS },
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
    .select('id, user_id, course_id, title, segment_count, status')
    .eq('id', lectureId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lectureErr) {
    log.error('lecture_lookup_failed', errorFields(lectureErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!lecture) return jsonResponse({ error: 'Lecture not found' }, 404);

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
  if (!isPro) {
    const used = await chargedLectureCount(admin, userId, lectureId);
    if (used === null) {
      log.error('usage_count_failed');
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (used >= FREE_LECTURE_ALLOWANCE) {
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
    .select('id, seq, storage_path, seconds')
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
    await admin.from('lecture_segments').update({ status: 'failed' }).eq('id', segmentId);
    log.warn('lecture_length_cap_hit', { lecture_id: lectureId, seconds: alreadyTranscribed });
    return jsonResponse({ error: t('tooLong', locale), code: 'LECTURE_TOO_LONG' }, 413);
  }

  // The lecture is now demonstrably being transcribed. Recording this is what
  // makes the list screen's "Transcribing" state true, and what the in-flight
  // reservation cap counts.
  await admin.from('lecture_recordings')
    .update({ status: 'transcribing' })
    .eq('id', lectureId)
    .in('status', ['recording', 'uploading']);

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

  // Previous segment's tail keeps terminology stable across the boundary.
  let promptHint = typeof lecture.title === 'string' ? lecture.title.slice(0, 120) : '';
  if (claimed.seq > 0) {
    const { data: prev } = await admin
      .from('lecture_segments')
      .select('transcript')
      .eq('lecture_id', lectureId)
      .eq('seq', claimed.seq - 1)
      .maybeSingle();
    const tail = typeof prev?.transcript === 'string'
      ? prev.transcript.slice(-PROMPT_TAIL_CHARS)
      : '';
    if (tail) promptHint = `${promptHint}\n${tail}`.trim();
  }

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

  const result = await callGroqTranscription({
    audio: bytes,
    fileName: `seg_${String(claimed.seq).padStart(3, '0')}.m4a`,
    mimeType: 'audio/m4a',
    language: locale,
    promptHint,
    label: 'lecture-segment',
  });

  const model = modelFor(AiTask.transcription);
  const provider = providerFor(AiTask.transcription);

  if (!result.ok) {
    const rateLimited = result.status === 429;
    await logAiCall(admin, userId, {
      task: AiTask.transcription,
      provider,
      model,
      status: rateLimited ? 'rate_limited' : 'failed',
      errorCode: String(result.status),
      // Groq's own words about the refusal, kept past the ~24h log retention.
      errorDetail: result.errorBody,
      durationMs: result.durationMs,
      attempts: result.attempts,
    });

    if (rateLimited) {
      // Leave the segment reclaimable so the client can retry later without
      // losing the audio, and do NOT charge the user's free lecture.
      await admin.from('lecture_segments')
        .update({ status: 'uploaded', claimed_at: null }).eq('id', segmentId);
      log.warn('provider_rate_limited', { segment_id: segmentId });
      return jsonResponse({ error: t('quotaHit', locale), code: 'PROVIDER_BUSY' }, 429);
    }

    // ONE bad segment must not cost the student the other 89 minutes. Mark just
    // this chunk failed and let the finalizer assemble everything that did work,
    // with a visible marker where the hole is. Only a lecture where NOTHING
    // transcribed is a failed lecture — and maybeFinalize decides that.
    await admin.from('lecture_segments').update({ status: 'failed' }).eq('id', segmentId);
    log.error('segment_transcription_failed', { segment_id: segmentId, status: result.status });
    return await maybeFinalize(admin, userId, lecture, locale, log);
  }

  // An empty transcript is a VALID outcome, not a failure — five minutes of a
  // professor writing silently on a whiteboard genuinely contains no speech.
  // Storing '' keeps the segment 'done' so the lecture can finalize.
  const text = groqTranscriptText(result.data) ?? '';
  const providerSeconds = groqAudioSeconds(result.data);

  await logAiCall(admin, userId, {
    task: AiTask.transcription,
    provider,
    model,
    status: 'success',
    durationMs: result.durationMs,
    attempts: result.attempts,
  });

  const { error: writeErr } = await admin
    .from('lecture_segments')
    .update({
      transcript: text,
      status: 'done',
      seconds: providerSeconds !== null ? Math.round(providerSeconds) : claimed.seconds,
    })
    .eq('id', segmentId);
  if (writeErr) {
    log.error('segment_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
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
  // attempt on every segment: the first wins, the rest collide and are ignored,
  // so one lecture is charged exactly once.
  const { error: chargeErr } = await admin.from('lecture_usage_log').insert({
    user_id: userId,
    lecture_id: lectureId,
    audio_seconds: Math.round(providerSeconds ?? claimed.seconds ?? 0),
    status: 'success',
  });
  if (chargeErr && (chargeErr as any).code !== '23505') {
    log.warn('usage_charge_failed', errorFields(chargeErr));
  }

  log.info('segment_transcribed', {
    segment_id: segmentId,
    seq: claimed.seq,
    chars: text.length,
    audio_seconds: providerSeconds,
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

  const { data: segment, error: segErr } = await admin
    .from('lecture_segments')
    .select('id, lecture_id, user_id, seq, status, recovery_attempts')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) {
    log.error('recover_segment_lookup_failed', errorFields(segErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!segment) return jsonResponse({ error: 'Segment not found' }, 404);

  log.setUser(segment.user_id);

  // Already finished — by the client coming back, or by an earlier tick. Not an
  // error; the scheduler asking twice is normal and must be cheap.
  if (segment.status === 'done') {
    return jsonResponse({ ok: true, status: 'already_done' }, 200);
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
  const { data: segments, error } = await admin
    .from('lecture_segments')
    .select('id, seq, status, transcript, seconds, storage_path, has_gap, created_at, recovery_attempts')
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
  const stale = all.filter((s: any) =>
    s.status !== 'done' && s.status !== 'failed' &&
    new Date(s.created_at).getTime() < staleCutoff);
  if (stale.length > 0) {
    await admin.from('lecture_segments')
      .update({ status: 'failed' })
      .in('id', stale.map((s: any) => s.id));
    for (const s of stale) s.status = 'failed';
    log.warn('segments_timed_out', { lecture_id: lecture.id, count: stale.length });
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

  // Every segment has reached a terminal state. Assemble what we have; a failed
  // segment leaves a marked hole rather than silently vanishing.
  const parts: string[] = [];
  // Tracked separately from `parts`, because the markers below are text too. A
  // lecture whose every segment failed would otherwise assemble into a
  // "transcript" consisting solely of "[could not be transcribed]" — which
  // would read as success, burn the free lecture, and send the notes model a
  // page of apologies to summarize.
  let hasRealText = false;
  for (const s of all) {
    if (s.status === 'failed') {
      parts.push(locale === 'es'
        ? '[Falta una parte de la grabación.]'
        : '[Part of this recording could not be transcribed.]');
      continue;
    }
    if (s.has_gap) {
      parts.push(locale === 'es'
        ? '[La grabación se reanudó tras una interrupción.]'
        : '[Recording resumed after an interruption.]');
    }
    if (s.transcript && s.transcript.trim()) {
      parts.push(s.transcript.trim());
      hasRealText = true;
    }
  }
  const transcript = parts.filter(Boolean).join('\n\n').trim();
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
    // Any 'success' row written by an earlier segment is removed here: a
    // lecture that produced no usable text was not a lecture the student got.
    await admin.from('lecture_usage_log')
      .delete().eq('lecture_id', lecture.id).eq('user_id', userId)
      .then(undefined, () => {});
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

  // Terminal write, guarded so a concurrent finalizer cannot regress a lecture
  // that has already moved on to notes generation.
  const { data: finalized, error: finalErr } = await admin
    .from('lecture_recordings')
    .update({
      transcript,
      status: 'transcribed',
      duration_seconds: audioSeconds,
      error_code: null,
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
    // Another invocation already finalized this lecture. One thing is still
    // worth doing: if that invocation's audio delete failed, this is the only
    // place it ever gets retried — the terminal update above will never match
    // again, so without this the objects stay in the bucket forever and the
    // retention promise quietly stops being true for that lecture.
    const { data: current } = await admin
      .from('lecture_recordings')
      .select('audio_deleted_at')
      .eq('id', lecture.id)
      .maybeSingle();
    if (current && !current.audio_deleted_at) {
      await deleteLectureAudio(admin, lecture.id, all, log);
    }
    return jsonResponse({ ok: true, status: 'transcribed' }, 200);
  }

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
