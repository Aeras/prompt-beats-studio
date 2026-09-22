-- Restore server-side read access required by Follow Creator summaries/lists.
-- Keep direct client access revoked for anon/authenticated.
BEGIN;

GRANT SELECT ON public.user_follows TO service_role;
REVOKE ALL ON public.user_follows FROM PUBLIC, anon, authenticated;

COMMIT;
