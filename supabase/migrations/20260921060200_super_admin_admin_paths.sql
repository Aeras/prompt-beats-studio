-- PromptBeats Phase A — make every active Admin path inherit to Super Admin.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public._is_admin_level_internal(v_user) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT jsonb_build_object(
    'totalUsers',(SELECT count(*) FROM auth.users),
    'blockedUsers',(SELECT count(*) FROM public.profile_private WHERE is_banned),
    'songsGenerated',(SELECT count(*) FROM public.ai_generations),
    'aiRequests',(SELECT count(*) FROM public.ai_usage_logs),
    'failedRequests',(SELECT count(*) FROM public.ai_usage_logs WHERE NOT success),
    'estimatedCostUsd',COALESCE((SELECT sum(estimated_cost_usd) FROM public.ai_usage_logs),0),
    'recentUsers',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'handle',p.handle,'displayName',p.display_name,
        'createdAt',p.created_at,'blocked',COALESCE(pp.is_banned,false)
      ) ORDER BY p.created_at DESC)
      FROM (SELECT * FROM public.profiles ORDER BY created_at DESC LIMIT 8) p
      LEFT JOIN public.profile_private pp ON pp.user_id=p.id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT '', _status text DEFAULT 'all', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_level boolean;
  v_total integer;
  v_users jsonb;
  v_search text := lower(trim(coalesce(_search,'')));
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin_level := public.current_user_is_admin_level();

  SELECT count(*) INTO v_total
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id=u.id
  LEFT JOIN public.profile_private pp ON pp.user_id=u.id
  WHERE (_status='all' OR (_status='blocked' AND coalesce(pp.is_banned,false)) OR (_status='active' AND NOT coalesce(pp.is_banned,false)))
    AND (v_search='' OR p.handle ILIKE '%'||v_search||'%' OR p.display_name ILIKE '%'||v_search||'%' OR (v_admin_level AND u.email ILIKE '%'||v_search||'%'));

  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO v_users
  FROM (
    SELECT
      u.id,
      CASE WHEN v_admin_level THEN u.email ELSE NULL END AS email,
      u.created_at,
      p.handle,
      p.display_name,
      coalesce(pp.is_banned,false) AS blocked,
      (r.role::text IN ('admin','super_admin')) AS is_admin,
      coalesce(r.role::text,'user') AS role,
      coalesce(r.moderation_status,'active') AS moderation_status,
      (SELECT count(*) FROM public.tracks t WHERE t.user_id=u.id) AS generations
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id=u.id
    LEFT JOIN public.profile_private pp ON pp.user_id=u.id
    LEFT JOIN LATERAL (
      SELECT ur.role,ur.moderation_status
      FROM public.user_roles ur
      WHERE ur.user_id=u.id
      ORDER BY public.app_role_rank(ur.role::text) DESC
      LIMIT 1
    ) r ON true
    WHERE (_status='all' OR (_status='blocked' AND coalesce(pp.is_banned,false)) OR (_status='active' AND NOT coalesce(pp.is_banned,false)))
      AND (v_search='' OR p.handle ILIKE '%'||v_search||'%' OR p.display_name ILIKE '%'||v_search||'%' OR (v_admin_level AND u.email ILIKE '%'||v_search||'%'))
    ORDER BY u.created_at DESC
    LIMIT greatest(coalesce(_limit,25),1)
    OFFSET greatest(coalesce(_offset,0),0)
  ) q;

  RETURN jsonb_build_object('total',v_total,'users',v_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_level boolean;
  v_user auth.users%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_private public.profile_private%ROWTYPE;
  v_role text := 'user';
  v_status text := 'active';
  v_access jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin_level := public.current_user_is_admin_level();

  SELECT * INTO v_user FROM auth.users WHERE id=_target_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=_target_user_id;
  SELECT * INTO v_private FROM public.profile_private WHERE user_id=_target_user_id;

  SELECT ur.role::text,ur.moderation_status INTO v_role,v_status
  FROM public.user_roles ur
  WHERE ur.user_id=_target_user_id
  ORDER BY public.app_role_rank(ur.role::text) DESC
  LIMIT 1;

  IF v_admin_level THEN
    SELECT jsonb_build_object('mode',access_mode,'models',allowed_models)
      INTO v_access
    FROM public.user_model_access
    WHERE user_id=_target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'id',v_user.id,
    'email',CASE WHEN v_admin_level THEN v_user.email ELSE NULL END,
    'created_at',v_user.created_at,
    'handle',v_profile.handle,
    'display_name',v_profile.display_name,
    'blocked',coalesce(v_private.is_banned,false),
    'is_admin',v_role IN ('admin','super_admin'),
    'role',v_role,
    'moderation_status',v_status,
    'generations',(SELECT count(*) FROM public.tracks WHERE user_id=_target_user_id),
    'ai_requests',(SELECT count(*) FROM public.ai_usage_logs WHERE user_id=_target_user_id),
    'model_access',CASE WHEN v_admin_level THEN coalesce(v_access,jsonb_build_object('mode','inherit','models','[]'::jsonb)) ELSE jsonb_build_object('mode','inherit','models','[]'::jsonb) END,
    'block_reason_code',v_private.block_reason_code,
    'block_reason_text',v_private.block_reason_text,
    'blocked_at',v_private.blocked_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(
  _target_user_id uuid, _banned boolean, _reason_code text DEFAULT NULL, _reason_text text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_target_role text;
BEGIN
  PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
  IF NOT public.has_moderation_capability(CASE WHEN _banned THEN 'can_block_users' ELSE 'can_unblock_users' END) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;

  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id=v_actor ORDER BY public.app_role_rank(role::text) DESC LIMIT 1;
  SELECT COALESCE((SELECT role::text FROM public.user_roles WHERE user_id=_target_user_id ORDER BY public.app_role_rank(role::text) DESC LIMIT 1),'user') INTO v_target_role;

  IF _target_user_id=v_actor OR v_target_role IN ('admin','super_admin') THEN RAISE EXCEPTION 'protected account'; END IF;
  IF v_actor_role NOT IN ('admin','super_admin') AND v_target_role<>'user' THEN RAISE EXCEPTION 'moderators may only act on normal users'; END IF;
  IF _banned AND (_reason_code IS NULL OR _reason_code NOT IN ('platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity','ai_or_platform_misuse','security_concern','other')) THEN RAISE EXCEPTION 'a valid block reason is required'; END IF;
  IF _banned AND _reason_code='other' AND length(trim(coalesce(_reason_text,'')))=0 THEN RAISE EXCEPTION 'custom block reason is required'; END IF;

  PERFORM set_config('promptbeats.authorized_moderation_ban','on',true);
  INSERT INTO public.profile_private(user_id,is_banned,block_reason_code,block_reason_text,blocked_at,blocked_by)
  VALUES(_target_user_id,_banned,CASE WHEN _banned THEN _reason_code ELSE NULL END,CASE WHEN _banned AND _reason_code='other' THEN trim(_reason_text) ELSE NULL END,CASE WHEN _banned THEN now() ELSE NULL END,CASE WHEN _banned THEN v_actor ELSE NULL END)
  ON CONFLICT(user_id) DO UPDATE SET
    is_banned=EXCLUDED.is_banned,
    block_reason_code=EXCLUDED.block_reason_code,
    block_reason_text=EXCLUDED.block_reason_text,
    blocked_at=EXCLUDED.blocked_at,
    blocked_by=EXCLUDED.blocked_by;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,_target_user_id,CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END,jsonb_build_object('reason_code',_reason_code,'has_custom_reason',_reason_code='other'));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_moderation_status(
  _target_user_id uuid, _status text, _reason_text text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_target_role text;
BEGIN
  PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'invalid moderation status'; END IF;
  IF _status='suspended' AND length(trim(coalesce(_reason_text,'')))=0 THEN RAISE EXCEPTION 'a suspension reason is required'; END IF;
  IF NOT public.has_moderation_capability('can_suspend_moderator') THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id=v_actor ORDER BY public.app_role_rank(role::text) DESC LIMIT 1;
  SELECT role::text INTO v_target_role FROM public.user_roles WHERE user_id=_target_user_id ORDER BY public.app_role_rank(role::text) DESC LIMIT 1;

  IF v_actor_role IN ('admin','super_admin') THEN NULL;
  ELSIF v_actor_role='senior_moderator' AND v_target_role='moderator' AND _status='suspended' AND v_actor<>_target_user_id THEN NULL;
  ELSE RAISE EXCEPTION 'not allowed'; END IF;

  IF v_target_role NOT IN ('moderator','senior_moderator')
     OR v_actor=_target_user_id
     OR (v_actor_role NOT IN ('admin','super_admin') AND v_target_role<>'moderator')
  THEN RAISE EXCEPTION 'protected moderation role'; END IF;

  UPDATE public.user_roles SET moderation_status=_status
  WHERE user_id=_target_user_id AND role::text IN ('moderator','senior_moderator');

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,_target_user_id,CASE WHEN _status='suspended' THEN 'SUSPEND_MODERATOR' ELSE 'REACTIVATE_MODERATOR' END,jsonb_build_object('role',v_target_role,'status',_status,'reason',CASE WHEN _status='suspended' THEN trim(_reason_text) ELSE NULL END));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_model_access(_target_user_id uuid,_access_mode text,_allowed_models text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
  PERFORM 1 FROM public.user_model_access WHERE user_id=_target_user_id FOR UPDATE;
  IF NOT public._is_admin_level_internal(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF _access_mode NOT IN ('inherit','custom') THEN RAISE EXCEPTION 'invalid access mode'; END IF;
  IF _access_mode='custom' AND cardinality(COALESCE(_allowed_models,'{}'))=0 THEN RAISE EXCEPTION 'custom access needs a model'; END IF;
  INSERT INTO public.user_model_access(user_id,access_mode,allowed_models)
  VALUES(_target_user_id,_access_mode,COALESCE(_allowed_models,'{}'))
  ON CONFLICT(user_id) DO UPDATE SET access_mode=EXCLUDED.access_mode,allowed_models=EXCLUDED.allowed_models,updated_at=now();
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,_target_user_id,'UPDATE_MODEL_ACCESS',jsonb_build_object('mode',_access_mode,'model_count',cardinality(COALESCE(_allowed_models,'{}'))));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_registration_block(_email text,_reason_code text,_reason_text text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin uuid:=auth.uid();
  v_email text:=public.normalize_registration_email(_email);
  v_id uuid;
BEGIN
  PERFORM public._lock_user_security_state(v_admin);
  PERFORM 1 FROM public.registration_blocks WHERE email_normalized=v_email FOR UPDATE;
  IF NOT public._is_admin_level_internal(v_admin) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_email='' OR _reason_code NOT IN('platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity','ai_or_platform_misuse','security_concern','other') THEN RAISE EXCEPTION 'invalid registration block'; END IF;
  IF _reason_code='other' AND length(trim(COALESCE(_reason_text,'')))=0 THEN RAISE EXCEPTION 'custom registration block reason is required'; END IF;
  INSERT INTO public.registration_blocks(email_normalized,reason_code,reason_text,blocked_by)
  VALUES(v_email,_reason_code,CASE WHEN _reason_code='other' THEN trim(_reason_text) ELSE NULL END,v_admin)
  ON CONFLICT(email_normalized) DO UPDATE SET reason_code=EXCLUDED.reason_code,reason_text=EXCLUDED.reason_text,blocked_at=now(),blocked_by=EXCLUDED.blocked_by
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_registration_block(_block_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin uuid:=auth.uid();
  v_email text;
BEGIN
  PERFORM public._lock_user_security_state(v_admin);
  PERFORM 1 FROM public.registration_blocks WHERE id=_block_id FOR UPDATE;
  IF NOT public._is_admin_level_internal(v_admin) THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.registration_blocks WHERE id=_block_id RETURNING email_normalized INTO v_email;
  IF v_email IS NULL THEN RAISE EXCEPTION 'registration block not found'; END IF;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_admin,NULL,'UNBLOCK_REGISTRATION',jsonb_build_object('registration_block_id',_block_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_registration_blocks(_search text DEFAULT '',_limit integer DEFAULT 25,_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin uuid:=auth.uid();
  v_search text:=public.normalize_registration_email(_search);
  v_result jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public._is_admin_level_internal(v_admin) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM public.registration_blocks WHERE v_search='' OR email_normalized LIKE '%'||v_search||'%'),
    'blocks',COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.blocked_at DESC)
      FROM (
        SELECT id,email_normalized,reason_code,reason_text,blocked_at
        FROM public.registration_blocks
        WHERE v_search='' OR email_normalized LIKE '%'||v_search||'%'
        ORDER BY blocked_at DESC
        LIMIT LEAST(GREATEST(COALESCE(_limit,25),1),100)
        OFFSET GREATEST(COALESCE(_offset,0),0)
      ) q
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_creator_donations_global(_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public._is_admin_level_internal(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO public.app_settings(key,value,updated_at,updated_by)
  VALUES('creator_donations_enabled',jsonb_build_object('enabled',_enabled),now(),v_actor)
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,NULL,'UPDATE_DONATION_GLOBAL',jsonb_build_object('enabled',_enabled));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_creator_donation_access(_target_user_id uuid,_override text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
  IF v_actor IS NULL OR NOT public._is_admin_level_internal(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF _override NOT IN('inherit','enabled','disabled') THEN RAISE EXCEPTION 'invalid donation access override'; END IF;
  INSERT INTO public.user_donation_settings(user_id,admin_override,admin_updated_by,updated_at)
  VALUES(_target_user_id,_override,v_actor,now())
  ON CONFLICT(user_id) DO UPDATE SET admin_override=EXCLUDED.admin_override,admin_updated_by=EXCLUDED.admin_updated_by,updated_at=EXCLUDED.updated_at;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,_target_user_id,'UPDATE_DONATION_ACCESS',jsonb_build_object('override',_override));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_begin_account_deletion(_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
  IF NOT public.current_user_is_admin_level() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id=v_actor THEN RAISE EXCEPTION 'cannot delete your own admin account'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF public._is_admin_level_internal(_target_user_id) THEN RAISE EXCEPTION 'admin accounts cannot be deleted'; END IF;
  INSERT INTO public.admin_account_deletion_operations(actor_id,target_user_id)
  VALUES(v_actor,_target_user_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_admin_account_deletion(_operation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_target uuid; v_operation_actor uuid; v_used timestamptz; v_expires timestamptz;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT actor_id,target_user_id,used_at,expires_at
    INTO v_operation_actor,v_target,v_used,v_expires
  FROM public.admin_account_deletion_operations
  WHERE id=_operation_id
  FOR UPDATE;
  IF NOT FOUND OR v_operation_actor<>v_actor OR v_used IS NOT NULL OR v_expires<=now() THEN
    RAISE EXCEPTION 'account deletion authorization is invalid or expired';
  END IF;
  PERFORM public._lock_user_security_pair(v_actor,v_target);
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_target) OR public._is_admin_level_internal(v_target) THEN
    RAISE EXCEPTION 'account deletion target is no longer eligible';
  END IF;
  UPDATE public.admin_account_deletion_operations
  SET used_at=now()
  WHERE id=_operation_id AND actor_id=v_actor AND used_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'account deletion authorization is invalid or expired'; END IF;
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid,_banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(v_actor,_user_id);
  IF v_actor IS NULL OR NOT public._is_admin_level_internal(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _user_id=v_actor THEN RAISE EXCEPTION 'cannot change your own account status'; END IF;
  IF public._is_admin_level_internal(_user_id) THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
  PERFORM set_config('promptbeats.authorized_moderation_ban','on',true);
  INSERT INTO public.profile_private(user_id,is_banned,block_reason_code,block_reason_text,blocked_at,blocked_by)
  VALUES(_user_id,_banned,CASE WHEN _banned THEN 'other' ELSE NULL END,CASE WHEN _banned THEN 'Legacy moderation action' ELSE NULL END,CASE WHEN _banned THEN now() ELSE NULL END,CASE WHEN _banned THEN v_actor ELSE NULL END)
  ON CONFLICT(user_id) DO UPDATE SET is_banned=EXCLUDED.is_banned,block_reason_code=EXCLUDED.block_reason_code,block_reason_text=EXCLUDED.block_reason_text,blocked_at=EXCLUDED.blocked_at,blocked_by=EXCLUDED.blocked_by;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_track jsonb; v_owner_is_admin boolean:=false; v_can_delete boolean;
BEGIN
  IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT EXISTS(
    SELECT 1
    FROM public.tracks t
    JOIN public.user_roles ur ON ur.user_id=t.user_id
    WHERE t.id=_track_id AND ur.role::text IN ('admin','super_admin')
  ) INTO v_owner_is_admin;
  v_can_delete := public.has_moderation_capability('can_delete_tracks')
    AND (NOT v_owner_is_admin OR public.current_user_is_admin_level());

  SELECT jsonb_build_object(
    'id',t.id,'user_id',t.user_id,'title',t.title,'genre',t.genre,
    'prompt',t.prompt,'lyrics',t.lyrics,'audio_url',t.audio_url,
    'audio_type',t.audio_type,'art_url',t.art_url,'cover_url',t.cover_url,
    'duration_seconds',t.duration_seconds,'plays',t.plays,
    'is_published',t.is_published,'created_at',t.created_at,
    'moderation_status',t.moderation_status,
    'moderation_reason_code',t.moderation_reason_code,
    'moderation_reason_text',t.moderation_reason_text,
    'moderation_locked_at',t.moderation_locked_at,
    'can_delete_track',v_can_delete
  ) INTO v_track
  FROM public.tracks t
  WHERE t.id=_track_id;
  IF v_track IS NULL THEN RETURN NULL; END IF;
  RETURN v_track;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; v_track public.tracks%ROWTYPE; v_cleanup jsonb;
BEGIN
  SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
  PERFORM public._lock_user_security_pair(v_actor,v_owner);
  SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_track.user_id AND role::text IN ('admin','super_admin'))
     AND NOT public.current_user_is_admin_level()
  THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url);
  DELETE FROM public.tracks WHERE id=_track_id;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_track.user_id,'DELETE_TRACK',v_cleanup||jsonb_build_object('track_id',_track_id));
  RETURN jsonb_build_object('ok',true)||v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; v_track public.tracks%ROWTYPE; v_cleanup jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
  SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
  PERFORM public._lock_user_security_pair(v_actor,v_owner);
  SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
  IF v_track.user_id<>v_actor AND NOT public.current_user_is_admin_level() THEN
    RAISE EXCEPTION 'track not found or you do not have permission to delete it';
  END IF;
  IF v_track.user_id=v_actor AND v_track.moderation_status<>'active' THEN RAISE EXCEPTION 'locked tracks cannot be deleted by their owner'; END IF;
  v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url);
  DELETE FROM public.tracks WHERE id=_track_id;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_track.user_id,'DELETE_TRACK',v_cleanup||jsonb_build_object('track_id',_track_id));
  RETURN jsonb_build_object('ok',true)||v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_generation_job(_idempotency_key uuid,_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid:=auth.uid(); v_job public.ai_generation_jobs; v_used integer; v_reserved integer; v_gen uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  SELECT * INTO v_job FROM public.ai_generation_jobs WHERE user_id=v_user AND idempotency_key=_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(v_job); END IF;
  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE user_id=v_user AND status IN('pending','processing') AND dismissed_at IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_job); END IF;
  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_generations WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved FROM public.ai_quality_check_actions WHERE user_id=v_user AND status IN('pending','processing');
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('rate_limited',true); END IF;
  END IF;
  INSERT INTO public.ai_generations(user_id) VALUES(v_user) RETURNING id INTO v_gen;
  INSERT INTO public.ai_generation_jobs(user_id,idempotency_key,status,input_payload,generation_id)
  VALUES(v_user,_idempotency_key,'pending',_input,v_gen) RETURNING * INTO v_job;
  PERFORM public.kick_generation_runner(v_job.id);
  RETURN to_jsonb(v_job);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_quality_check(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid:=auth.uid(); v_action public.ai_quality_check_actions; v_used integer; v_reserved integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  SELECT * INTO v_action FROM public.ai_quality_check_actions WHERE user_id=v_user AND idempotency_key=_idempotency_key FOR UPDATE;
  IF FOUND AND v_action.status='completed' THEN
    RETURN jsonb_build_object('status','completed','qualityReport',v_action.quality_report,'provider',v_action.provider,'model',v_action.model);
  END IF;
  IF FOUND AND v_action.status='failed' AND v_action.provider_started_at IS NOT NULL THEN RETURN jsonb_build_object('status','failed'); END IF;
  IF FOUND AND v_action.status='processing'
     AND (v_action.provider_started_at IS NOT NULL OR v_action.updated_at>now()-interval '15 minutes')
  THEN RETURN jsonb_build_object('status','processing'); END IF;
  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_generations WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved FROM public.ai_quality_check_actions
    WHERE user_id=v_user AND status IN('pending','processing') AND (v_action.id IS NULL OR id<>v_action.id);
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
  END IF;
  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status='processing',quality_report=NULL,consumed_generation_id=NULL,provider_started_at=NULL,provider=NULL,model=NULL,updated_at=now()
    WHERE id=v_action.id;
    RETURN jsonb_build_object('status','claimed');
  END IF;
  INSERT INTO public.ai_quality_check_actions(user_id,idempotency_key,status)
  VALUES(v_user,_idempotency_key,'processing');
  RETURN jsonb_build_object('status','claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.start_quality_check_job(_idempotency_key uuid,_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
  v_generation_key text:=NULLIF(_input->>'generationId','');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  IF _input IS NULL OR jsonb_typeof(_input)<>'object' THEN RAISE EXCEPTION 'invalid quality check input'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT * INTO v_action FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND idempotency_key=_idempotency_key FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId',v_action.id,'status',v_action.status,'qualityReport',v_action.quality_report,
      'provider',v_action.provider,'model',v_action.model,'error',v_action.error,'createdAt',v_action.created_at
    );
  END IF;

  SELECT * INTO v_action FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND status IN('pending','processing')
    AND ((v_generation_key IS NULL AND COALESCE(input_payload->>'generationId','')='')
      OR input_payload->>'generationId'=v_generation_key)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId',v_action.id,'status',v_action.status,'qualityReport',v_action.quality_report,
      'provider',v_action.provider,'model',v_action.model,'error',v_action.error,'createdAt',v_action.created_at
    );
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_generations WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved FROM public.ai_quality_check_actions WHERE user_id=v_user AND status IN('pending','processing');
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('rate_limited',true); END IF;
  END IF;

  INSERT INTO public.ai_quality_check_actions(
    user_id,idempotency_key,status,input_payload,quality_report,consumed_generation_id,
    provider_started_at,provider,model,error,started_at,completed_at,updated_at
  ) VALUES(
    v_user,_idempotency_key,'pending',_input,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,now()
  ) RETURNING * INTO v_action;

  PERFORM public.kick_quality_check_runner(v_action.id);
  RETURN jsonb_build_object(
    'actionId',v_action.id,'status',v_action.status,'qualityReport',NULL,
    'provider',NULL,'model',NULL,'error',NULL,'createdAt',v_action.created_at
  );
END;
$$;

COMMIT;
