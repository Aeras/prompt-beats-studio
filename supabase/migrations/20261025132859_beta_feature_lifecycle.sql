-- New explicitly registered features only. No legacy policy backfill or updates.
CREATE TABLE public.beta_features (
  feature_key text PRIMARY KEY CHECK (feature_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  stage text NOT NULL DEFAULT 'beta' CHECK (stage IN ('beta','stable','archived','feature_access')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.beta_testers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.beta_feature_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature_key text REFERENCES public.beta_features(feature_key),
  action text NOT NULL CHECK (action IN ('register','beta','stable','archive','restore','promote','tester_grant','tester_revoke')),
  previous_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_feature_events_created_idx ON public.beta_feature_events(created_at DESC,id DESC);
ALTER TABLE public.beta_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feature_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_features,public.beta_testers,public.beta_feature_events
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.beta_feature_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

-- Private predicates: user metadata/JWT role claims never confer Beta privileges.
CREATE FUNCTION public.beta_account_eligible(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.profile_private p ON p.user_id=u.id
    WHERE u.id=_user_id AND NOT p.is_banned AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.moderation_status<>'active'
  );
$$;
CREATE FUNCTION public.beta_can_test(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.beta_account_eligible(_user_id) AND (
    EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id
      AND r.role::text IN ('moderator','senior_moderator','admin','super_admin') AND r.moderation_status='active')
    OR EXISTS(SELECT 1 FROM public.beta_testers b WHERE b.user_id=_user_id)
  );
$$;
CREATE FUNCTION public.assert_beta_super_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public._lock_user_security_state(auth.uid());
  IF NOT public.beta_account_eligible(auth.uid()) OR NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.beta_account_eligible(uuid),public.beta_can_test(uuid),public.assert_beta_super_admin()
  FROM PUBLIC,anon,authenticated,service_role;

-- Migration-only registration. The same stable identifier survives promotion.
-- Replaying registration never resets a lifecycle or a subsequently edited policy.
CREATE FUNCTION public.register_beta_feature(_feature_key text,_display_name text,_description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.beta_features;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('beta-register:'||_feature_key,0));
  SELECT * INTO v_row FROM public.beta_features WHERE feature_key=_feature_key;
  IF FOUND THEN
    IF v_row.display_name IS DISTINCT FROM _display_name OR v_row.description IS DISTINCT FROM _description THEN
      RAISE EXCEPTION 'Feature registration conflicts with existing metadata';
    END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.feature_access_policies WHERE feature_key=_feature_key) THEN
    RAISE EXCEPTION 'Existing Feature Access policies cannot enter Beta';
  END IF;
  INSERT INTO public.beta_features(feature_key,display_name,description)
    VALUES(_feature_key,_display_name,_description);
  INSERT INTO public.beta_feature_events(feature_key,action,previous_state,new_state)
    VALUES(_feature_key,'register','{}',jsonb_build_object('stage','beta','revision',0));
END;
$$;
REVOKE ALL ON FUNCTION public.register_beta_feature(text,text,text) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the old policy algorithm for every legacy key. Only explicitly
-- registered, not-yet-promoted entries take the new lifecycle branch.
CREATE OR REPLACE FUNCTION public.can_use_feature(_user_id uuid,_feature_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_mode text; v_stage text;
BEGIN
  IF _user_id IS NULL OR NOT public.has_valid_account_state(_user_id) THEN RETURN false; END IF;
  SELECT stage INTO v_stage FROM public.beta_features WHERE feature_key=_feature_key;
  IF FOUND THEN
    IF NOT public.beta_account_eligible(_user_id) THEN RETURN false; END IF;
    IF v_stage IN ('stable','archived') THEN RETURN true; END IF;
    IF v_stage='beta' THEN RETURN public.beta_can_test(_user_id); END IF;
  END IF;
  SELECT access_mode INTO v_mode FROM public.feature_access_policies WHERE feature_key=_feature_key;
  IF v_mode IS NULL OR v_mode='disabled' THEN RETURN false; END IF;
  IF v_mode='everyone' THEN RETURN true; END IF;
  IF v_mode='admins_only' THEN RETURN public._is_admin_level_internal(_user_id); END IF;
  IF v_mode='selected_users' THEN
    RETURN EXISTS(SELECT 1 FROM public.feature_access_users WHERE feature_key=_feature_key AND user_id=_user_id);
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION public.beta_features_list() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_features jsonb; v_events jsonb;
BEGIN
  PERFORM public.assert_beta_super_admin();
  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.display_name),'[]') INTO v_features
    FROM public.beta_features f WHERE stage<>'feature_access';
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id DESC),'[]') INTO v_events
    FROM (SELECT * FROM public.beta_feature_events ORDER BY id DESC LIMIT 100) e;
  RETURN jsonb_build_object('features',v_features,'events',v_events);
END;
$$;

CREATE FUNCTION public.beta_feature_transition(
  _feature_key text,_action text,_expected_revision bigint,_confirmed boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.beta_features; v_next text; v_old text;
BEGIN
  PERFORM public.assert_beta_super_admin();
  IF _action IS NULL OR _action NOT IN ('beta','stable','archive','restore','promote')
    OR _expected_revision IS NULL OR _expected_revision<0 THEN RAISE EXCEPTION 'Invalid Beta action'; END IF;
  IF _action='promote' AND _confirmed IS NOT TRUE THEN RAISE EXCEPTION 'Promotion requires confirmation'; END IF;
  SELECT * INTO v_row FROM public.beta_features WHERE feature_key=_feature_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Feature not found'; END IF;
  v_next:=CASE _action WHEN 'archive' THEN 'archived' WHEN 'restore' THEN 'stable'
    WHEN 'promote' THEN 'feature_access' ELSE _action END;
  -- A lost-ACK retry must not re-audit or reset an already-promoted policy.
  IF v_row.stage=v_next THEN RETURN to_jsonb(v_row); END IF;
  IF v_row.revision<>_expected_revision THEN RAISE EXCEPTION 'Beta settings changed. Refresh and retry.' USING ERRCODE='PT409'; END IF;
  IF v_row.stage='feature_access' THEN RAISE EXCEPTION 'Feature is managed by Feature Access'; END IF;
  IF (_action IN ('archive','promote') AND v_row.stage<>'stable')
    OR (_action='restore' AND v_row.stage<>'archived')
    OR (_action IN ('beta','stable') AND v_row.stage='archived') THEN RAISE EXCEPTION 'Invalid Beta transition'; END IF;
  v_old:=v_row.stage;
  IF _action='promote' THEN
    INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode,updated_by)
      VALUES(v_row.feature_key,v_row.display_name,v_row.description,'everyone',auth.uid());
  END IF;
  UPDATE public.beta_features SET stage=v_next,revision=revision+1,updated_at=now(),updated_by=auth.uid()
    WHERE feature_key=_feature_key RETURNING * INTO v_row;
  INSERT INTO public.beta_feature_events(actor_id,feature_key,action,previous_state,new_state)
    VALUES(auth.uid(),_feature_key,_action,jsonb_build_object('stage',v_old,'revision',_expected_revision),
      jsonb_build_object('stage',v_next,'revision',v_row.revision));
  RETURN to_jsonb(v_row);
END;
$$;

CREATE FUNCTION public.beta_tester_detail(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_beta_super_admin();
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  RETURN jsonb_build_object('enabled',EXISTS(SELECT 1 FROM public.beta_testers WHERE user_id=_user_id),
    'eligible',public.beta_account_eligible(_user_id),
    'role_access',public.beta_account_eligible(_user_id) AND EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id=_user_id AND role::text IN ('moderator','senior_moderator','admin','super_admin') AND moderation_status='active'));
END;
$$;
CREATE FUNCTION public.beta_tester_set(_user_id uuid,_enabled boolean,_expected_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old boolean;
BEGIN
  -- Deterministic lock order also fences concurrent role/ban/account changes.
  PERFORM public._lock_user_security_pair(auth.uid(),_user_id);
  PERFORM public.assert_beta_super_admin();
  IF _enabled IS NULL OR _expected_enabled IS NULL THEN RAISE EXCEPTION 'Invalid Beta entitlement'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  IF _enabled AND NOT public.beta_account_eligible(_user_id) THEN RAISE EXCEPTION 'Account is unavailable'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.beta_testers WHERE user_id=_user_id) INTO v_old;
  IF v_old=_enabled THEN RETURN jsonb_build_object('enabled',v_old); END IF;
  IF v_old<>_expected_enabled THEN RAISE EXCEPTION 'Beta settings changed. Refresh and retry.' USING ERRCODE='PT409'; END IF;
  IF _enabled THEN
    INSERT INTO public.beta_testers(user_id,granted_by) VALUES(_user_id,auth.uid());
  ELSE
    DELETE FROM public.beta_testers WHERE user_id=_user_id;
  END IF;
  INSERT INTO public.beta_feature_events(actor_id,target_user_id,action,previous_state,new_state)
    VALUES(auth.uid(),_user_id,CASE WHEN _enabled THEN 'tester_grant' ELSE 'tester_revoke' END,
      jsonb_build_object('enabled',v_old),jsonb_build_object('enabled',_enabled));
  RETURN jsonb_build_object('enabled',_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.beta_features_list(),public.beta_feature_transition(text,text,bigint,boolean),
  public.beta_tester_detail(uuid),public.beta_tester_set(uuid,boolean,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.beta_features_list(),public.beta_feature_transition(text,text,bigint,boolean),
  public.beta_tester_detail(uuid),public.beta_tester_set(uuid,boolean,boolean) TO authenticated;

-- New promoted keys use the existing policy model/UI. The historical add-user
-- RPC validates targets using a caller-bound predicate; use target eligibility
-- here without changing that RPC or the 19 existing features' behavior.
CREATE FUNCTION public.beta_feature_access_mutate(
  _feature_key text,_operation text,_access_mode text DEFAULT NULL,_user_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_changed boolean; v_old text; v_actor uuid:=auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(auth.uid(),_user_id);
  PERFORM public.assert_beta_super_admin();
  PERFORM 1 FROM public.beta_features WHERE feature_key=_feature_key AND stage='feature_access' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Feature is not managed by Feature Access'; END IF;
  IF _operation='set_policy' THEN
    IF _access_mode IS NULL OR _access_mode NOT IN ('disabled','admins_only','selected_users','everyone') THEN RAISE EXCEPTION 'Invalid access mode'; END IF;
    SELECT access_mode INTO v_old FROM public.feature_access_policies WHERE feature_key=_feature_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Feature not found'; END IF;
    IF v_old=_access_mode THEN RETURN false; END IF;
    UPDATE public.feature_access_policies SET access_mode=_access_mode,updated_at=now(),updated_by=v_actor WHERE feature_key=_feature_key;
    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
      VALUES(v_actor,NULL,'UPDATE_FEATURE_ACCESS_POLICY',jsonb_build_object('feature_key',_feature_key,
        'previous_access_mode',v_old,'new_access_mode',_access_mode));
    RETURN true;
  ELSIF _operation='remove_user' THEN
    IF _user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
    DELETE FROM public.feature_access_users WHERE feature_key=_feature_key AND user_id=_user_id;
    v_changed:=FOUND;
    IF v_changed THEN
      INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
        VALUES(v_actor,_user_id,'REMOVE_FEATURE_ACCESS_USER',jsonb_build_object('feature_key',_feature_key));
    END IF;
    RETURN v_changed;
  ELSIF _operation='add_user' THEN
    IF _user_id IS NULL OR NOT public.beta_account_eligible(_user_id) THEN RAISE EXCEPTION 'Account is unavailable'; END IF;
    INSERT INTO public.feature_access_users(feature_key,user_id,created_by)
      VALUES(_feature_key,_user_id,auth.uid()) ON CONFLICT(feature_key,user_id) DO NOTHING;
    v_changed:=FOUND;
    IF v_changed THEN
      INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
        VALUES(auth.uid(),_user_id,'ADD_FEATURE_ACCESS_USER',jsonb_build_object('feature_key',_feature_key));
    END IF;
    RETURN v_changed;
  END IF;
  RAISE EXCEPTION 'Invalid Feature Access operation';
END;
$$;
REVOKE ALL ON FUNCTION public.beta_feature_access_mutate(text,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.beta_feature_access_mutate(text,text,text,uuid) TO authenticated;

-- Dispatch only new managed keys to the fenced path. The legacy bodies below
-- remain the original Phase B algorithms; their ACLs are preserved by REPLACE.
CREATE OR REPLACE FUNCTION public.feature_access_set_policy(_feature_key text,_access_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_old text;
BEGIN
  IF EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key=_feature_key) THEN
    PERFORM public.beta_feature_access_mutate(_feature_key,'set_policy',_access_mode); RETURN;
  END IF;
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _access_mode NOT IN ('disabled','admins_only','selected_users','everyone') THEN RAISE EXCEPTION 'invalid access mode'; END IF;
  SELECT access_mode INTO v_old FROM public.feature_access_policies WHERE feature_key=_feature_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feature not found'; END IF;
  IF v_old=_access_mode THEN RETURN; END IF;
  UPDATE public.feature_access_policies SET access_mode=_access_mode,updated_at=now(),updated_by=v_actor WHERE feature_key=_feature_key;
  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
    VALUES(v_actor,NULL,'UPDATE_FEATURE_ACCESS_POLICY',jsonb_build_object('feature_key',_feature_key,'previous_access_mode',v_old,'new_access_mode',_access_mode));
END;
$$;
CREATE OR REPLACE FUNCTION public.feature_access_add_user(_feature_key text,_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_inserted boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key=_feature_key) THEN
    RETURN public.beta_feature_access_mutate(_feature_key,'add_user',NULL,_user_id);
  END IF;
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.feature_access_policies WHERE feature_key=_feature_key) THEN RAISE EXCEPTION 'feature not found'; END IF;
  IF NOT public.has_valid_account_state(_user_id) THEN RAISE EXCEPTION 'user not available'; END IF;
  INSERT INTO public.feature_access_users(feature_key,user_id,created_by) VALUES(_feature_key,_user_id,v_actor)
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
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_removed boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key=_feature_key) THEN
    RETURN public.beta_feature_access_mutate(_feature_key,'remove_user',NULL,_user_id);
  END IF;
  IF NOT public.current_user_is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.feature_access_users WHERE feature_key=_feature_key AND user_id=_user_id;
  v_removed:=FOUND;
  IF v_removed THEN
    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
      VALUES(v_actor,_user_id,'REMOVE_FEATURE_ACCESS_USER',jsonb_build_object('feature_key',_feature_key));
  END IF;
  RETURN v_removed;
END;
$$;
