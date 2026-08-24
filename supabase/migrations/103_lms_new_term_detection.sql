-- ============================================================
-- SEMORA — CONNECT CANVAS ONCE
--
-- Until now a Canvas connection watched exactly the courses that were ticked
-- the day it was made. `fetchAssignmentsForConnection` filters the feed down to
-- courses holding an `lms_course_links` row, and `apply_lms_assignment_sync_service`
-- checks the same thing again; nothing anywhere creates a link after the
-- initial connect.
--
-- So at the turn of a term the feed fills with the next semester's courses,
-- carrying new Canvas course ids, and every one of their deadlines is silently
-- discarded. The sync then reports SUCCESS — `status` is computed as
-- `skipped > 0 ? 'partial' : 'success'`, and the discarding happens before the
-- RPC is ever called, so nothing is even counted as skipped. A connection that
-- has quietly stopped importing anything looks perfectly healthy, forever, and
-- the only remedy is for the student to work out on their own that they must
-- connect Canvas again.
--
-- This migration gives those discovered-but-unlinked courses somewhere to live
-- so the app can offer them instead of dropping them. Nothing here imports
-- anything: a pending row is a question, and only a student's confirmation
-- turns it into a course. Existing links, courses, tasks and completed terms
-- are untouched by design.
-- ============================================================

create table if not exists public.lms_pending_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.lms_connections(id) on delete cascade,

  -- The provider's identifier. A new term means new course shells, so this is
  -- what makes "already asked about" answerable across syncs.
  external_course_id text not null,
  external_name text not null,
  code text,

  -- The evidence the review screen shows, and what lib/termMatch.ts reads to
  -- propose a semester. A calendar feed carries no term field, so for feed
  -- connections these dates are the ONLY signal of which term a course is.
  item_count integer not null default 0,
  first_due date,
  last_due date,

  -- Canvas's own enrollment term, present on token/API connections. When the
  -- school states the term outright there is nothing left to infer.
  term_name text,
  term_start date,
  term_end date,

  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- Set when the student says "not mine". Kept rather than deleted so the same
  -- course is not re-offered on every hourly sync for the rest of the year;
  -- the connection screen can still list and restore them.
  ignored_at timestamptz,

  -- Set the moment a link is created for it. The row is kept briefly for
  -- auditing and cleaned up by the sync that next sees the course linked.
  resolved_at timestamptz,

  constraint lms_pending_courses_unique unique (connection_id, external_course_id)
);

comment on table public.lms_pending_courses is
  'SEMORA: Canvas/LMS courses a sync found that have no lms_course_links row yet — a new term, or courses the student did not tick at connect time. A question awaiting an answer, never an import.';

create index if not exists lms_pending_courses_open_idx
  on public.lms_pending_courses (user_id, connection_id)
  where ignored_at is null and resolved_at is null;

alter table public.lms_pending_courses enable row level security;

-- Students read and manage their own; the sync writes as service_role, which
-- bypasses RLS. No insert policy for `authenticated` on purpose: a pending row
-- is a statement about what the provider returned, and only the server is in a
-- position to make it.
drop policy if exists "own_pending_courses_read" on public.lms_pending_courses;
create policy "own_pending_courses_read" on public.lms_pending_courses
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own_pending_courses_update" on public.lms_pending_courses;
create policy "own_pending_courses_update" on public.lms_pending_courses
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own_pending_courses_delete" on public.lms_pending_courses;
create policy "own_pending_courses_delete" on public.lms_pending_courses
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─── the count, denormalised on purpose ─────────────────────────
-- canvasOfferFor() decides what six screens show — the web sidebar, the "+"
-- menu, the empty course list, two settings screens — and every one of them
-- renders off the single `lmsConnections` query. Making them each fire a
-- second query to learn whether a badge is due would be six network reads to
-- answer a question the sync already knew the answer to.
alter table public.lms_connections
  add column if not exists pending_courses_count integer not null default 0;

comment on column public.lms_connections.pending_courses_count is
  'SEMORA: how many courses this connection has found that are not linked yet. Non-zero means the connection is working but is NOT fully healthy — new courses are being held back awaiting review, and every entry point says so.';

-- ─── recording a sync''s findings ───────────────────────────────
-- Called by the lms-sync edge function with everything the provider returned.
-- One statement so a sync cannot leave the count disagreeing with the rows.
create or replace function public.record_lms_pending_courses(
  p_connection_id uuid,
  p_courses jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
  item jsonb;
  seen text[] := array[]::text[];
  open_count integer;
begin
  select user_id into owner from public.lms_connections where id = p_connection_id;
  if owner is null then
    return 0;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_courses, '[]'::jsonb))
  loop
    continue when nullif(btrim(item ->> 'external_course_id'), '') is null;
    seen := seen || (item ->> 'external_course_id');

    insert into public.lms_pending_courses (
      user_id, connection_id, external_course_id, external_name, code,
      item_count, first_due, last_due, term_name, term_start, term_end
    ) values (
      owner,
      p_connection_id,
      item ->> 'external_course_id',
      coalesce(nullif(btrim(item ->> 'external_name'), ''), 'Untitled course'),
      nullif(btrim(item ->> 'code'), ''),
      coalesce((item ->> 'item_count')::integer, 0),
      (item ->> 'first_due')::date,
      (item ->> 'last_due')::date,
      nullif(btrim(item ->> 'term_name'), ''),
      (item ->> 'term_start')::date,
      (item ->> 'term_end')::date
    )
    on conflict (connection_id, external_course_id) do update
      set external_name = excluded.external_name,
          code          = excluded.code,
          item_count    = excluded.item_count,
          first_due     = excluded.first_due,
          last_due      = excluded.last_due,
          term_name     = excluded.term_name,
          term_start    = excluded.term_start,
          term_end      = excluded.term_end,
          last_seen_at  = now();
  end loop;

  -- Courses the provider no longer lists, and courses that have since been
  -- linked, stop being questions. An ignored row is left alone: the student
  -- answered it, and re-asking every hour is what "ignore" exists to prevent.
  delete from public.lms_pending_courses p
   where p.connection_id = p_connection_id
     and p.ignored_at is null
     and (
       not (p.external_course_id = any(seen))
       or exists (
         select 1 from public.lms_course_links l
          where l.connection_id = p.connection_id
            and l.external_course_id = p.external_course_id
       )
     );

  select count(*) into open_count
    from public.lms_pending_courses p
   where p.connection_id = p_connection_id
     and p.ignored_at is null
     and p.resolved_at is null;

  update public.lms_connections
     set pending_courses_count = open_count
   where id = p_connection_id;

  return open_count;
end;
$$;

revoke all on function public.record_lms_pending_courses(uuid, jsonb) from public;
grant execute on function public.record_lms_pending_courses(uuid, jsonb) to service_role;

-- ─── answering the question ─────────────────────────────────────
-- Called from the app once the student has reviewed what was found and chosen
-- a semester. Creates the courses and their links in one transaction, so a
-- failure halfway cannot leave courses with no link (invisible to sync) or
-- links with no course (skipped forever by the sync RPC).
--
-- `source = 'lms'` matters beyond bookkeeping: enforce_free_course_limit (090)
-- reads it to admit Canvas courses without spending a free account's four
-- manual slots. The free ONE-semester limit (010) still applies, and is
-- enforced where it belongs — on the semester insert, before this is reached.
create or replace function public.link_lms_pending_courses(
  p_connection_id uuid,
  p_semester_id uuid,
  p_external_course_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pending record;
  created_course uuid;
  created integer := 0;
  palette text[] := array['#6B46C1','#0F766E','#B45309','#1D4ED8','#BE185D','#15803D','#7C3AED','#C2410C'];
  taken integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to import courses.' using errcode = 'P0001';
  end if;

  perform 1 from public.lms_connections
   where id = p_connection_id and user_id = auth.uid();
  if not found then
    raise exception 'LMS connection not found.' using errcode = 'P0001';
  end if;

  perform 1 from public.semesters
   where id = p_semester_id and user_id = auth.uid();
  if not found then
    raise exception 'Semester not found.' using errcode = 'P0001';
  end if;

  select count(*) into taken from public.courses
   where user_id = auth.uid() and semester_id = p_semester_id;

  for pending in
    select * from public.lms_pending_courses
     where connection_id = p_connection_id
       and user_id = auth.uid()
       and resolved_at is null
       and external_course_id = any(p_external_course_ids)
     order by external_name
  loop
    -- Already linked by a concurrent run: resolve the question, create nothing.
    if exists (
      select 1 from public.lms_course_links l
       where l.connection_id = p_connection_id
         and l.external_course_id = pending.external_course_id
    ) then
      update public.lms_pending_courses set resolved_at = now() where id = pending.id;
      continue;
    end if;

    insert into public.courses (user_id, semester_id, name, color, icon, source)
    values (
      auth.uid(),
      p_semester_id,
      pending.external_name,
      palette[(taken % array_length(palette, 1)) + 1],
      'book',
      'lms'
    )
    returning id into created_course;

    insert into public.lms_course_links (
      user_id, connection_id, external_course_id, external_name, local_course_id
    ) values (
      auth.uid(), p_connection_id, pending.external_course_id,
      pending.external_name, created_course
    );

    update public.lms_pending_courses set resolved_at = now() where id = pending.id;
    taken := taken + 1;
    created := created + 1;
  end loop;

  update public.lms_connections c
     set pending_courses_count = (
       select count(*) from public.lms_pending_courses p
        where p.connection_id = c.id
          and p.ignored_at is null
          and p.resolved_at is null
     )
   where c.id = p_connection_id;

  return created;
end;
$$;

revoke all on function public.link_lms_pending_courses(uuid, uuid, text[]) from public;
grant execute on function public.link_lms_pending_courses(uuid, uuid, text[]) to authenticated;

-- ─── "not mine" ─────────────────────────────────────────────────
-- Two callers, one function.
--
--   1. connect time: the courses a student did NOT tick. Without this the
--      initial sync would immediately re-offer them as "new courses found",
--      turning a deliberate choice into a nag.
--   2. the review screen: dismissing a course that is not theirs — a shared
--      shell, a training site, a club calendar the school runs through Canvas.
--
-- Ignoring is reversible and non-destructive: the row stays, carries its dates,
-- and can be restored from the connection screen. Nothing is deleted, because
-- a student who dismisses the wrong thing should not have to reconnect Canvas
-- to get it back.
create or replace function public.set_lms_pending_ignored(
  p_connection_id uuid,
  p_courses jsonb,
  p_ignored boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  changed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage this connection.' using errcode = 'P0001';
  end if;

  perform 1 from public.lms_connections
   where id = p_connection_id and user_id = auth.uid();
  if not found then
    raise exception 'LMS connection not found.' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_courses, '[]'::jsonb))
  loop
    continue when nullif(btrim(item ->> 'external_course_id'), '') is null;

    insert into public.lms_pending_courses (
      user_id, connection_id, external_course_id, external_name, code,
      item_count, first_due, last_due, term_name, term_start, term_end, ignored_at
    ) values (
      auth.uid(),
      p_connection_id,
      item ->> 'external_course_id',
      coalesce(nullif(btrim(item ->> 'external_name'), ''), 'Untitled course'),
      nullif(btrim(item ->> 'code'), ''),
      coalesce((item ->> 'item_count')::integer, 0),
      (item ->> 'first_due')::date,
      (item ->> 'last_due')::date,
      nullif(btrim(item ->> 'term_name'), ''),
      (item ->> 'term_start')::date,
      (item ->> 'term_end')::date,
      case when p_ignored then now() else null end
    )
    on conflict (connection_id, external_course_id) do update
      set ignored_at = case when p_ignored then coalesce(public.lms_pending_courses.ignored_at, now()) else null end,
          last_seen_at = now();

    changed := changed + 1;
  end loop;

  update public.lms_connections c
     set pending_courses_count = (
       select count(*) from public.lms_pending_courses p
        where p.connection_id = c.id
          and p.ignored_at is null
          and p.resolved_at is null
     )
   where c.id = p_connection_id;

  return changed;
end;
$$;

revoke all on function public.set_lms_pending_ignored(uuid, jsonb, boolean) from public;
grant execute on function public.set_lms_pending_ignored(uuid, jsonb, boolean) to authenticated;
