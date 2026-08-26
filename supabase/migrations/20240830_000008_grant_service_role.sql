-- supabase/migrations/20240829_000008_grant_service_role.sql
-- ------------------------------------------------------------
-- Base DML grants for the service_role Postgres role.
--
-- Migration 20240827_000005 granted DML to `authenticated`/`anon`
-- (PostgREST checks base grants before RLS) but omitted `service_role`.
-- Server-side administrative flows that use the service role directly
-- therefore hit "permission denied" despite RLS being bypassed for
-- that role.
--
-- This does NOT weaken security: service_role already bypasses RLS by
-- design, is never exposed to browsers, and only lives on the server.
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- End of migration
