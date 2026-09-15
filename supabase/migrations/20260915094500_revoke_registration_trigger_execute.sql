-- The registration block check is a trigger function on auth.users. It must
-- remain SECURITY DEFINER so it can read the protected registration_blocks
-- table during signup, but it must not be callable through PostgREST/GraphQL
-- by anon or authenticated roles.

BEGIN;

REVOKE ALL ON FUNCTION public.reject_blocked_registration()
  FROM PUBLIC, anon, authenticated;

COMMIT;
