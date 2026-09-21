-- Harden app_role_rank against mutable search_path warnings.
BEGIN;

CREATE OR REPLACE FUNCTION public.app_role_rank(_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'senior_moderator' THEN 3
    WHEN 'moderator' THEN 2
    ELSE 1
  END;
$$;

COMMIT;
