-- PromptBeats Phase B — canonical Feature Access governance.
BEGIN;

CREATE TABLE public.feature_access_policies (
  feature_key text PRIMARY KEY CHECK (feature_key ~ '^[a-z0-9_]+$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  access_mode text NOT NULL DEFAULT 'everyone'
    CHECK (access_mode IN ('disabled','admins_only','selected_users','everyone')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.feature_access_users (
  feature_key text NOT NULL REFERENCES public.feature_access_policies(feature_key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (feature_key,user_id)
);

CREATE INDEX feature_access_users_user_idx ON public.feature_access_users(user_id,feature_key);

ALTER TABLE public.feature_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_access_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_access_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.feature_access_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.feature_access_policies TO service_role;
GRANT ALL ON public.feature_access_users TO service_role;

INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES
  ('smart_presets','Smart Presets','Curated generator presets and cultural musical adaptation.','everyone'),
  ('export_center','Export Center','Prompt and Project exports in supported document formats.','everyone'),
  ('follow_creators','Follow Creators','Creator follow/unfollow relationships and follower lists.','everyone'),
  ('notifications','Notifications','In-app new-track and new-follower notifications.','everyone')
ON CONFLICT(feature_key) DO NOTHING;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS',
  'ASSIGN_ADMIN_ROLE','REMOVE_ADMIN_ROLE','ASSIGN_SUPER_ADMIN_ROLE','REMOVE_SUPER_ADMIN_ROLE',
  'UPDATE_FEATURE_ACCESS_POLICY','ADD_FEATURE_ACCESS_USER','REMOVE_FEATURE_ACCESS_USER'
));

CREATE OR REPLACE FUNCTION public.can_use_feature(_user_id uuid,_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mode text;
BEGIN
  IF _user_id IS NULL OR NOT public.has_valid_account_state(_user_id) THEN
    RETURN false;
  END IF;

  SELECT access_mode INTO v_mode
  FROM public.feature_access_policies
  WHERE feature_key=_feature_key;

  IF v_mode IS NULL OR v_mode='disabled' THEN RETURN false; END IF;
  IF v_mode='everyone' THEN RETURN true; END IF;
  IF v_mode='admins_only' THEN RETURN public._is_admin_level_internal(_user_id); END IF;
  IF v_mode='selected_users' THEN
    RETURN EXISTS(
      SELECT 1 FROM public.feature_access_users
      WHERE feature_key=_feature_key AND user_id=_user_id
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_use_feature(_feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.can_use_feature(auth.uid(),_feature_key);
$$;

CREATE OR REPLACE FUNCTION public.feature_access_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'feature_key',p.feature_key,
    'display_name',p.display_name,
    'description',p.description,
    'access_mode',p.access_mode,
    'selected_count',(SELECT count(*) FROM public.feature_access_users fu WHERE fu.feature_key=p.feature_key),
    'updated_at',p.updated_at,
    'updated_by',p.updated_by,
    'updated_by_email',u.email
  ) ORDER BY p.display_name),'[]'::jsonb)
  INTO v_result
  FROM public.feature_access_policies p
  LEFT JOIN auth.users u ON u.id=p.updated_by;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_selected_users(_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.feature_access_policies WHERE feature_key=_feature_key) THEN
    RAISE EXCEPTION 'feature not found';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',fu.user_id,
    'email',u.email,
    'handle',p.handle,
    'display_name',p.display_name,
    'created_at',fu.created_at
  ) ORDER BY COALESCE(p.display_name,p.handle,u.email)),'[]'::jsonb)
  INTO v_result
  FROM public.feature_access_users fu
  JOIN auth.users u ON u.id=fu.user_id
  LEFT JOIN public.profiles p ON p.id=fu.user_id
  WHERE fu.feature_key=_feature_key;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_search_users(_search text DEFAULT '',_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_search text:=lower(trim(COALESCE(_search,''))); v_result jsonb;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT u.id AS user_id,u.email,p.handle,p.display_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id=u.id
    LEFT JOIN public.profile_private pp ON pp.user_id=u.id
    WHERE COALESCE(pp.is_banned,false)=false
      AND (
        v_search='' OR lower(COALESCE(u.email,'')) LIKE '%'||v_search||'%'
        OR lower(COALESCE(p.handle,'')) LIKE '%'||v_search||'%'
        OR lower(COALESCE(p.display_name,'')) LIKE '%'||v_search||'%'
      )
    ORDER BY u.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(_limit,20),1),50)
  ) q;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_set_policy(_feature_key text,_access_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_old text;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _access_mode NOT IN ('disabled','admins_only','selected_users','everyone') THEN
    RAISE EXCEPTION 'invalid access mode';
  END IF;
  SELECT access_mode INTO v_old
  FROM public.feature_access_policies
  WHERE feature_key=_feature_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feature not found'; END IF;
  IF v_old=_access_mode THEN RETURN; END IF;
  UPDATE public.feature_access_policies
  SET access_mode=_access_mode,updated_at=now(),updated_by=v_actor
  WHERE feature_key=_feature_key;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,NULL,'UPDATE_FEATURE_ACCESS_POLICY',jsonb_build_object(
    'feature_key',_feature_key,'previous_access_mode',v_old,'new_access_mode',_access_mode
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_add_user(_feature_key text,_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_inserted boolean:=false;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.feature_access_policies WHERE feature_key=_feature_key) THEN RAISE EXCEPTION 'feature not found'; END IF;
  IF NOT public.has_valid_account_state(_user_id) THEN RAISE EXCEPTION 'user not available'; END IF;
  INSERT INTO public.feature_access_users(feature_key,user_id,created_by)
  VALUES(_feature_key,_user_id,v_actor)
  ON CONFLICT(feature_key,user_id) DO NOTHING;
  v_inserted:=FOUND;
  IF v_inserted THEN
    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
    VALUES(v_actor,_user_id,'ADD_FEATURE_ACCESS_USER',jsonb_build_object('feature_key',_feature_key));
  END IF;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_remove_user(_feature_key text,_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_actor uuid:=auth.uid(); v_removed boolean:=false;
BEGIN
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.feature_access_users
  WHERE feature_key=_feature_key AND user_id=_user_id;
  v_removed:=FOUND;
  IF v_removed THEN
    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
    VALUES(v_actor,_user_id,'REMOVE_FEATURE_ACCESS_USER',jsonb_build_object('feature_key',_feature_key));
  END IF;
  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.can_use_feature(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.current_user_can_use_feature(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_selected_users(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_search_users(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_set_policy(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_add_user(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.feature_access_remove_user(text,uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_use_feature(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_list() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_selected_users(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_search_users(text,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_set_policy(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_add_user(text,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_remove_user(text,uuid) TO authenticated,service_role;

COMMIT;
