BEGIN;

-- Restore the browser-authenticated CRUD privileges required by the existing
-- owner-scoped RLS policies. A previous hardening migration removed anonymous
-- access but these tables never received the expected DML grants, leaving
-- authenticated with only schema-management style privileges.
--
-- Keep least privilege explicit: no anonymous access; authenticated users may
-- perform normal CRUD subject to RLS; service_role keeps the same CRUD surface
-- for server-authoritative workflows.

REVOKE ALL ON TABLE public.prompt_projects FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prompt_projects TO authenticated, service_role;

REVOKE ALL ON TABLE public.song_analyses FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.song_analyses TO authenticated, service_role;

COMMIT;
