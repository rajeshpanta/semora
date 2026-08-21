-- ============================================================
-- SEMORA: ONE MANUAL COURSE, AND AS MANY AS CANVAS RETURNS
-- ============================================================
-- The free per-semester course limit drops from 4 to 1.
--
-- Four was set in 044, when typing a class in was the only free way to get one
-- into Semora. Under that constraint four was a kindness. It is now the wrong
-- shape: 090 made Canvas sync free and uncapped, so the free tier's answer to
-- "how do I get my semester in" is no longer "type it four times" — it is
-- "connect Canvas and it arrives, all of it, in ten seconds".
--
-- Adding a class by hand is the tedious path: a name, a colour, then every
-- deadline one at a time. Being generous with that was being generous with the
-- chore while charging for the thing that removes it. One manual course stays
-- because there is always the seminar or the lab an LMS does not carry, and
-- refusing that outright would be mean rather than pointed.
--
-- ─── NOBODY LOSES A COURSE ──────────────────────────────────────
-- This is a BEFORE INSERT trigger. It can refuse the next course; it cannot
-- reach back and remove one. A free account already holding four keeps all
-- four, sees them all, and is simply not offered a fifth. That property is why
-- this can ship as a straight number change instead of a migration plan.
--
-- ─── MUST MATCH THE CLIENT ──────────────────────────────────────
-- FREE_COURSE_LIMIT in lib/syllabus.ts. 044 wrote down what happens when these
-- drift — "the user is either blocked early or bypasses the cap" — and the
-- drift is silent in both directions. The number lives in exactly two places
-- and this comment is the pointer between them.
--
-- Everything else 090 established is preserved verbatim: source='lms' rows are
-- admitted without counting and never counted against the manual allowance, an
-- lms course still requires a connection to exist, and lms_access_allowed is
-- still the single gate. Only the integer changes.
-- ============================================================

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

  -- Wording matters as much as the number: isFreeLimitError (lib/syllabus.ts)
  -- matches on "free accounts support", and a miss there means this refusal
  -- reaches the student as a raw Postgres error with no way forward. Canvas is
  -- named first because it is the free answer — quoting a price to somebody
  -- who has a free route available is how a limit reads as a shakedown.
  if course_count >= 1 then
    raise exception 'Free accounts support 1 course per semester that you add yourself. Connect Canvas to bring every class across for free, or upgrade to Pro for unlimited courses.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
