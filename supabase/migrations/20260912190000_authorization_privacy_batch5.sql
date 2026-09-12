-- Security Batch 5: role authorization fencing, staff privacy, and removal
-- of arbitrary browser role/ban probes.

CREATE OR REPLACE FUNCTION public._lock_user_security_state(_user_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR UPDATE;
  PERFORM 1 FROM public.user_roles WHERE user_id = _user_id FOR UPDATE;
  PERFORM 1 FROM public.profile_private WHERE user_id = _user_id FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public._lock_user_security_pair(_first uuid, _second uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF _first IS NULL AND _second IS NULL THEN RETURN; END IF;
  IF _second IS NULL OR (_first IS NOT NULL AND _first <= _second) THEN
    PERFORM public._lock_user_security_state(_first);
    PERFORM public._lock_user_security_state(_second);
  ELSE
    PERFORM public._lock_user_security_state(_second);
    PERFORM public._lock_user_security_state(_first);
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public._has_role_internal(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public._is_banned_internal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT COALESCE((SELECT pp.is_banned FROM public.profile_private pp WHERE pp.user_id = _user_id), true);
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public._has_role_internal(auth.uid(), _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public._is_banned_internal(auth.uid());
$$;

-- Keep the legacy names only for trusted database-function compatibility. The
-- browser role cannot execute them after the final REVOKE below.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  PERFORM public._lock_user_security_state(_user_id);
  RETURN public._has_role_internal(_user_id, _role);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public._is_banned_internal(_user_id);
$$;

-- Every capability check now fences the actor's role, moderation status, and
-- canonical ban row before the protected mutation continues.
CREATE OR REPLACE FUNCTION public.has_moderation_capability(_capability text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_context jsonb;
BEGIN
  PERFORM public._lock_user_security_state(auth.uid());
  v_context := public.get_my_moderation_context();
  RETURN COALESCE((v_context ->> _capability)::boolean, false);
END;
$$;

-- Replace the effective account policies with caller-bound checks. These
-- policies never need arbitrary-user helper execution by authenticated users.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = id)
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = id);
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND public.current_user_has_role('admin'))
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND public.current_user_has_role('admin'));
DROP POLICY IF EXISTS "Users can mark their own welcome email sent" ON public.profile_private;
CREATE POLICY "Users can mark their own welcome email sent" ON public.profile_private FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
  WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can create their own tracks" ON public.tracks;
CREATE POLICY "Users can create their own tracks" ON public.tracks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can update their own tracks" ON public.tracks;
CREATE POLICY "Users can update their own tracks" ON public.tracks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
  WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users manage their own saved prompts" ON public.saved_prompts;
CREATE POLICY "Users manage their own saved prompts" ON public.saved_prompts FOR ALL TO authenticated
  USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
  WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can like as themselves" ON public.likes;
CREATE POLICY "Users can like as themselves" ON public.likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.likes;
CREATE POLICY "Users can remove their own likes" ON public.likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND NOT public.current_user_is_banned());

-- Storage policies use the same caller-bound ban predicate.
DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned())
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
CREATE POLICY "Users can delete own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users manage their own avatar files" ON storage.objects;
CREATE POLICY "Users manage their own avatar files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned())
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can upload their own track covers" ON storage.objects;
CREATE POLICY "Users can upload their own track covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can update their own track covers" ON storage.objects;
CREATE POLICY "Users can update their own track covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned())
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());
DROP POLICY IF EXISTS "Users can delete their own track covers" ON storage.objects;
CREATE POLICY "Users can delete their own track covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.current_user_is_banned());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'));
DROP POLICY IF EXISTS "Admins can view all private profile data" ON public.profile_private;
CREATE POLICY "Admins can view all private profile data" ON public.profile_private FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'));
DROP POLICY IF EXISTS "Admins can view AI usage logs" ON public.ai_usage_logs;
CREATE POLICY "Admins can view AI usage logs" ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'));

-- Role-aware user projections. Non-admin searches never touch auth.users.email
-- in the predicate, preventing email membership/count inference.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT '', _status text DEFAULT 'all', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_admin boolean; v_total integer; v_users jsonb; v_search text := lower(trim(coalesce(_search, '')));
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin := public.current_user_has_role('admin');
  SELECT count(*) INTO v_total FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id LEFT JOIN public.profile_private pp ON pp.user_id = u.id
  WHERE (_status = 'all' OR (_status = 'blocked' AND coalesce(pp.is_banned, false)) OR (_status = 'active' AND NOT coalesce(pp.is_banned, false)))
    AND (v_search = '' OR p.handle ILIKE '%' || v_search || '%' OR p.display_name ILIKE '%' || v_search || '%' OR (v_admin AND u.email ILIKE '%' || v_search || '%'));
  SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_users FROM (
    SELECT u.id, CASE WHEN v_admin THEN u.email ELSE NULL END AS email, u.created_at, p.handle, p.display_name,
      coalesce(pp.is_banned, false) AS blocked, (r.role::text = 'admin') AS is_admin,
      coalesce(r.role::text, 'user') AS role, coalesce(r.moderation_status, 'active') AS moderation_status,
      (SELECT count(*) FROM public.tracks t WHERE t.user_id = u.id) AS generations
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id LEFT JOIN public.profile_private pp ON pp.user_id = u.id
    LEFT JOIN LATERAL (SELECT ur.role, ur.moderation_status FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY CASE ur.role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1) r ON true
    WHERE (_status = 'all' OR (_status = 'blocked' AND coalesce(pp.is_banned, false)) OR (_status = 'active' AND NOT coalesce(pp.is_banned, false)))
      AND (v_search = '' OR p.handle ILIKE '%' || v_search || '%' OR p.display_name ILIKE '%' || v_search || '%' OR (v_admin AND u.email ILIKE '%' || v_search || '%'))
    ORDER BY u.created_at DESC LIMIT greatest(coalesce(_limit, 25), 1) OFFSET greatest(coalesce(_offset, 0), 0)
  ) q;
  RETURN jsonb_build_object('total', v_total, 'users', v_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_admin boolean; v_user auth.users%ROWTYPE; v_profile public.profiles%ROWTYPE; v_private public.profile_private%ROWTYPE; v_role text := 'user'; v_status text := 'active'; v_access jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_view_users') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin := public.current_user_has_role('admin');
  SELECT * INTO v_user FROM auth.users WHERE id = _target_user_id; IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = _target_user_id;
  SELECT * INTO v_private FROM public.profile_private WHERE user_id = _target_user_id;
  SELECT ur.role::text, ur.moderation_status INTO v_role, v_status FROM public.user_roles ur WHERE ur.user_id = _target_user_id LIMIT 1;
  IF v_admin THEN SELECT jsonb_build_object('mode', access_mode, 'models', allowed_models) INTO v_access FROM public.user_model_access WHERE user_id = _target_user_id; END IF;
  RETURN jsonb_build_object('id', v_user.id, 'email', CASE WHEN v_admin THEN v_user.email ELSE NULL END, 'created_at', v_user.created_at,
    'handle', v_profile.handle, 'display_name', v_profile.display_name, 'blocked', coalesce(v_private.is_banned, false),
    'is_admin', v_role = 'admin', 'role', v_role, 'moderation_status', v_status,
    'generations', (SELECT count(*) FROM public.tracks WHERE user_id = _target_user_id), 'ai_requests', (SELECT count(*) FROM public.ai_usage_logs WHERE user_id = _target_user_id),
    'model_access', CASE WHEN v_admin THEN coalesce(v_access, jsonb_build_object('mode','inherit','models','[]'::jsonb)) ELSE jsonb_build_object('mode','inherit','models','[]'::jsonb) END,
    'block_reason_code', v_private.block_reason_code, 'block_reason_text', v_private.block_reason_text, 'blocked_at', v_private.blocked_at);
END;
$$;

-- Server-authoritative account deletion boundary. Locks are released before
-- external cleanup/Auth calls; the operation is the durable authorization
-- evidence for that external phase.
CREATE TABLE IF NOT EXISTS public.admin_account_deletion_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz
);
ALTER TABLE public.admin_account_deletion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_account_deletion_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_account_deletion_operations TO service_role;

CREATE OR REPLACE FUNCTION public.admin_begin_account_deletion(_target_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_pair(v_actor, _target_user_id);
  IF NOT public.current_user_has_role('admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id = v_actor THEN RAISE EXCEPTION 'cannot delete your own admin account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  IF public._has_role_internal(_target_user_id, 'admin') THEN RAISE EXCEPTION 'admin accounts cannot be deleted'; END IF;
  INSERT INTO public.admin_account_deletion_operations(actor_id, target_user_id) VALUES (v_actor, _target_user_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_banned() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._has_role_internal(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._is_banned_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._lock_user_security_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._lock_user_security_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_begin_account_deletion(uuid) FROM PUBLIC, anon;
-- Compatibility phase: retain authenticated access until Migration B.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_banned() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._has_role_internal(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public._is_banned_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_begin_account_deletion(uuid) TO authenticated, service_role;

-- Replace the target-sensitive moderation mutations so target role/status and
-- account state are locked before authorization is evaluated.
CREATE OR REPLACE FUNCTION public.admin_set_user_banned(_target_user_id uuid, _banned boolean, _reason_code text DEFAULT NULL, _reason_text text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
BEGIN
  PERFORM public._lock_user_security_pair(v_actor, _target_user_id);
  IF NOT public.has_moderation_capability(CASE WHEN _banned THEN 'can_block_users' ELSE 'can_unblock_users' END) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  SELECT role::text INTO v_target_role FROM public.user_roles WHERE user_id = _target_user_id LIMIT 1;
  v_target_role := coalesce(v_target_role, 'user');
  IF _target_user_id = v_actor OR v_target_role = 'admin' THEN RAISE EXCEPTION 'protected account'; END IF;
  IF v_actor_role <> 'admin' AND v_target_role <> 'user' THEN RAISE EXCEPTION 'moderators may only act on normal users'; END IF;
  IF _banned AND (_reason_code IS NULL OR _reason_code NOT IN ('platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity','ai_or_platform_misuse','security_concern','other')) THEN RAISE EXCEPTION 'a valid block reason is required'; END IF;
  IF _banned AND _reason_code = 'other' AND length(trim(coalesce(_reason_text, ''))) = 0 THEN RAISE EXCEPTION 'custom block reason is required'; END IF;
  PERFORM set_config('promptbeats.authorized_moderation_ban', 'on', true);
  INSERT INTO public.profile_private(user_id,is_banned,block_reason_code,block_reason_text,blocked_at,blocked_by)
  VALUES (_target_user_id,_banned,CASE WHEN _banned THEN _reason_code ELSE NULL END,CASE WHEN _banned AND _reason_code='other' THEN trim(_reason_text) ELSE NULL END,CASE WHEN _banned THEN now() ELSE NULL END,CASE WHEN _banned THEN v_actor ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE SET is_banned=EXCLUDED.is_banned,block_reason_code=EXCLUDED.block_reason_code,block_reason_text=EXCLUDED.block_reason_text,blocked_at=EXCLUDED.blocked_at,blocked_by=EXCLUDED.blocked_by;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,_target_user_id,CASE WHEN _banned THEN 'BLOCK_USER' ELSE 'UNBLOCK_USER' END,jsonb_build_object('reason_code',_reason_code,'has_custom_reason',_reason_code='other'));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_moderation_status(_target_user_id uuid, _status text, _reason_text text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
BEGIN
  PERFORM public._lock_user_security_pair(v_actor, _target_user_id);
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'invalid moderation status'; END IF;
  IF _status='suspended' AND length(trim(coalesce(_reason_text,'')))=0 THEN RAISE EXCEPTION 'a suspension reason is required'; END IF;
  IF NOT public.has_moderation_capability('can_suspend_moderator') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id=v_actor LIMIT 1;
  SELECT role::text INTO v_target_role FROM public.user_roles WHERE user_id=_target_user_id LIMIT 1;
  IF v_actor_role='admin' THEN NULL;
  ELSIF v_actor_role='senior_moderator' AND v_target_role='moderator' AND _status='suspended' AND v_actor<>_target_user_id THEN NULL;
  ELSE RAISE EXCEPTION 'not allowed'; END IF;
  IF v_target_role NOT IN ('moderator','senior_moderator') OR v_actor=_target_user_id OR (v_actor_role<>'admin' AND v_target_role<>'moderator') THEN RAISE EXCEPTION 'protected moderation role'; END IF;
  UPDATE public.user_roles SET moderation_status=_status WHERE user_id=_target_user_id AND role::text IN ('moderator','senior_moderator');
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,_target_user_id,CASE WHEN _status='suspended' THEN 'SUSPEND_MODERATOR' ELSE 'REACTIVATE_MODERATOR' END,jsonb_build_object('role',v_target_role,'status',_status,'reason',CASE WHEN _status='suspended' THEN trim(_reason_text) ELSE NULL END));
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_track public.tracks%ROWTYPE; v_cleanup jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
  PERFORM public._lock_user_security_state(v_track.user_id);
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_track.user_id AND role::text='admin') AND NOT public.current_user_has_role('admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url);
  DELETE FROM public.tracks WHERE id=_track_id;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,v_track.user_id,'DELETE_TRACK',v_cleanup||jsonb_build_object('track_id',_track_id));
  RETURN jsonb_build_object('ok',true)||v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_track public.tracks%ROWTYPE; v_cleanup jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE;
  IF NOT FOUND OR (v_track.user_id<>v_actor AND NOT public.current_user_has_role('admin')) THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
  IF v_track.user_id=v_actor AND v_track.moderation_status<>'active' THEN RAISE EXCEPTION 'locked tracks cannot be deleted by their owner'; END IF;
  v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url);
  DELETE FROM public.tracks WHERE id=_track_id;
  RETURN jsonb_build_object('ok',true)||v_cleanup;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid,boolean,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_moderation_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_track(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_track_with_cleanup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_moderation_status(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_delete_track(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_track_with_cleanup(uuid) TO authenticated, service_role;

-- Complete account-first locking for remaining sensitive RPCs.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id uuid, _role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid := auth.uid(); v_old text; v_action text; BEGIN
 PERFORM public._lock_user_security_pair(v_actor,_target_user_id);
 IF NOT public.has_moderation_capability('can_manage_roles') THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF _target_user_id=v_actor THEN RAISE EXCEPTION 'cannot change your own role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
 IF public._has_role_internal(_target_user_id,'admin') THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
 IF _role::text NOT IN ('user','moderator','senior_moderator') THEN RAISE EXCEPTION 'invalid assignable role'; END IF;
 SELECT role::text INTO v_old FROM public.user_roles WHERE user_id=_target_user_id ORDER BY CASE role::text WHEN 'admin' THEN 4 WHEN 'senior_moderator' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC LIMIT 1;
 DELETE FROM public.user_roles WHERE user_id=_target_user_id; INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES(_target_user_id,_role,'active');
 v_action:=CASE WHEN _role::text='moderator' THEN 'ASSIGN_MODERATOR_ROLE' WHEN _role::text='senior_moderator' THEN 'ASSIGN_SENIOR_MODERATOR_ROLE' WHEN v_old IN ('moderator','senior_moderator') THEN 'REMOVE_MODERATOR_ROLE' ELSE 'CHANGE_MODERATOR_ROLE' END;
 INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,_target_user_id,v_action,jsonb_build_object('from_role',v_old,'to_role',_role::text)); END; $$;
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid,_banned boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); BEGIN
 PERFORM public._lock_user_security_pair(v_actor,_user_id); IF v_actor IS NULL OR NOT public._has_role_internal(v_actor,'admin') THEN RAISE EXCEPTION 'not allowed'; END IF; IF _user_id=v_actor THEN RAISE EXCEPTION 'cannot change your own account status'; END IF; IF public._has_role_internal(_user_id,'admin') THEN RAISE EXCEPTION 'admin accounts are protected'; END IF;
 PERFORM set_config('promptbeats.authorized_moderation_ban','on',true); INSERT INTO public.profile_private(user_id,is_banned,block_reason_code,block_reason_text,blocked_at,blocked_by) VALUES(_user_id,_banned,CASE WHEN _banned THEN 'other' ELSE NULL END,CASE WHEN _banned THEN 'Legacy moderation action' ELSE NULL END,CASE WHEN _banned THEN now() ELSE NULL END,CASE WHEN _banned THEN v_actor ELSE NULL END) ON CONFLICT(user_id) DO UPDATE SET is_banned=EXCLUDED.is_banned,block_reason_code=EXCLUDED.block_reason_code,block_reason_text=EXCLUDED.block_reason_text,blocked_at=EXCLUDED.blocked_at,blocked_by=EXCLUDED.blocked_by; END; $$;
CREATE OR REPLACE FUNCTION public.admin_set_model_access(_target_user_id uuid,_access_mode text,_allowed_models text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); BEGIN
 PERFORM public._lock_user_security_pair(v_actor,_target_user_id); PERFORM 1 FROM public.user_model_access WHERE user_id=_target_user_id FOR UPDATE; IF NOT public._has_role_internal(v_actor,'admin') THEN RAISE EXCEPTION 'not allowed'; END IF; IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'user not found'; END IF; IF _access_mode NOT IN ('inherit','custom') THEN RAISE EXCEPTION 'invalid access mode'; END IF; IF _access_mode='custom' AND cardinality(COALESCE(_allowed_models,'{}'))=0 THEN RAISE EXCEPTION 'custom access needs a model'; END IF;
 INSERT INTO public.user_model_access(user_id,access_mode,allowed_models) VALUES(_target_user_id,_access_mode,COALESCE(_allowed_models,'{}')) ON CONFLICT(user_id) DO UPDATE SET access_mode=EXCLUDED.access_mode,allowed_models=EXCLUDED.allowed_models,updated_at=now(); INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,_target_user_id,'UPDATE_MODEL_ACCESS',jsonb_build_object('mode',_access_mode,'model_count',cardinality(COALESCE(_allowed_models,'{}')))); END; $$;
CREATE OR REPLACE FUNCTION public.admin_create_registration_block(_email text,_reason_code text,_reason_text text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_admin uuid:=auth.uid(); v_email text:=public.normalize_registration_email(_email); v_id uuid; BEGIN
 PERFORM public._lock_user_security_state(v_admin); PERFORM 1 FROM public.registration_blocks WHERE email_normalized=v_email FOR UPDATE; IF NOT public._has_role_internal(v_admin,'admin') THEN RAISE EXCEPTION 'not allowed'; END IF; IF v_email='' OR _reason_code NOT IN('platform_rules','copyright_or_third_party_rights','abuse_spam_or_harmful_activity','ai_or_platform_misuse','security_concern','other') THEN RAISE EXCEPTION 'invalid registration block'; END IF; IF _reason_code='other' AND length(trim(COALESCE(_reason_text,'')))=0 THEN RAISE EXCEPTION 'custom registration block reason is required'; END IF;
 INSERT INTO public.registration_blocks(email_normalized,reason_code,reason_text,blocked_by) VALUES(v_email,_reason_code,CASE WHEN _reason_code='other' THEN trim(_reason_text) ELSE NULL END,v_admin) ON CONFLICT(email_normalized) DO UPDATE SET reason_code=EXCLUDED.reason_code,reason_text=EXCLUDED.reason_text,blocked_at=now(),blocked_by=EXCLUDED.blocked_by RETURNING id INTO v_id; RETURN v_id; END; $$;
CREATE OR REPLACE FUNCTION public.admin_remove_registration_block(_block_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_admin uuid:=auth.uid(); v_email text; BEGIN
 PERFORM public._lock_user_security_state(v_admin); PERFORM 1 FROM public.registration_blocks WHERE id=_block_id FOR UPDATE; IF NOT public._has_role_internal(v_admin,'admin') THEN RAISE EXCEPTION 'not allowed'; END IF; DELETE FROM public.registration_blocks WHERE id=_block_id RETURNING email_normalized INTO v_email; IF v_email IS NULL THEN RAISE EXCEPTION 'registration block not found'; END IF; INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_admin,NULL,'UNBLOCK_REGISTRATION',jsonb_build_object('registration_block_id',_block_id)); END; $$;

CREATE OR REPLACE FUNCTION public.start_generation_job(_idempotency_key uuid, _input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job public.ai_generation_jobs;
  v_used integer;
  v_reserved integer;
  v_gen uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM public._lock_user_security_state(v_user);

  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE user_id = v_user AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_job);
  END IF;

  -- Never admit a second job while an earlier provider call may still be in
  -- flight. Dismissed pending jobs are the only jobs that may be bypassed.
  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE user_id = v_user
    AND status IN ('pending', 'processing')
    AND dismissed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN to_jsonb(v_job);
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';

    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id = v_user AND status = 'processing';

    IF v_used + v_reserved >= 10 THEN
      RETURN jsonb_build_object('rate_limited', true);
    END IF;
  END IF;

  -- This row is the generation's durable usage reservation and is inserted
  -- in the same transaction as the job admission, before the runner can call
  -- a provider.
  INSERT INTO public.ai_generations (user_id) VALUES (v_user) RETURNING id INTO v_gen;

  INSERT INTO public.ai_generation_jobs (user_id, idempotency_key, status, input_payload, generation_id)
  VALUES (v_user, _idempotency_key, 'pending', _input, v_gen)
  RETURNING * INTO v_job;

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
DECLARE
  v_user uuid := auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;

  IF FOUND AND v_action.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'qualityReport', v_action.quality_report
    );
  END IF;

  IF FOUND AND v_action.status = 'failed' AND v_action.provider_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  -- Claims before the provider-start marker may be reclaimed after a worker
  -- disappeared. Once marked started, never reclaim automatically: the
  -- provider may still be in flight and a duplicate call would be billable.
  IF FOUND AND v_action.status = 'processing'
     AND (v_action.provider_started_at IS NOT NULL
          OR v_action.updated_at > now() - interval '15 minutes') THEN
    RETURN jsonb_build_object('status', 'processing');
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';

    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id = v_user AND status = 'processing'
      AND (v_action.id IS NULL OR id <> v_action.id);

    IF v_used + v_reserved >= 10 THEN
      RETURN jsonb_build_object('status', 'rate_limited');
    END IF;
  END IF;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'processing',
        quality_report = NULL,
        consumed_generation_id = NULL,
        provider_started_at = NULL,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN jsonb_build_object('status', 'claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions (user_id, idempotency_key, status)
  VALUES (v_user, _idempotency_key, 'processing');
  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_quality_check_provider_started(_idempotency_key uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  UPDATE public.ai_quality_check_actions
  SET provider_started_at = now(), updated_at = now()
  WHERE user_id = v_user
    AND idempotency_key = _idempotency_key
    AND status = 'processing'
    AND provider_started_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality check is no longer claimable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_quality_check(_idempotency_key uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  UPDATE public.ai_quality_check_actions
  SET status = 'failed', updated_at = now()
  WHERE user_id = v_user
    AND idempotency_key = _idempotency_key
    AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_quality_check(
  _idempotency_key uuid,
  _quality_report jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_action public.ai_quality_check_actions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality check action was not claimed';
  END IF;
  IF v_action.status <> 'processing' THEN
    RAISE EXCEPTION 'quality check action is not processing';
  END IF;
  IF v_action.provider_started_at IS NULL THEN
    RAISE EXCEPTION 'quality check provider was not started';
  END IF;

  SELECT id INTO v_id
  FROM public.ai_generations
  WHERE user_id = v_user AND quality_check_key = _idempotency_key;
  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'completed', quality_report = _quality_report,
        consumed_generation_id = v_id, updated_at = now()
    WHERE id = v_action.id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ai_generations (user_id, quality_check_key)
  VALUES (v_user, _idempotency_key)
  RETURNING id INTO v_id;

  UPDATE public.ai_quality_check_actions
  SET status = 'completed', quality_report = _quality_report,
      consumed_generation_id = v_id, updated_at = now()
  WHERE id = v_action.id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_lock_track(_track_id uuid,_reason_code text,_reason_text text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; v_status text; BEGIN
 SELECT user_id,moderation_status INTO v_owner,v_status FROM public.tracks WHERE id=_track_id; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
 PERFORM public._lock_user_security_pair(v_actor,v_owner); SELECT user_id,moderation_status INTO v_owner,v_status FROM public.tracks WHERE id=_track_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
 IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF _reason_code NOT IN('reported_third_party_rights','suspected_copyright_rights','policy_violation','harassment_abusive_content','spam_deceptive_content','other') OR (_reason_code='other' AND length(trim(COALESCE(_reason_text,'')))=0) THEN RAISE EXCEPTION 'invalid track moderation reason'; END IF;
 UPDATE public.tracks SET moderation_status='locked',moderation_reason_code=_reason_code,moderation_reason_text=CASE WHEN _reason_code='other' THEN trim(_reason_text) ELSE NULL END,moderation_locked_at=now(),moderation_locked_by=v_actor WHERE id=_track_id;
 INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,v_owner,'LOCK_TRACK',jsonb_build_object('track_id',_track_id,'reason_code',_reason_code,'has_custom_reason',_reason_code='other')); RETURN jsonb_build_object('ok',true,'track_id',_track_id,'moderation_status','locked'); END; $$;
CREATE OR REPLACE FUNCTION public.staff_unlock_track(_track_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; BEGIN
 SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF; PERFORM public._lock_user_security_pair(v_actor,v_owner); SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
 IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF; UPDATE public.tracks SET moderation_status='active',moderation_reason_code=NULL,moderation_reason_text=NULL,moderation_locked_at=NULL,moderation_locked_by=NULL WHERE id=_track_id; INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,v_owner,'UNLOCK_TRACK',jsonb_build_object('track_id',_track_id)); RETURN jsonb_build_object('ok',true,'track_id',_track_id,'moderation_status','active'); END; $$;

CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; v_track public.tracks%ROWTYPE; v_cleanup jsonb; BEGIN
 SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
 PERFORM public._lock_user_security_pair(v_actor,v_owner); SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;
 IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_track.user_id AND role::text='admin') AND NOT public.current_user_has_role('admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
 v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url); DELETE FROM public.tracks WHERE id=_track_id;
 INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details) VALUES(v_actor,v_track.user_id,'DELETE_TRACK',v_cleanup||jsonb_build_object('track_id',_track_id)); RETURN jsonb_build_object('ok',true)||v_cleanup; END; $$;
CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_owner uuid; v_track public.tracks%ROWTYPE; v_cleanup jsonb; BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF; SELECT user_id INTO v_owner FROM public.tracks WHERE id=_track_id; IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
 PERFORM public._lock_user_security_pair(v_actor,v_owner); SELECT * INTO v_track FROM public.tracks WHERE id=_track_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
 IF v_track.user_id<>v_actor AND NOT public.current_user_has_role('admin') THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;
 IF v_track.user_id=v_actor AND v_track.moderation_status<>'active' THEN RAISE EXCEPTION 'locked tracks cannot be deleted by their owner'; END IF;
 v_cleanup:=public.capture_track_storage_cleanup(_track_id,v_track.user_id,v_actor,v_track.audio_key,v_track.cover_url); DELETE FROM public.tracks WHERE id=_track_id; RETURN jsonb_build_object('ok',true)||v_cleanup; END; $$;

CREATE OR REPLACE FUNCTION public.consume_admin_account_deletion(_operation_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_target uuid; v_operation_actor uuid; v_used timestamptz; v_expires timestamptz; BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
 SELECT actor_id,target_user_id,used_at,expires_at INTO v_operation_actor,v_target,v_used,v_expires FROM public.admin_account_deletion_operations WHERE id=_operation_id FOR UPDATE;
 IF NOT FOUND OR v_operation_actor<>v_actor OR v_used IS NOT NULL OR v_expires<=now() THEN RAISE EXCEPTION 'account deletion authorization is invalid or expired'; END IF;
 PERFORM public._lock_user_security_pair(v_actor,v_target);
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_target) OR public._has_role_internal(v_target,'admin') THEN RAISE EXCEPTION 'account deletion target is no longer eligible'; END IF;
 UPDATE public.admin_account_deletion_operations SET used_at=now() WHERE id=_operation_id AND actor_id=v_actor AND used_at IS NULL AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'account deletion authorization is invalid or expired'; END IF;
 RETURN v_target;
END; $$;
REVOKE ALL ON FUNCTION public.consume_admin_account_deletion(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.consume_admin_account_deletion(uuid) TO authenticated,service_role;
