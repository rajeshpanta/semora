-- The Vault cleanup function is trigger-only. PostgreSQL grants EXECUTE to
-- PUBLIC by default for new functions, so remove that default explicitly.
revoke all on function public.delete_lms_sync_vault_credentials() from public, anon, authenticated;
