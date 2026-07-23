-- ============================================================
-- SEMORA FREE-TIER LIMITS v2
-- Free tier is now more generous, and scans reset monthly:
--   • Courses per semester:  2  -> 4
--   • Syllabus scans:        2 lifetime  ->  5 per CALENDAR MONTH (UTC)
--   • Tasks:                 unlimited (unchanged — never gated)
-- These are the SERVER-SIDE backstops. They must agree with the client
-- (lib/queries FREE_SCAN_LIMIT/FREE_COURSE_LIMIT + freeScanWindowStartIso)
-- and the parse-syllabus edge function. The scan window boundary is anchored
-- to UTC month start so all three layers compute the identical instant.
-- Both functions are create-or-replace supersedes of migration 009 — the
-- triggers themselves are unchanged and keep pointing at these functions.
-- ============================================================

-- Courses: 2 -> 4 per semester for free users.
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

  select count(*) into course_count
  from public.courses
  where user_id = new.user_id
    and semester_id = new.semester_id;

  if course_count >= 4 then
    raise exception 'Free accounts support up to 4 courses per semester. Upgrade to Pro for unlimited courses.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Scans: 2 lifetime -> 5 per calendar month (UTC) for free users. This trigger
-- is a backstop that counts syllabus_uploads only; the edge function is the
-- primary gate and additionally counts gemini_call_log successes. The month
-- boundary matches the client and edge function exactly.
create or replace function public.enforce_free_scan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scan_count integer;
begin
  if public.is_pro(new.user_id) then
    return new;
  end if;

  select count(*) into scan_count
  from public.syllabus_uploads
  where user_id = new.user_id
    and created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');

  if scan_count >= 5 then
    raise exception 'You''ve used your 5 free scans this month. Upgrade to Pro for unlimited syllabus scanning.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
