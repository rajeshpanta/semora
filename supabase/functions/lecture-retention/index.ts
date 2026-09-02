import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withRequestLogging, errorFields } from '../_shared/log.ts';

// ── Lecture audio retention ─────────────────────────────────────────────────
//
// THE PROMISE THIS KEEPS. Lecture audio is deleted the moment its transcript
// is written. That is what the privacy policy says and it is what
// deleteLectureAudio does on the normal path — but the normal path is not the
// only way a lecture finishes, and every other way leaves the audio behind.
//
// Measured 2026-09-02: 9 lectures, 29 objects, 26 MB still in the private
// bucket after their transcripts were written, from two distinct causes.
//
//   THE SWEEP NEVER TOUCHES STORAGE. sweep_stalled_lectures (082/107/110/113)
//   finalises a lecture in plain SQL. It has no storage client and cannot have
//   one, so a lecture it rescues keeps its audio forever. 5 of the 9. This got
//   wider today, not narrower: 113 added a branch for abandoned recordings and
//   115 added a transcript rebuild, both of which land rows in 'transcribed'
//   without any audio ever being deleted.
//
//   AUDIO THAT ARRIVED AFTER THE DELETE. The other 4. Lecture 17433304 stamped
//   audio_deleted_at at 09:30:13 and then uploaded seven more segments between
//   09:34 and 10:06 — the premature-finalise bug fixed today, whose leftovers
//   nothing could see afterwards because the row already claimed to be clean.
//
// Both are the same shape of mistake: deletion happens at one moment, on one
// path, from one snapshot. This runs on a timer instead and asks the only
// question that matters — IS THERE AUDIO WHOSE TRANSCRIPT IS ALREADY WRITTEN?
// — so it does not care which path got the lecture there, or which future path
// forgets to call it.
//
// ── WHAT IT WILL NOT DELETE ─────────────────────────────────────────────────
// Only 'done' segments. A `pending` segment's audio is the ONLY copy of that
// part of the lecture — it has not been transcribed, so deleting it destroys
// content permanently rather than honouring a retention promise. There are 5
// such segments right now and this leaves every one of them alone.
//
// And nothing from a lecture that has received audio in the last 15 minutes,
// for the same reason request_pending_lecture_notes refuses one: a recording
// that is still arriving is still a recording, whatever its status column says.
//
// ── DEPLOY ──────────────────────────────────────────────────────────────────
// MUST be deployed with --no-verify-jwt. Its only caller is a pg_cron job
// sending a shared secret and no Authorization header; with gateway JWT
// verification on, every run is rejected at the door and the function is never
// reached to log it. See DEPLOY_CHECKLIST.md.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Storage remove() takes a list; keep each call small enough to stay well inside limits. */
const MAX_PATHS_PER_CALL = 100;
/** Lectures per run. The backlog is finite and this drains it over a few ticks. */
const MAX_LECTURES_PER_RUN = 25;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-semora-lecture-cron-secret',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(withRequestLogging('lecture-retention', async (req, log) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Same shared secret as the notes worker, read through the same RPC. One
  // credential for the lecture schedulers; rotating it rotates both.
  const supplied = req.headers.get('x-semora-lecture-cron-secret') ?? '';
  const { data: expected, error: secretErr } = await admin.rpc('read_lecture_cron_secret');
  if (secretErr || typeof expected !== 'string' || !supplied || supplied !== expected) {
    log.warn('cron_secret_rejected');
    return jsonResponse({ error: 'Unauthorized scheduler' }, 401);
  }

  // The candidate set, chosen in SQL so the rules live in one place and this
  // function stays a pair of storage calls.
  const { data: rows, error: pickErr } = await admin.rpc('lecture_audio_awaiting_deletion', {
    p_limit: MAX_LECTURES_PER_RUN,
  });
  if (pickErr) {
    log.error('candidate_query_failed', errorFields(pickErr));
    return jsonResponse({ error: 'query failed' }, 503);
  }

  // Deliberately NO early return on an empty candidate list. The orphan sweep
  // below is a SEPARATE question — audio with no row at all — and the steady
  // state of a healthy system is exactly "nothing to transcribe-collect, but
  // maybe an orphan". An early return here meant the orphan pass only ever ran
  // on ticks that already had other work, which is to say almost never.
  const candidates = (rows ?? []) as { lecture_id: string; paths: string[] }[];

  let objectsDeleted = 0;
  let lecturesCleared = 0;
  let failures = 0;

  for (const row of candidates) {
    const paths = (row.paths ?? []).filter((p) => typeof p === 'string' && p.length > 0);
    if (paths.length === 0) continue;

    let removedAll = true;
    for (let i = 0; i < paths.length; i += MAX_PATHS_PER_CALL) {
      const batch = paths.slice(i, i + MAX_PATHS_PER_CALL);
      const { error } = await admin.storage.from('lectures').remove(batch);
      if (error) {
        // Storage refused. Leave storage_path intact so the next run retries
        // exactly this batch — the row still pointing at the object is the only
        // thing that makes it findable, and clearing it would strand the file.
        log.warn('audio_delete_failed', { lecture_id: row.lecture_id, ...errorFields(error) });
        removedAll = false;
        failures += 1;
        break;
      }
      objectsDeleted += batch.length;

      // Only the paths this call actually removed.
      const { error: clearErr } = await admin
        .from('lecture_segments')
        .update({ storage_path: null })
        .eq('lecture_id', row.lecture_id)
        .in('storage_path', batch);
      if (clearErr) {
        log.error('clear_storage_path_failed', { lecture_id: row.lecture_id, ...errorFields(clearErr) });
        removedAll = false;
        failures += 1;
        break;
      }
    }

    if (!removedAll) continue;

    // Stamp only when the lecture has nothing left anywhere — including the
    // pending segments this function deliberately never touches. A lecture
    // still holding untranscribed audio has NOT had its audio deleted, and
    // saying otherwise is the exact lie that hid this for a week.
    const { count: remaining } = await admin
      .from('lecture_segments')
      .select('id', { count: 'exact', head: true })
      .eq('lecture_id', row.lecture_id)
      .not('storage_path', 'is', null);

    if ((remaining ?? 0) === 0) {
      await admin.from('lecture_recordings')
        .update({ audio_deleted_at: new Date().toISOString() })
        .eq('id', row.lecture_id);
      lecturesCleared += 1;
    }
  }

  // ── Audio nothing points at (118) ────────────────────────────────────────
  // Everything above is found THROUGH a segment row, so the one class it
  // cannot reach is audio whose row is gone — which is also the class that
  // lasts longest, because nothing else can reach it either. Deleting a
  // lecture cascades its segments away, taking the only pointer with them, and
  // purgeLectureAudio swallows a failed storage delete before that happens.
  //
  // Safe because uploadSegment writes the row BEFORE the object, so "no row"
  // can only mean the row was deleted, never that an upload is in flight.
  let orphansDeleted = 0;
  const { data: orphanRows, error: orphanErr } = await admin.rpc('lecture_orphaned_audio', {
    p_limit: MAX_PATHS_PER_CALL * 2,
  });
  if (orphanErr) {
    log.error('orphan_query_failed', errorFields(orphanErr));
    failures += 1;
  } else {
    const orphanPaths = ((orphanRows ?? []) as { path: string }[])
      .map((r) => r.path)
      .filter((p) => typeof p === 'string' && p.length > 0);

    for (let i = 0; i < orphanPaths.length; i += MAX_PATHS_PER_CALL) {
      const batch = orphanPaths.slice(i, i + MAX_PATHS_PER_CALL);
      const { error } = await admin.storage.from('lectures').remove(batch);
      if (error) {
        log.warn('orphan_delete_failed', errorFields(error));
        failures += 1;
        break;
      }
      orphansDeleted += batch.length;
    }
  }

  log.info('retention_swept', {
    lectures: candidates.length,
    objects_deleted: objectsDeleted,
    orphans_deleted: orphansDeleted,
    lectures_cleared: lecturesCleared,
    failures,
  });

  return jsonResponse({
    ok: true,
    lectures: candidates.length,
    objects: objectsDeleted,
    orphans: orphansDeleted,
    cleared: lecturesCleared,
    failures,
  }, 200);
}));
