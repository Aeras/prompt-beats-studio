-- The authenticated runner reads and atomically claims QC actions with the
-- server-only client. RLS bypass does not confer PostgreSQL table privileges.
-- Restore only the two privileges used by this worker; user access stays on
-- the existing protected RPCs. No INSERT, DELETE or client grants are added.
BEGIN;

GRANT SELECT, UPDATE ON TABLE public.ai_quality_check_actions TO service_role;

COMMIT;
