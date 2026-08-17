-- ============================================================
-- SEMORA — LECTURE CLEANUP (068)
--
-- Housekeeping after 065–067, from a pass with Supabase's own security
-- advisors:
--
--   1. `lecture_recordings_set_updated_at` was the ONLY function in the entire
--      project without a pinned `search_path` (advisor
--      `function_search_path_mutable`, 1 hit project-wide, and it was mine).
--      An unpinned search_path on a function that runs during another role's
--      write is the shape of a privilege-escalation bug, even when this
--      particular body only touches `new`.
--
--   2. Two reservation functions became dead when 067 replaced the reserve/
--      settle split with an atomic reserve and a full release. Both are
--      SECURITY DEFINER. Unused privileged code is exactly what gets called by
--      accident later, so it goes now rather than lingering as a footgun.
-- ============================================================

create or replace function public.lecture_recordings_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Superseded by reserve_lecture_for_recording(uuid, integer, integer) in 067,
-- which takes the capacity and stamps the lecture row in ONE transaction.
drop function if exists public.reserve_lecture_seconds(integer, integer);

-- Superseded by release_lecture_reservation(uuid). A finished lecture releases
-- its whole remaining reservation; there is no longer a case for shrinking a
-- reservation that is still meant to be held.
drop function if exists public.settle_lecture_reservation(uuid, integer);
