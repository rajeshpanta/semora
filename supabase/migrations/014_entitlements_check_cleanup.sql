-- Drop the stray `null` literal from the entitlements `plan` and
-- `platform` check constraints. `IN (..., null)` is a tautology that
-- doesn't actually permit NULLs (any comparison against NULL is
-- unknown); the columns are nullable, so NULLs are still allowed.
-- Pure cosmetic cleanup so the constraint reads what it means.

alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements
  add constraint entitlements_plan_check check (plan in ('monthly', 'annual'));

alter table public.entitlements drop constraint if exists entitlements_platform_check;
alter table public.entitlements
  add constraint entitlements_platform_check check (platform in ('ios', 'android'));
