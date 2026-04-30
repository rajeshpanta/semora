-- ============================================================
-- FREE TIER: 1 semester per user
-- ============================================================
-- Free accounts can have up to 1 semester. Pro accounts unlimited.
-- Enforced in the database so it can't be bypassed by clients
-- hitting the REST API directly.
-- ============================================================

create or replace function public.enforce_free_semester_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  semester_count integer;
begin
  -- Pro users have no limit
  if public.is_pro(new.user_id) then
    return new;
  end if;

  select count(*) into semester_count
  from public.semesters
  where user_id = new.user_id;

  if semester_count >= 1 then
    raise exception 'Free accounts support up to 1 semester. Upgrade to Pro for unlimited semesters.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_semester_limit_trigger on public.semesters;
create trigger enforce_free_semester_limit_trigger
  before insert on public.semesters
  for each row execute function public.enforce_free_semester_limit();
