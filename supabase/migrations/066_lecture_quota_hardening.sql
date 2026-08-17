-- ============================================================
-- SEMORA — LECTURE QUOTA HARDENING (066)
--
-- 065 shipped the lecture feature with three holes that an adversarial review
-- found, all variations on the same mistake: TRUSTING THE CLIENT TO REACH THE
-- SERVER'S GATES.
--
--   1. `own_lecture_recordings` was `for all to authenticated`, so a client
--      could INSERT its own lecture row with supabase-js and never call the
--      `start` action at all — skipping both the free-lecture check and the
--      global capacity reservation.
--
--   2. The `lecture_usage_log` row that IS the free-lecture quota was written
--      only when a lecture finalized, and finalization requires
--      `segment_count`, which the client sets. A client that simply never
--      declared itself finished got unlimited transcription and was never
--      charged — while still being able to read every segment's transcript
--      directly under RLS.
--
--   3. Reservations were taken for the 90-minute worst case and released only
--      on paths the client chooses to walk. An app killed mid-recording leaked
--      5400 seconds of shared capacity with no way to reclaim it; four of those
--      turned the feature off for every user for the rest of the day.
--
-- The through-line of the fix: capacity is tracked ON THE LECTURE ROW, so
-- releasing it is a single atomic operation that is safe to repeat and cannot
-- be replayed for extra credit; and the quota is charged when the COST IS
-- INCURRED (the first transcribed segment), not when the client says so.
-- ============================================================

-- ─── Reservation state lives on the lecture ─────────────────────
-- Holding the amount and the day here is what makes release idempotent: the
-- release zeroes the column and refunds exactly what it found, so a second call
-- finds zero and refunds nothing. `reserved_day` fixes a lecture that starts at
-- 23:55 UTC and ends at 00:10 — the release must credit back the day the
-- reservation was actually taken on, not "today".
alter table public.lecture_recordings
  add column if not exists reserved_seconds integer not null default 0;
alter table public.lecture_recordings
  add column if not exists reserved_day date;

-- Claim timestamps for the two generation steps, so a killed invocation cannot
-- park a lecture in 'generating' (or leave the quiz button spinning) forever.
alter table public.lecture_recordings
  add column if not exists notes_started_at timestamptz;
alter table public.lecture_recordings
  add column if not exists quiz_started_at timestamptz;

-- Reclaim sweep reads this.
create index if not exists lecture_recordings_reserved_idx
  on public.lecture_recordings (reserved_day)
  where reserved_seconds > 0;

-- ─── Charging the free lecture exactly once ─────────────────────
-- The charge moves to the FIRST transcribed segment. This unique index is what
-- makes that safe to attempt on every segment: the second and later attempts
-- collide and are ignored, so one lecture can never be charged twice, and a
-- lecture that transcribes even one segment can never escape being charged.
create unique index if not exists lecture_usage_log_user_lecture_uniq
  on public.lecture_usage_log (user_id, lecture_id)
  where lecture_id is not null;

-- ─── RLS: clients may no longer mint lecture rows ───────────────
-- Split the blanket `for all` into the three commands the app genuinely needs.
-- INSERT is deliberately absent: `lecture_recordings` rows are created ONLY by
-- the lecture-transcribe edge function (service role), which is the single
-- place the entitlement and capacity checks live. Without this, every other
-- gate in this migration is decorative.
--
-- lecture_segments KEEPS its `for all` policy on purpose — the client uploads
-- audio and inserts those rows directly (lib/lectures.ts uploadSegment), and
-- the parent-owner trigger plus the per-lecture second cap bound what that can
-- cost.
drop policy if exists "own_lecture_recordings" on public.lecture_recordings;

drop policy if exists "own_lecture_recordings_select" on public.lecture_recordings;
create policy "own_lecture_recordings_select" on public.lecture_recordings
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own_lecture_recordings_update" on public.lecture_recordings;
create policy "own_lecture_recordings_update" on public.lecture_recordings
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_lecture_recordings_delete" on public.lecture_recordings;
create policy "own_lecture_recordings_delete" on public.lecture_recordings
  for delete to authenticated
  using (auth.uid() = user_id);

-- ─── Reservation primitives ─────────────────────────────────────
-- reserve now RETURNS THE DAY it charged (null when it did not fit), so the
-- caller can stamp that exact day on the lecture instead of recomputing "today"
-- later and possibly landing on the wrong side of midnight.
drop function if exists public.reserve_lecture_seconds(integer, integer);

create or replace function public.reserve_lecture_seconds(
  p_seconds     integer,
  p_cap_seconds integer
)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'utc')::date;
  ok    boolean := false;
begin
  if p_seconds is null or p_seconds <= 0 then
    return today;
  end if;

  insert into public.lecture_quota_day (day) values (today)
  on conflict (day) do nothing;

  update public.lecture_quota_day
     set seconds_reserved = seconds_reserved + p_seconds,
         updated_at = now()
   where day = today
     and seconds_reserved + p_seconds <= p_cap_seconds
  returning true into ok;

  if coalesce(ok, false) then
    return today;
  end if;
  return null;
end;
$$;

-- Release whatever a specific lecture is holding, exactly once.
--
-- The SELECT ... FOR UPDATE is the whole point: it serializes concurrent
-- releases on the lecture row, so the classic double-refund (two callers both
-- read 5400, both subtract it) cannot happen. Returns the number of seconds
-- actually returned, which is 0 on every call after the first.
drop function if exists public.release_lecture_seconds(integer);

create or replace function public.release_lecture_reservation(p_lecture_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds integer;
  v_day     date;
begin
  select reserved_seconds, reserved_day
    into v_seconds, v_day
    from public.lecture_recordings
   where id = p_lecture_id
   for update;

  if v_seconds is null or v_seconds <= 0 then
    return 0;
  end if;

  update public.lecture_recordings
     set reserved_seconds = 0
   where id = p_lecture_id;

  update public.lecture_quota_day
     set seconds_reserved = greatest(0, seconds_reserved - v_seconds),
         updated_at = now()
   where day = coalesce(v_day, (now() at time zone 'utc')::date);

  return v_seconds;
end;
$$;

-- Reduce a live reservation to what was actually used, without releasing it.
-- Called when a lecture finishes: an 8-minute lecture must stop holding 90
-- minutes of the shared pool for the rest of the day.
create or replace function public.settle_lecture_reservation(
  p_lecture_id  uuid,
  p_used_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds integer;
  v_day     date;
  v_refund  integer;
begin
  select reserved_seconds, reserved_day
    into v_seconds, v_day
    from public.lecture_recordings
   where id = p_lecture_id
   for update;

  if v_seconds is null or v_seconds <= 0 then
    return 0;
  end if;

  v_refund := greatest(0, v_seconds - greatest(0, coalesce(p_used_seconds, 0)));

  update public.lecture_recordings
     set reserved_seconds = v_seconds - v_refund
   where id = p_lecture_id;

  if v_refund > 0 then
    update public.lecture_quota_day
       set seconds_reserved = greatest(0, seconds_reserved - v_refund),
           updated_at = now()
     where day = coalesce(v_day, (now() at time zone 'utc')::date);
  end if;

  return v_refund;
end;
$$;

-- Reclaim capacity from recordings that were abandoned — the app was killed,
-- the phone died, the student walked out. Without this, every abandoned
-- recording permanently removes 90 minutes from the day's shared pool.
-- Called opportunistically at the start of each new recording, which is both
-- the moment capacity matters and a moment we are already doing work.
create or replace function public.reclaim_stale_lecture_reservations(p_older_than_minutes integer default 180)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         record;
  reclaimed integer := 0;
begin
  for r in
    select id
      from public.lecture_recordings
     where reserved_seconds > 0
       and status in ('recording', 'uploading')
       and updated_at < now() - make_interval(mins => greatest(1, p_older_than_minutes))
     limit 50
  loop
    reclaimed := reclaimed + public.release_lecture_reservation(r.id);
  end loop;
  return reclaimed;
end;
$$;

revoke all on function public.reserve_lecture_seconds(integer, integer) from public, anon, authenticated;
revoke all on function public.release_lecture_reservation(uuid) from public, anon, authenticated;
revoke all on function public.settle_lecture_reservation(uuid, integer) from public, anon, authenticated;
revoke all on function public.reclaim_stale_lecture_reservations(integer) from public, anon, authenticated;
grant execute on function public.reserve_lecture_seconds(integer, integer) to service_role;
grant execute on function public.release_lecture_reservation(uuid) to service_role;
grant execute on function public.settle_lecture_reservation(uuid, integer) to service_role;
grant execute on function public.reclaim_stale_lecture_reservations(integer) to service_role;

comment on function public.release_lecture_reservation(uuid) is
  'SEMORA: return a lecture''s held speech-to-text capacity exactly once (idempotent, day-correct). Service-role only.';
comment on function public.settle_lecture_reservation(uuid, integer) is
  'SEMORA: shrink a live reservation to the seconds actually used. Service-role only.';
comment on function public.reclaim_stale_lecture_reservations(integer) is
  'SEMORA: release capacity held by abandoned recordings. Service-role only.';
