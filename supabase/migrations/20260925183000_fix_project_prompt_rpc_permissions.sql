BEGIN;

-- The Project-version rehome RPCs were intentionally restricted to service_role,
-- but the application invokes them through the authenticated user's Supabase
-- session. Keep the privileged implementations private and expose narrowly
-- scoped authenticated wrappers that verify the caller owns the supplied
-- _user_id before delegating.

ALTER FUNCTION public.detach_prompt_project_version(uuid, uuid)
  RENAME TO detach_prompt_project_version_impl;
ALTER FUNCTION public.copy_prompt_version_to_project(uuid, uuid, uuid)
  RENAME TO copy_prompt_version_to_project_impl;
ALTER FUNCTION public.move_prompt_version_to_project(uuid, uuid, uuid)
  RENAME TO move_prompt_version_to_project_impl;

REVOKE ALL ON FUNCTION public.detach_prompt_project_version_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copy_prompt_version_to_project_impl(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_prompt_version_to_project_impl(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detach_prompt_project_version_impl(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_prompt_version_to_project_impl(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.move_prompt_version_to_project_impl(uuid, uuid, uuid)
  TO service_role;

CREATE FUNCTION public.detach_prompt_project_version(
  _user_id uuid,
  _prompt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized for this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.detach_prompt_project_version_impl(_user_id, _prompt_id);
END;
$$;

CREATE FUNCTION public.copy_prompt_version_to_project(
  _user_id uuid,
  _prompt_id uuid,
  _destination_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized for this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.copy_prompt_version_to_project_impl(
    _user_id,
    _prompt_id,
    _destination_project_id
  );
END;
$$;

CREATE FUNCTION public.move_prompt_version_to_project(
  _user_id uuid,
  _prompt_id uuid,
  _destination_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not authorized for this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.move_prompt_version_to_project_impl(
    _user_id,
    _prompt_id,
    _destination_project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.detach_prompt_project_version(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copy_prompt_version_to_project(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_prompt_version_to_project(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.detach_prompt_project_version(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_prompt_version_to_project(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_prompt_version_to_project(uuid, uuid, uuid)
  TO authenticated;

COMMIT;
