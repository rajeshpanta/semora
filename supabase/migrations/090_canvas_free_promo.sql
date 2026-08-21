-- ============================================================
-- SEMORA: CANVAS SYNC IS FREE, FOR A LIMITED TIME
-- ============================================================
-- Canvas sync stops being a Pro feature and becomes the reason to sign up.
-- Everything else about the free tier is UNCHANGED and deliberately so:
--
--   still free, still capped:  one lifetime AI action (scan or lecture),
--                              4 manually-added courses per semester,
--                              1 semester
--   now free, uncapped:        every course Canvas returns, and every
--                              assignment on them
--
-- The bet: a student who types four classes in by hand has done work they
-- will not throw away, and a student whose semester filled itself in ten
-- seconds has seen the only thing Semora does that their LMS does not. The
-- first is a chore, the second is the product. Charging for the second while
-- giving away the first had it backwards.
--
-- ─── The four gates this has to move ────────────────────────────
-- Canvas was gated in four places and only three of them were obvious:
--   1. canvasOfferFor()          client, lib/lms.ts
--   2. route guards              client, app/settings/lms*.tsx
--   3. requirePro()              server, supabase/functions/lms-sync
--   4. enforce_free_course_limit THIS FILE, and the one that would have
--                                broken the feature silently
--
-- (4) is a BEFORE INSERT trigger on courses. Canvas courses are inserted by
-- the client in connectLms(), one row per class, so a free student importing
-- six Canvas classes would have been refused by Postgres on the fifth —
-- halfway through an import, after the connection already existed. Removing
-- the Pro checks in 1-3 without this would have shipped a feature that fails
-- for exactly the students it was opened up for.
-- ============================================================

-- ─── the switch ─────────────────────────────────────────────────
-- A row, not a constant. Semora has no OTA (expo-updates is not installed),
-- so a promo baked into the app binary can only be ended by an App Store
-- release, and every install that has not updated would keep advertising a
-- free offer the server had already stopped honouring — a 402 dead end at the
-- end of a promise. Ending it here is one UPDATE and takes effect everywhere
-- at once, on clients that shipped months ago.
--
-- Readable by authenticated users on purpose: this is an advertisement, not a
-- secret. Writable only by service_role.
create table if not exists public.app_promos (
  key        text primary key,
  active     boolean     not null default false,
  starts_at  timestamptz,
  ends_at    timestamptz,
  note       text,
  updated_at timestamptz not null default now()
);

comment on table public.app_promos is
  'SEMORA (090): server-controlled promotional switches. Flip `active` to start or end an offer without an app release — Semora has no OTA, so a client constant would strand old installs advertising an offer the server no longer honours.';

alter table public.app_promos enable row level security;
revoke all on public.app_promos from anon, authenticated;
grant select on public.app_promos to authenticated, service_role;

drop policy if exists app_promos_read on public.app_promos;
create policy app_promos_read on public.app_promos
  for select to authenticated using (true);

insert into public.app_promos (key, active, note)
values ('canvas_free', true, 'Canvas sync free for all accounts, no Pro required. Claimed connections are grandfathered — see lms_connections.free_promo_claimed_at.')
on conflict (key) do nothing;

-- ─── is the offer live right now ────────────────────────────────
-- `starts_at`/`ends_at` are optional. A promo with neither is on until
-- somebody turns it off, which is the honest default for "limited time" when
-- the limit has not been decided yet.
create or replace function public.promo_active(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.active
        and (p.starts_at is null or p.starts_at <= now())
        and (p.ends_at   is null or p.ends_at   >  now())
     from public.app_promos p
     where p.key = p_key),
    false);
$$;

grant execute on function public.promo_active(text) to authenticated, service_role;

-- ─── who claimed it ─────────────────────────────────────────────
-- "Limited time" means limited time to CLAIM, not limited time to keep. A
-- student who connects Canvas during the offer keeps syncing after it closes.
--
-- The alternative — switching their sync off on a date — means deleting the
-- vault credential (that is what disable_lms_background_sync does), so their
-- deadlines silently stop moving and reconnecting is a full redo. Breaking
-- something that was working, on a schedule they never agreed to, is not a
-- growth tactic; it is the thing that gets a one-star review that mentions
-- bait and switch.
alter table public.lms_connections
  add column if not exists free_promo_claimed_at timestamptz;

comment on column public.lms_connections.free_promo_claimed_at is
  'SEMORA (090): set when a non-Pro account created this connection while the canvas_free promo was live. Non-null means grandfathered — this connection keeps syncing after the offer closes.';

-- Stamped by the database, not the client. The claim is what survives the
-- promo ending, so a client that could write it could mint itself permanent
-- free sync after the offer closed — and 037's policy is `for all`, which
-- means the owner of a row may UPDATE it. Both directions are therefore shut:
-- INSERT overwrites whatever arrived with the truth, and UPDATE restores the
-- original value no matter what was sent. The column is server-owned; the
-- client's copy of it is display data.
create or replace function public.stamp_free_promo_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Immutable once written, and un-writable if it was not.
    new.free_promo_claimed_at := old.free_promo_claimed_at;
    return new;
  end if;

  new.free_promo_claimed_at := case
    when public.is_pro(new.user_id) then null
    when public.promo_active('canvas_free') then now()
    else null
  end;
  return new;
end;
$$;

drop trigger if exists lms_connections_stamp_promo_claim on public.lms_connections;
create trigger lms_connections_stamp_promo_claim
  before insert on public.lms_connections
  for each row execute function public.stamp_free_promo_claim();

drop trigger if exists lms_connections_freeze_promo_claim on public.lms_connections;
create trigger lms_connections_freeze_promo_claim
  before update on public.lms_connections
  for each row execute function public.stamp_free_promo_claim();

-- ─── may this account sync an LMS at all ────────────────────────
-- One rule, called by the trigger below AND by the lms-sync edge function, so
-- the client gate, the server gate and the row-level gate cannot drift. 044
-- learned this the hard way with the scan limit: "the three layers disagree
-- and the user is either blocked early or bypasses the cap."
create or replace function public.lms_access_allowed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_pro(uid)
      or public.promo_active('canvas_free')
      -- Grandfathered: connected while the offer was live.
      or exists (
        select 1 from public.lms_connections c
        where c.user_id = uid and c.free_promo_claimed_at is not null
      );
$$;

grant execute on function public.lms_access_allowed(uuid) to authenticated, service_role;

comment on function public.lms_access_allowed(uuid) is
  'SEMORA (090): may this account connect and sync an LMS? Pro, or the canvas_free promo is live, or they claimed it while it was. The single source of truth for lms-sync and enforce_free_course_limit.';

-- ─── where a course came from ───────────────────────────────────
-- The course limit now has to distinguish a class a student typed in from a
-- class Canvas handed them, and it has to do so in a BEFORE INSERT trigger —
-- before the lms_course_links row that would otherwise prove it exists.
-- Hence a column on the row itself.
--
-- Mirrors tasks.source, which has always recorded the same distinction.
alter table public.courses
  add column if not exists source text not null default 'manual';

do $$ begin
  alter table public.courses
    add constraint courses_source_check check (source in ('manual', 'scan', 'lms'));
exception when duplicate_object then null;
end $$;

comment on column public.courses.source is
  'SEMORA (090): manual | scan | lms. Only non-lms rows count against the free per-semester course limit — Canvas classes are uncapped under the canvas_free promo.';

-- Backfill from the links that already exist. Without this, every course an
-- existing Canvas user imported would read as manual and permanently occupy
-- their free allowance.
update public.courses c
   set source = 'lms'
 where c.source = 'manual'
   and exists (select 1 from public.lms_course_links l where l.local_course_id = c.id);

create index if not exists courses_user_semester_source_idx
  on public.courses (user_id, semester_id, source);

-- ─── the limit, rewritten ───────────────────────────────────────
-- Two changes from 044:
--
--   1. An lms course is admitted without counting, when the account is
--      allowed an LMS at all. "However many Canvas pulls" is the whole offer.
--   2. The count for a MANUAL course now excludes lms rows. Otherwise
--      importing six Canvas classes would consume a free student's four
--      manual slots and they could never add the seminar Canvas does not
--      know about — which would make the gift feel like a trap.
--
-- ─── KNOWN HOLE, stated rather than hidden ──────────────────────
-- `source` arrives from the client, so a patched client could insert
-- source='lms' and mint unlimited free courses. The `lms_connections` guard
-- below raises the bar (you must first forge a connection row) but does not
-- close it; closing it properly means moving course creation into the
-- service-role edge function, which is a larger change than this offer needs.
-- semora_suspect_lms_courses at the bottom of this file makes the abuse
-- visible instead of leaving us blind to it. The pre-existing cap was worth
-- roughly four courses to defeat; this is the same order of prize.
create or replace function public.enforce_free_course_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  course_count integer;
begin
  if public.is_pro(new.user_id) then
    return new;
  end if;

  if new.source = 'lms' then
    if not public.lms_access_allowed(new.user_id) then
      raise exception 'Connecting a learning platform is a Pro feature. Upgrade to import your courses and assignments.'
        using errcode = 'P0001';
    end if;
    -- A course cannot be LMS-sourced without an LMS connection to source it
    -- from. connectLms() inserts the connection first, so this holds for the
    -- real flow and costs a forger an extra step.
    if not exists (select 1 from public.lms_connections c where c.user_id = new.user_id) then
      raise exception 'An LMS course requires a connected learning platform.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select count(*) into course_count
  from public.courses
  where user_id = new.user_id
    and semester_id = new.semester_id
    and source <> 'lms';

  if course_count >= 4 then
    raise exception 'Free accounts support up to 4 courses per semester. Upgrade to Pro for unlimited courses.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ─── watch the hole ─────────────────────────────────────────────
-- Free accounts holding courses that claim to come from an LMS but have no
-- link backing them. Expected to be empty. A non-empty result is either abuse
-- or a bug in connectLms's rollback — both worth knowing about, and neither
-- visible without asking.
create or replace view public.semora_suspect_lms_courses as
  select
    c.user_id,
    count(*)          as unlinked_lms_courses,
    min(c.created_at) as first_seen,
    max(c.created_at) as last_seen
  from public.courses c
  where c.source = 'lms'
    and not exists (select 1 from public.lms_course_links l where l.local_course_id = c.id)
    and not public.is_pro(c.user_id)
  group by c.user_id;

revoke all on public.semora_suspect_lms_courses from anon, authenticated;
grant select on public.semora_suspect_lms_courses to service_role;

comment on view public.semora_suspect_lms_courses is
  'SEMORA (090): free accounts with source=''lms'' courses that no lms_course_link backs. Should be empty; non-empty means a forged client or a failed connectLms rollback.';

-- ─── did the giveaway work ──────────────────────────────────────
-- Same discipline as 089: an offer nobody measures is an offer nobody can
-- decide about. This is the number that says whether to keep it running, and
-- the one that says what it cost — a claim from an account that was never
-- going to pay is free growth, a claim from one that would have is churn.
create or replace view public.semora_canvas_free_claims as
  select
    date_trunc('day', c.free_promo_claimed_at) as day,
    count(*)                                   as claims,
    count(distinct c.user_id)                  as students,
    count(*) filter (where ent.is_pro)         as later_upgraded,
    sum(links.n)                               as courses_imported
  from public.lms_connections c
  left join public.entitlements ent on ent.user_id = c.user_id
  left join lateral (
    select count(*) as n from public.lms_course_links l where l.connection_id = c.id
  ) links on true
  where c.free_promo_claimed_at is not null
  group by date_trunc('day', c.free_promo_claimed_at);

revoke all on public.semora_canvas_free_claims from anon, authenticated;
grant select on public.semora_canvas_free_claims to service_role;

comment on view public.semora_canvas_free_claims is
  'SEMORA (090): canvas_free promo claims per day, with classes imported and how many claimants later bought Pro. `later_upgraded` is the whole question — free Canvas is worth running exactly as long as it feeds conversion rather than replacing it.';
