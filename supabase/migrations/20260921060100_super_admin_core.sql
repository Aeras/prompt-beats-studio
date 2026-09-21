-- PromptBeats Phase A — Super Admin core hierarchy and role governance.
BEGIN;

CREATE OR REPLACE FUNCTION public.app_role_rank(_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'senior_moderator' THEN 3
    WHEN 'moderator' THEN 2
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public._is_admin_level_internal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin_level()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public._is_admin_level_internal(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public._has_role_internal(auth.uid(), 'super_admin'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public._is_admin_level_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_admin_level() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_admin_level_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin_level() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_super_admin() TO authenticated, service_role;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS',
  'ASSIGN_ADMIN_ROLE','REMOVE_ADMIN_ROLE','ASSIGN_SUPER_ADMIN_ROLE','REMOVE_SUPER_ADMIN_ROLE'
));

ALTER TABLE public.public_staff_badges DROP CONSTRAINT IF EXISTS public_staff_badges_badge_check;

CREATE OR REPLACE FUNCTION public.get_my_moderation_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := 'user';
  v_status text := 'active';
  v_is_banned boolean := true;
  v_can_moderate boolean := false;
  v_admin_level boolean := false;
BEGIN
  SELECT ur.role::text, ur.moderation_status, COALESCE(pp.is_banned, true)
    INTO v_role, v_status, v_is_banned
  FROM public.user_roles ur
  LEFT JOIN public.profile_private pp ON pp.user_id = ur.user_id
  WHERE ur.user_id = auth.uid()
  ORDER BY public.app_role_rank(ur.role::text) DESC
  LIMIT 1;

  v_admin_level := v_role IN ('admin','super_admin');
  v_can_moderate := NOT v_is_banned AND (
    v_admin_level OR (v_role IN ('moderator','senior_moderator') AND v_status = 'active')
  );

  RETURN jsonb_build_object(
    'role', v_role,
    'status', v_status,
    'can_view_users', v_can_moderate,
    'can_block_users', v_can_moderate,
    'can_unblock_users', v_can_moderate,
    'can_suspend_moderator', NOT v_is_banned AND (v_admin_level OR (v_role='senior_moderator' AND v_status='active')),
    'can_manage_roles', NOT v_is_banned AND v_admin_level,
    'can_delete_users', NOT v_is_banned AND v_admin_level,
    'can_manage_registration_blocks', NOT v_is_banned AND v_admin_level,
    'can_manage_model_access', NOT v_is_banned AND v_admin_level,
    'can_access_admin_settings', NOT v_is_banned AND v_admin_level,
    'can_lock_tracks', v_can_moderate,
    'can_delete_tracks', NOT v_is_banned AND (v_admin_level OR (v_role='senior_moderator' AND v_status='active')),
    'can_review_reported_message', v_can_moderate,
    'can_review_reported_conversation', NOT v_is_banned AND (v_admin_level OR v_role='senior_moderator')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_target(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
BEGIN
  IF v_actor IS NULL OR v_actor = _target_user_id THEN RETURN false; END IF;

  SELECT role::text INTO v_actor_role
  FROM public.user_roles
  WHERE user_id = v_actor
  ORDER BY public.app_role_rank(role::text) DESC
  LIMIT 1;

  SELECT COALESCE((
    SELECT role::text
    FROM public.user_roles
    WHERE user_id = _target_user_id
    ORDER BY public.app_role_rank(role::text) DESC
    LIMIT 1
  ), 'user') INTO v_target_role;

  IF v_actor_role = 'super_admin' THEN
    RETURN v_target_role <> 'super_admin';
  END IF;
  IF v_actor_role = 'admin' THEN
    RETURN v_target_role NOT IN ('admin','super_admin');
  END IF;

  RETURN v_actor_role IN ('moderator','senior_moderator')
    AND public.has_moderation_capability('can_block_users')
    AND v_target_role = 'user';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old text := 'user';
  v_action text;
  v_active_super_admins integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  PERFORM public._lock_user_security_pair(v_actor, _target_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:super-admin-role-management',0));

  SELECT role::text INTO v_actor_role
  FROM public.user_roles
  WHERE user_id = v_actor
  ORDER BY public.app_role_rank(role::text) DESC
  LIMIT 1;

  IF v_actor_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id = v_actor THEN RAISE EXCEPTION 'cannot change your own role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  SELECT COALESCE((
    SELECT role::text
    FROM public.user_roles
    WHERE user_id = _target_user_id
    ORDER BY public.app_role_rank(role::text) DESC
    LIMIT 1
  ), 'user') INTO v_old;

  IF v_actor_role = 'admin' THEN
    IF v_old IN ('admin','super_admin') THEN RAISE EXCEPTION 'protected account'; END IF;
    IF _role::text NOT IN ('user','moderator','senior_moderator') THEN
      RAISE EXCEPTION 'invalid assignable role';
    END IF;
  ELSE
    IF _role::text NOT IN ('user','moderator','senior_moderator','admin','super_admin') THEN
      RAISE EXCEPTION 'invalid assignable role';
    END IF;
  END IF;

  IF v_old = 'super_admin' AND _role::text <> 'super_admin' THEN
    SELECT count(*) INTO v_active_super_admins
    FROM public.user_roles ur
    LEFT JOIN public.profile_private pp ON pp.user_id = ur.user_id
    WHERE ur.role::text = 'super_admin'
      AND COALESCE(pp.is_banned, false) = false;
    IF v_active_super_admins <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last active Super Admin';
    END IF;
  END IF;

  IF v_old = _role::text THEN RETURN; END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles(user_id, role, moderation_status)
  VALUES (_target_user_id, _role, 'active');

  v_action := CASE
    WHEN _role::text = 'super_admin' THEN 'ASSIGN_SUPER_ADMIN_ROLE'
    WHEN v_old = 'super_admin' THEN 'REMOVE_SUPER_ADMIN_ROLE'
    WHEN _role::text = 'admin' THEN 'ASSIGN_ADMIN_ROLE'
    WHEN v_old = 'admin' THEN 'REMOVE_ADMIN_ROLE'
    WHEN _role::text = 'moderator' THEN 'ASSIGN_MODERATOR_ROLE'
    WHEN _role::text = 'senior_moderator' THEN 'ASSIGN_SENIOR_MODERATOR_ROLE'
    WHEN v_old IN ('moderator','senior_moderator') THEN 'REMOVE_MODERATOR_ROLE'
    ELSE 'CHANGE_MODERATOR_ROLE'
  END;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES (
    v_actor,
    _target_user_id,
    v_action,
    jsonb_build_object('previous_role',v_old,'new_role',_role::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_public_staff_badge(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_badge text;
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id=ur.user_id
      WHERE ur.user_id=_user_id AND ur.role::text='super_admin' AND pp.is_banned=false
    ) THEN 'PromptBeats Team'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id=ur.user_id
      WHERE ur.user_id=_user_id AND ur.role::text='admin' AND pp.is_banned=false
    ) THEN 'Admin'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id=ur.user_id
      WHERE ur.user_id=_user_id AND ur.role::text='senior_moderator'
        AND ur.moderation_status='active' AND pp.is_banned=false
    ) THEN 'Senior Trusted Safety Moderator'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id=ur.user_id
      WHERE ur.user_id=_user_id AND ur.role::text='moderator'
        AND ur.moderation_status='active' AND pp.is_banned=false
    ) THEN 'Trusted Safety Moderator'
    ELSE NULL
  END INTO v_badge;

  IF v_badge IS NULL THEN
    DELETE FROM public.public_staff_badges WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.public_staff_badges(user_id,badge,updated_at)
    VALUES (_user_id,v_badge,now())
    ON CONFLICT(user_id) DO UPDATE
      SET badge=EXCLUDED.badge, updated_at=EXCLUDED.updated_at;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Admins can view AI usage logs" ON public.ai_usage_logs;
CREATE POLICY "Admins can view AI usage logs"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.current_user_is_admin_level());

DROP POLICY IF EXISTS "Admins can view all private profile data" ON public.profile_private;
CREATE POLICY "Admins can view all private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (public.current_user_is_admin_level());

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND public.current_user_is_admin_level())
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND public.current_user_is_admin_level());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_is_admin_level());

SELECT public.refresh_public_staff_badge(id) FROM public.profiles;

ALTER TABLE public.public_staff_badges
  ADD CONSTRAINT public_staff_badges_badge_check CHECK (
    badge IN ('PromptBeats Team','Admin','Trusted Safety Moderator','Senior Trusted Safety Moderator')
  );

COMMIT;
