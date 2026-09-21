-- PromptBeats Phase A bootstrap: promote the verified primary owner account.
-- This is an explicit one-time data migration, not normal self-role management.
BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_match_count integer;
  v_current_role text;
BEGIN
  SELECT count(*)::integer
    INTO v_match_count
  FROM auth.users
  WHERE lower(email) = 'nikos76gr@gmail.com';

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'primary Super Admin bootstrap requires exactly one verified account';
  END IF;

  SELECT id
    INTO v_user_id
  FROM auth.users
  WHERE lower(email) = 'nikos76gr@gmail.com';

  PERFORM public._lock_user_security_state(v_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:super-admin-role-management', 0));

  SELECT COALESCE((
    SELECT role::text
    FROM public.user_roles
    WHERE user_id = v_user_id
    ORDER BY public.app_role_rank(role::text) DESC
    LIMIT 1
  ), 'user')
  INTO v_current_role;

  IF v_current_role = 'super_admin' THEN
    PERFORM public.refresh_public_staff_badge(v_user_id);
    RETURN;
  END IF;

  IF v_current_role <> 'admin' THEN
    RAISE EXCEPTION 'primary Super Admin bootstrap requires current role admin';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = v_user_id;

  INSERT INTO public.user_roles(user_id, role, moderation_status)
  VALUES(v_user_id, 'super_admin'::public.app_role, 'active');

  INSERT INTO public.admin_audit_log(admin_user_id, target_user_id, action, details)
  VALUES(
    v_user_id,
    v_user_id,
    'ASSIGN_SUPER_ADMIN_ROLE',
    jsonb_build_object(
      'previous_role', 'admin',
      'new_role', 'super_admin',
      'bootstrap', true
    )
  );

  PERFORM public.refresh_public_staff_badge(v_user_id);
END;
$$;

COMMIT;
