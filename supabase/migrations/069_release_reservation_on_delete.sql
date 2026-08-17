-- ============================================================
-- SEMORA — RELEASE CAPACITY WHEN A LECTURE IS DELETED (069)
--
-- Found by inspecting the live ledger: `lecture_quota_day` was holding 10,800
-- seconds for lectures that no longer existed.
--
-- Every path that RELEASES a reservation went through the edge function —
-- cancel, finalize, the stale-reclaim sweep. But a lecture row can also simply
-- be DELETED, and none of those run then:
--
--   * the user taps "Delete recording" (lib/lectures.ts deletes the row directly),
--   * a course is deleted (no — course_id is ON DELETE SET NULL), or
--   * the account is deleted and `auth.users` cascades the lecture away.
--
-- In every one of those cases the seconds stayed subtracted from the day's
-- shared pool with nothing left to reclaim them: the sweep in
-- `reclaim_stale_lecture_reservations` looks for lecture ROWS holding a
-- reservation, and the row is gone.
--
-- The damage is bounded — the ledger is per-UTC-day, so a leak stops mattering
-- at midnight — but within a day it is capacity silently denied to other
-- students, which is exactly what this ledger exists to prevent.
--
-- A trigger, not more edge-function code, because the requirement is "whenever
-- a lecture ceases to exist" and only the database observes all of those.
-- ============================================================

create or replace function public.lecture_recordings_release_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.reserved_seconds, 0) > 0 then
    update public.lecture_quota_day
       set seconds_reserved = greatest(0, seconds_reserved - old.reserved_seconds),
           updated_at = now()
     where day = coalesce(old.reserved_day, (now() at time zone 'utc')::date);
  end if;
  return old;
end;
$$;

drop trigger if exists lecture_recordings_release_on_delete_trigger on public.lecture_recordings;
create trigger lecture_recordings_release_on_delete_trigger
  before delete on public.lecture_recordings
  for each row execute function public.lecture_recordings_release_on_delete();

comment on function public.lecture_recordings_release_on_delete() is
  'SEMORA: returns a deleted lecture''s held speech-to-text capacity to the daily pool. Covers user deletion and account cascade, which no edge-function path observes.';

-- Repair the ledger for reservations already stranded by deletions that
-- happened before this trigger existed: recompute each day from the lectures
-- that actually still hold capacity on it.
update public.lecture_quota_day q
   set seconds_reserved = coalesce((
         select sum(r.reserved_seconds)
           from public.lecture_recordings r
          where r.reserved_day = q.day
            and r.reserved_seconds > 0
       ), 0),
       updated_at = now();
