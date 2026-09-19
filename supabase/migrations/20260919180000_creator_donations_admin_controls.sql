-- Creator donations Phase 2: atomic admin controls with audit trail.
BEGIN;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS'
));

CREATE OR REPLACE FUNCTION public.admin_set_creator_donations_global(_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public._has_role_internal(v_actor, 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public.app_settings(key, value, updated_at, updated_by)
  VALUES (
    'creator_donations_enabled',
    jsonb_build_object('enabled', _enabled),
    now(),
    v_actor
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  INSERT INTO public.admin_audit_log(admin_user_id, target_user_id, action, details)
  VALUES (
    v_actor,
    NULL,
    'UPDATE_DONATION_GLOBAL',
    jsonb_build_object('enabled', _enabled)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_creator_donation_access(
  _target_user_id uuid,
  _override text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(v_actor, _target_user_id);

  IF v_actor IS NULL OR NOT public._has_role_internal(v_actor, 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF _override NOT IN ('inherit', 'enabled', 'disabled') THEN
    RAISE EXCEPTION 'invalid donation access override';
  END IF;

  INSERT INTO public.user_donation_settings(
    user_id,
    admin_override,
    admin_updated_by,
    updated_at
  )
  VALUES (
    _target_user_id,
    _override,
    v_actor,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET admin_override = EXCLUDED.admin_override,
      admin_updated_by = EXCLUDED.admin_updated_by,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO public.admin_audit_log(admin_user_id, target_user_id, action, details)
  VALUES (
    v_actor,
    _target_user_id,
    'UPDATE_DONATION_ACCESS',
    jsonb_build_object('override', _override)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_creator_donations_global(boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_creator_donation_access(uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_creator_donations_global(boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_donation_access(uuid, text)
  TO authenticated, service_role;

COMMIT;
