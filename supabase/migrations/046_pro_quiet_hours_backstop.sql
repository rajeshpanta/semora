-- ============================================================
-- SEMORA QUIET-HOURS IS A PRO FEATURE — SERVER BACKSTOP
-- Quiet hours is already gated in the app UI and enforced in the reminder
-- scheduler (forced off for non-Pro). This is the server backstop: a patched
-- or lapsed-Pro client can never PERSIST quiet_hours_enabled = true.
--
-- We COERCE (set false) rather than raise, so an unrelated profile update that
-- happens to carry a stale quiet_hours_enabled=true still succeeds instead of
-- failing the whole write. Mirrors how the scheduler forces it off for non-Pro.
-- ============================================================

create or replace function public.enforce_pro_quiet_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quiet_hours_enabled is true and not public.is_pro(new.id) then
    new.quiet_hours_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_pro_quiet_hours_trigger on public.profiles;
create trigger enforce_pro_quiet_hours_trigger
  before insert or update on public.profiles
  for each row execute function public.enforce_pro_quiet_hours();
