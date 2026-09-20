-- A feed only vouches for the window it showed
--
-- MOODLE_PLAN.md Phase 3.1. A copy of mark_canvas_calendar_feed_removed
-- (migration 120) with exactly three differences, and no others:
--
--   1. the connection check accepts any calendar_feed provider, not just canvas
--   2. the three date predicates take the window as arguments instead of the
--      hard-coded `current_date - 25 .. current_date + 360`
--   3. the exception text no longer says "Canvas"
--
-- Everything else — the service-role gate, the empty-feed and short-feed
-- refusals, note_lms_removal_refused, the untouched-only delete, the
-- mark-touched update — is verbatim, because it is the part that stops a
-- parser mistake from deleting a student's work.
--
-- WHY THE WINDOW HAS TO BE AN ARGUMENT
--
-- Canvas's -25/+360 encodes Canvas's own documented feed window. Moodle's is
-- whatever the school's administrator set: the default reaches a year ahead,
-- but the choices go down to 30 days and even 5, and the hard 60-day
-- `recentupcoming` preset is the only floor. Reusing Canvas's numbers would
-- treat everything past a narrowed school's horizon as deleted — which is to
-- say it would delete a student's whole second semester because their IT
-- department picked a smaller number.
--
-- mark_canvas_calendar_feed_removed is NOT modified and NOT dropped. Canvas
-- keeps calling it, unchanged, and its behaviour is asserted identical in
-- supabase/tests/152_*.test.sql.
--
-- ADDITIVE. Nothing calls this yet: the Moodle sync path passes
-- removalSafe = false until the soak in Phase 2 has run and the owner has said
-- yes to Moodle removals (MOODLE_PLAN.md §6, decision 3).

create or replace function public.mark_lms_calendar_feed_removed(
  p_user_id uuid,
  p_connection_id uuid,
  p_received_ids text[],
  p_window_start date,
  p_window_end date,
  -- Every course key the feed carried this run. Optional, and only ever used
  -- to tell a refusal apart from a term ending (3.4): when the work that went
  -- missing belongs entirely to courses that stopped appearing at all, the
  -- feed did not shrink for a suspicious reason — the student's enrolment did.
  p_present_course_ids text[] default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  removed   integer := 0;
  marked    integer := 0;
  received  integer := coalesce(array_length(p_received_ids, 1), 0);
  on_file   integer := 0;
  orphaned  integer := 0;
  reason    text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  -- A window that is empty or inverted would silently match nothing, which
  -- reads as "there was nothing to remove" rather than "the caller is wrong".
  if p_window_start is null or p_window_end is null or p_window_end < p_window_start then
    raise exception 'A removal window is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.lms_connections
    where id = p_connection_id
      and user_id = p_user_id
      and connection_method = 'calendar_feed'
      and provider in ('canvas', 'moodle')
  ) then
    raise exception 'Calendar feed connection not found' using errcode = '42501';
  end if;

  select count(*) into on_file
  from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and lms_removed_at is null
    and due_date between p_window_start and p_window_end;

  -- MOODLE_PLAN.md 3.4. Of the in-window work on file, how much belongs to a
  -- course that did not appear in this feed at all? Whole courses vanishing at
  -- once is what the end of a term looks like, and it is the one shape that
  -- trips the guards below every single hour for every student at the same
  -- time of year. Naming it does not change what happens — nothing is deleted
  -- either way — it changes what the alert says, so an inbox full of
  -- `short_feed` in December is not mistaken for a parser that broke.
  --
  -- Null means the caller did not say, and then this stays 0 and every
  -- refusal reads exactly as it did before.
  if p_present_course_ids is not null then
    select count(*) into orphaned
    from public.tasks t
    where t.user_id = p_user_id
      and t.lms_connection_id = p_connection_id
      and t.lms_removed_at is null
      and t.due_date between p_window_start and p_window_end
      and t.lms_external_course_id is not null
      and not (t.lms_external_course_id = any(p_present_course_ids));
  end if;

  -- An outage that answers 200 with an empty calendar is indistinguishable
  -- from "the student unenrolled from everything", so it is never trusted.
  if received = 0 and on_file > 0 then
    reason := case when orphaned >= on_file then 'term_end' else 'empty_feed' end;
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, reason);
    return 0;
  end if;

  if on_file >= 4 and received * 2 < on_file then
    -- The shortfall is everything the vanished courses were holding, so the
    -- feed is not short — it is exactly as long as the student's remaining
    -- enrolments. Still refused: a term ending is precisely when a mistake
    -- would cost the most.
    reason := case when orphaned >= on_file - received then 'term_end' else 'short_feed' end;
    perform public.note_lms_removal_refused(p_connection_id, received, on_file, reason);
    return 0;
  end if;

  -- Only work the student has not touched. Anything they completed, scored,
  -- re-dated, overrode or broke into subtasks is theirs now, not the feed's.
  delete from public.tasks
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and due_date between p_window_start and p_window_end
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null
    and not is_completed
    and score is null
    and points_earned is null
    and (lms_synced_due_date is null or due_date is not distinct from lms_synced_due_date)
    and (lms_synced_due_time is null or due_time is not distinct from lms_synced_due_time)
    and lms_field_overrides = '{}'::jsonb
    and not exists (select 1 from public.task_subtasks s where s.task_id = tasks.id);
  get diagnostics removed = row_count;

  update public.tasks
  set lms_removed_at = now(), lms_last_synced_at = now()
  where user_id = p_user_id
    and lms_connection_id = p_connection_id
    and due_date between p_window_start and p_window_end
    and not (lms_external_id = any(coalesce(p_received_ids, array[]::text[])))
    and lms_removed_at is null;
  get diagnostics marked = row_count;

  return removed + marked;
end;
$function$;

revoke all on function public.mark_lms_calendar_feed_removed(uuid, uuid, text[], date, date, text[])
  from public, anon, authenticated;
grant execute on function public.mark_lms_calendar_feed_removed(uuid, uuid, text[], date, date, text[])
  to service_role;

comment on function public.mark_lms_calendar_feed_removed(uuid, uuid, text[], date, date, text[]) is
  'SEMORA (152): reconciles a calendar-feed connection against the window the feed actually vouched for. '
  'A copy of mark_canvas_calendar_feed_removed (120) with the window as arguments and any calendar_feed '
  'provider accepted, because Moodle''s export horizon is set by each school''s administrator and can be '
  'as short as 30 days. Canvas continues to use the original function unchanged.';
