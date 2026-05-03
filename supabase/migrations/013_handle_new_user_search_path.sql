-- Pin search_path on the SECURITY DEFINER trigger that auto-creates a
-- profile row at signup. Every other SECURITY DEFINER function in this
-- project sets `search_path = public, pg_temp`; this one was missed.
--
-- Without an explicit search_path, a malicious schema entry could
-- shadow `profiles`, `insert`, etc. during the function's execution.
-- Defense-in-depth — Supabase's linter flags any SECURITY DEFINER
-- function without a pinned search_path.

alter function public.handle_new_user() set search_path = public, pg_temp;
