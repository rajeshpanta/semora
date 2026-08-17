-- ============================================================
-- SEMORA — ATOMIC LECTURE RESERVATION (067)
--
-- 066 split reserving capacity from recording who holds it, leaving a two-step
-- sequence in the edge function: take from the global pool, then stamp the
-- amount on the lecture row. A failure between those two statements takes
-- capacity that nothing is tracking — it cannot be reclaimed, because the
-- reclaim sweep looks for `reserved_seconds > 0`, and cannot be released,
-- because nothing knows it exists. It would sit there until the UTC day rolled
-- over.
--
-- One function, one transaction, no window.
-- ============================================================

create or replace function public.reserve_lecture_for_recording(
  p_lecture_id  uuid,
  p_seconds     integer,
  p_cap_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'utc')::date;
  ok    boolean := false;
begin
  if p_seconds is null or p_seconds <= 0 then
    return true;
  end if;

  insert into public.lecture_quota_day (day) values (today)
  on conflict (day) do nothing;

  -- The WHERE clause is the admission test: concurrent callers serialize on
  -- this row, so the second one sees the first one's total and is refused.
  update public.lecture_quota_day
     set seconds_reserved = seconds_reserved + p_seconds,
         updated_at = now()
   where day = today
     and seconds_reserved + p_seconds <= p_cap_seconds
  returning true into ok;

  if not coalesce(ok, false) then
    return false;
  end if;

  -- Same transaction: if this fails, the reservation above rolls back with it,
  -- which is exactly the property the split version could not offer.
  update public.lecture_recordings
     set reserved_seconds = p_seconds,
         reserved_day     = today
   where id = p_lecture_id;

  if not found then
    raise exception 'Lecture % not found while reserving capacity', p_lecture_id
      using errcode = '23503';
  end if;

  return true;
end;
$$;

revoke all on function public.reserve_lecture_for_recording(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_lecture_for_recording(uuid, integer, integer) to service_role;

comment on function public.reserve_lecture_for_recording(uuid, integer, integer) is
  'SEMORA: atomically take global speech-to-text capacity for today AND stamp it on the lecture row. Service-role only.';
