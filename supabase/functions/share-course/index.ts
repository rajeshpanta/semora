// share-course
// Server-authoritative creation of a copy-on-join course share link.
//
// Flow (action: 'create'):
//   1. Verify the caller's JWT (auth.getUser) — authenticated only.
//   2. Verify the caller is Pro (is_pro RPC, service role) — SENDING is Pro.
//   3. Verify the caller OWNS the course (service-role read of courses.user_id).
//   4. Build a point-in-time SNAPSHOT of the course + its task list.
//   5. Insert a course_shares row with an unguessable token.
//   6. Return { token, url } — url is a semora://join?token=... deep link the
//      client hands to the native Share sheet.
//
// Why server-side (not a client insert): keeping create here lets us enforce
// the Pro gate + course ownership AND build the snapshot atomically with the
// service-role client (which bypasses RLS), so the snapshot always reflects
// the owner's real rows and a free/non-owner client can never mint a link.
// RECEIVING (resolve + import) is a separate FREE client path — see
// resolve_course_share() in migration 026 and lib/shareCourse.importSharedCourse.
//
// Modeled on parse-syllabus (CORS, JWT verify, service-role client, error
// logging) and validate-receipt (is_pro / entitlement checks).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Shared links are https pages on the marketing site, not bare `semora://`
// deep links. A custom scheme opens the app when it is already installed and
// does nothing otherwise — which is exactly the recipient a share is for. The
// landing page previews in iMessage/Discord, works on a laptop, and hands off
// to `semora://join?token=...` (still handled by app/join.tsx) for anyone who
// does have the app. Links minted before this change keep working.
const SHARE_LINK_BASE = 'https://semoraai.com/join';

// Cap the task list captured in a snapshot. A real course has well under this;
// the bound keeps a single snapshot (and the resulting jsonb row) from being
// pathologically large if a course somehow has thousands of tasks.
const MAX_SNAPSHOT_TASKS = 500;

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

// Unguessable share token: two UUIDs' worth of entropy, hex only so it's
// URL-safe with no encoding. crypto.randomUUID is available in the Deno edge
// runtime. Collisions are astronomically unlikely, and the unique index on
// course_shares.token is the hard backstop (a dup insert would 23505).
function generateToken(): string {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return `${a}${b}`;
}

serve(withRequestLogging('share-course', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate JWT against Supabase auth (mirrors parse-syllabus).
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

    // 2. Parse body. Only 'create' is supported today; the action field
    //    leaves room for future 'revoke' etc. without a new endpoint.
    let body: { action?: unknown; courseId?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const action = typeof body.action === 'string' ? body.action : 'create';
    if (action !== 'create') {
      return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
    }

    const courseId = body.courseId;
    if (typeof courseId !== 'string' || !courseId) {
      return jsonResponse({ error: 'Missing courseId' }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Pro gate — SENDING is Pro. is_pro() is SECURITY DEFINER and granted
    //    to service_role (migration 009), so the admin client can call it.
    //    Fail closed as transient (503) on an RPC blip so we never falsely
    //    deny a paying user, matching parse-syllabus's is_pro handling.
    const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
    if (proErr) {
      console.error('[share-course] is_pro check failed:', proErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      // 402 + code so the client can route to the paywall rather than show a
      // generic error (mirrors tutor-chat's PRO_REQUIRED convention).
      return jsonResponse(
        { error: 'Sharing a course is a Pro feature. Upgrade to share your deadlines with classmates.', code: 'PRO_REQUIRED' },
        402,
      );
    }

    // 4. Load the course and assert ownership (service role bypasses RLS, so
    //    we must check user_id ourselves — a non-owner Pro user must NOT be
    //    able to snapshot someone else's course).
    const { data: course, error: courseErr } = await adminClient
      .from('courses')
      .select('id, user_id, name, instructor, color, icon, grade_scale')
      .eq('id', courseId)
      .maybeSingle();
    if (courseErr) {
      console.error('[share-course] course load failed:', courseErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (!course) {
      return jsonResponse({ error: 'Course not found' }, 404);
    }
    if (course.user_id !== userId) {
      // Don't leak existence details — treat a foreign course as not found.
      return jsonResponse({ error: 'Course not found' }, 404);
    }

    // 5. Snapshot the task list at share time. Only the fields a recipient's
    //    private copy needs — completion state / scores are the OWNER's, and
    //    are reset/omitted so the recipient starts clean (importSharedCourse
    //    inserts is_completed=false and no score).
    const { data: tasks, error: tasksErr } = await adminClient
      .from('tasks')
      .select('title, type, due_date, due_time, weight, description, is_extra_credit')
      .eq('course_id', courseId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(MAX_SNAPSHOT_TASKS);
    if (tasksErr) {
      console.error('[share-course] tasks load failed:', tasksErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }

    // Owner display name for the recipient's preview ("Alex's CS 101"). Best
    // effort — a missing name just yields a generic preview, never an error.
    const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
    const ownerName =
      [meta.full_name, meta.name, meta.given_name].find(
        (v) => typeof v === 'string' && (v as string).trim().length > 0,
      ) as string | undefined;

    const snapshot = {
      course: {
        name: course.name,
        instructor: course.instructor ?? null,
        color: course.color,
        icon: course.icon,
        grade_scale: course.grade_scale ?? null,
      },
      tasks: (tasks ?? []).map((t) => ({
        title: t.title,
        type: t.type,
        due_date: t.due_date,
        due_time: t.due_time ?? null,
        weight: t.weight ?? null,
        description: t.description ?? null,
        is_extra_credit: t.is_extra_credit ?? false,
      })),
      owner_name: ownerName ? ownerName.trim() : null,
      shared_at: new Date().toISOString(),
    };

    // 6. Insert the share row. Retry once on a token unique-collision (23505)
    //    — astronomically unlikely, but cheap to handle correctly.
    let token = generateToken();
    let insertErr: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await adminClient.from('course_shares').insert({
        token,
        owner_user_id: userId,
        course_id: courseId,
        snapshot,
      });
      if (!error) {
        insertErr = null;
        break;
      }
      insertErr = error;
      if (error.code === '23505') {
        token = generateToken();
        continue;
      }
      break;
    }
    if (insertErr) {
      console.error('[share-course] share insert failed:', insertErr);
      return jsonResponse({ error: 'Could not create share link. Please try again.' }, 500);
    }

    const url = `${SHARE_LINK_BASE}/${encodeURIComponent(token)}`;
    return jsonResponse({ token, url }, 200);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));
