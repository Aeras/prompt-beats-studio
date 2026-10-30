-- PB-015 — Subscription Entitlements & Plan-Aware Feature Access.
-- Code/migration only. This migration must not activate any paid Feature Access
-- mode or alter the existing Stripe projection semantics.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.subscription_manual_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('plus','pro')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  revoked_at timestamptz NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text NULL,
  CONSTRAINT subscription_manual_grants_expiry_check
    CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT subscription_manual_grants_reason_check
    CHECK (
      reason = btrim(reason)
      AND char_length(reason) BETWEEN 3 AND 500
    ),
  CONSTRAINT subscription_manual_grants_revoke_check
    CHECK (
      (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
      OR
      (
        revoked_at IS NOT NULL
        AND revoke_reason IS NOT NULL
        AND revoke_reason = btrim(revoke_reason)
        AND char_length(revoke_reason) BETWEEN 3 AND 500
      )
    )
);

CREATE INDEX subscription_manual_grants_user_active_idx
  ON public.subscription_manual_grants(user_id, plan, starts_at, expires_at)
  WHERE revoked_at IS NULL;

CREATE FUNCTION public.protect_subscription_manual_grant_semantics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(
    NEW.user_id,
    NEW.plan,
    NEW.starts_at,
    NEW.expires_at,
    NEW.granted_by,
    NEW.reason,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.user_id,
    OLD.plan,
    OLD.starts_at,
    OLD.expires_at,
    OLD.granted_by,
    OLD.reason,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'manual grant semantics are immutable; revoke and create a new grant';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND ROW(
    NEW.revoked_at,
    NEW.revoked_by,
    NEW.revoke_reason
  ) IS DISTINCT FROM ROW(
    OLD.revoked_at,
    OLD.revoked_by,
    OLD.revoke_reason
  ) THEN
    RAISE EXCEPTION 'revoked manual grants are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_subscription_manual_grant_semantics
BEFORE UPDATE ON public.subscription_manual_grants
FOR EACH ROW
EXECUTE FUNCTION public.protect_subscription_manual_grant_semantics();

ALTER TABLE public.subscription_manual_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_manual_grants FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_subscription_manual_grant_semantics()
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the existing policy rows exactly as-is; only widen the allowed enum-like CHECK.
ALTER TABLE public.feature_access_policies
  DROP CONSTRAINT IF EXISTS feature_access_policies_access_mode_check;
ALTER TABLE public.feature_access_policies
  ADD CONSTRAINT feature_access_policies_access_mode_check
  CHECK (access_mode IN ('disabled','admins_only','selected_users','everyone','plus_or_pro','pro_only'));

-- Append bounded entitlement audit actions while retaining the complete current list.
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS',
  'ASSIGN_ADMIN_ROLE','REMOVE_ADMIN_ROLE','ASSIGN_SUPER_ADMIN_ROLE','REMOVE_SUPER_ADMIN_ROLE',
  'UPDATE_FEATURE_ACCESS_POLICY','ADD_FEATURE_ACCESS_USER','REMOVE_FEATURE_ACCESS_USER',
  'REVIEW_CONTENT_REPORT',
  'TAKE_MODERATION_CASE','REASSIGN_MODERATION_CASE','ADD_CASE_INTERNAL_NOTE',
  'PROPOSE_INITIAL_CASE_DECISION','APPROVE_INITIAL_CASE_DECISION',
  'PROPOSE_CASE_APPEAL_DECISION','FINALIZE_CASE_APPEAL','REOPEN_MODERATION_CASE',
  'CREATE_SUBSCRIPTION_MANUAL_GRANT','REVOKE_SUBSCRIPTION_MANUAL_GRANT'
));

CREATE OR REPLACE FUNCTION public.effective_subscription_plan(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_rank integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RETURN 'free';
  END IF;

  SELECT GREATEST(
    v_rank,
    COALESCE((
      SELECT CASE s.plan
        WHEN 'pro' THEN 2
        ELSE 0
      END
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','trialing')
      LIMIT 1
    ), 0),
    COALESCE((
      SELECT max(CASE g.plan WHEN 'pro' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END)
      FROM public.subscription_manual_grants g
      WHERE g.user_id = _user_id
        AND g.starts_at <= v_now
        AND (g.expires_at IS NULL OR v_now < g.expires_at)
        AND g.revoked_at IS NULL
    ), 0)
  )
  INTO v_rank;

  RETURN CASE v_rank WHEN 2 THEN 'pro' WHEN 1 THEN 'plus' ELSE 'free' END;
END;
$$;

CREATE FUNCTION public._has_valid_account_state_internal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $pb015_account$
  SELECT _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.profile_private pp ON pp.user_id = u.id
      WHERE u.id = _user_id
        AND pp.is_banned = false
    );
$pb015_account$;

REVOKE ALL ON FUNCTION public._has_valid_account_state_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.effective_subscription_plan_rank(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE public.effective_subscription_plan(_user_id)
    WHEN 'pro' THEN 2
    WHEN 'plus' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_effective_plan()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'effectivePlan',
    public.effective_subscription_plan(auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.subscription_entitlement_detail(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.beta_account_eligible(v_actor) OR NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT public._has_valid_account_state_internal(_user_id) THEN
    RAISE EXCEPTION 'user not available';
  END IF;

  SELECT jsonb_build_object(
    'effectivePlan', public.effective_subscription_plan(_user_id),
    'stripe', COALESCE((
      SELECT jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        'currentPeriodEnd', s.current_period_end
      )
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
      LIMIT 1
    ), jsonb_build_object('plan','free','status','inactive','currentPeriodEnd',NULL)),
    'manualGrants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'plan', g.plan,
        'startsAt', g.starts_at,
        'expiresAt', g.expires_at,
        'reason', g.reason,
        'createdAt', g.created_at,
        'revokedAt', g.revoked_at,
        'revokeReason', g.revoke_reason,
        'active', (
          g.starts_at <= v_now
          AND (g.expires_at IS NULL OR v_now < g.expires_at)
          AND g.revoked_at IS NULL
        )
      ) ORDER BY g.created_at DESC, g.id DESC)
      FROM public.subscription_manual_grants g
      WHERE g.user_id = _user_id
    ), '[]'::jsonb),
    'audit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'createdAt', a.created_at,
        'grantId', a.details->>'grant_id',
        'plan', a.details->>'plan'
      ) ORDER BY a.created_at DESC, a.id DESC)
      FROM (
        SELECT id, action, created_at, details
        FROM public.admin_audit_log
        WHERE target_user_id = _user_id
          AND action IN ('CREATE_SUBSCRIPTION_MANUAL_GRANT','REVOKE_SUBSCRIPTION_MANUAL_GRANT')
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      ) a
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_manual_grant_create(
  _user_id uuid,
  _plan text,
  _expires_at timestamptz,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_reason text := btrim(COALESCE(_reason,''));
  v_grant public.subscription_manual_grants;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_pair(v_actor, _user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:subscription-entitlement:' || _user_id::text, 0));

  IF NOT public.beta_account_eligible(v_actor) OR NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT public.beta_account_eligible(_user_id) THEN
    RAISE EXCEPTION 'user not available';
  END IF;
  IF _plan NOT IN ('plus','pro') THEN RAISE EXCEPTION 'invalid plan'; END IF;
  IF char_length(v_reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid reason'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= v_now THEN RAISE EXCEPTION 'invalid expiry'; END IF;

  INSERT INTO public.subscription_manual_grants(
    user_id, plan, starts_at, expires_at, granted_by, reason
  ) VALUES (
    _user_id, _plan, v_now, _expires_at, v_actor, v_reason
  ) RETURNING * INTO v_grant;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,_user_id,'CREATE_SUBSCRIPTION_MANUAL_GRANT',jsonb_build_object(
    'grant_id',v_grant.id,
    'plan',v_grant.plan,
    'starts_at',v_grant.starts_at,
    'expires_at',v_grant.expires_at,
    'reason',v_grant.reason
  ));

  RETURN jsonb_build_object(
    'grantId', v_grant.id,
    'effectivePlan', public.effective_subscription_plan(_user_id),
    'startsAt', v_grant.starts_at,
    'expiresAt', v_grant.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_manual_grant_revoke(
  _grant_id uuid,
  _revoke_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_reason text := btrim(COALESCE(_revoke_reason,''));
  v_target uuid;
  v_grant public.subscription_manual_grants;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF char_length(v_reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid revoke reason'; END IF;

  -- Resolve the target internally, then take the same deterministic actor/target
  -- security lock order used by every privileged mutation. Do not pre-lock the
  -- actor separately: doing so can invert the pair order when target < actor.
  SELECT user_id INTO v_target
  FROM public.subscription_manual_grants
  WHERE id = _grant_id;

  IF v_target IS NULL THEN
    PERFORM public._lock_user_security_state(v_actor);
  ELSE
    PERFORM public._lock_user_security_pair(v_actor, v_target);
  END IF;

  -- Authority is proved only after the security lock(s), so stale UI/JWT state
  -- cannot authorize the mutation. Unauthorized callers still learn nothing
  -- about whether the supplied grant ID exists.
  IF NOT public.beta_account_eligible(v_actor) OR NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF v_target IS NULL THEN RAISE EXCEPTION 'grant not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:subscription-entitlement:' || v_target::text, 0));

  SELECT * INTO v_grant
  FROM public.subscription_manual_grants
  WHERE id = _grant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'grant not found'; END IF;

  IF v_grant.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'changed', false,
      'grantId', v_grant.id,
      'effectivePlan', public.effective_subscription_plan(v_grant.user_id)
    );
  END IF;

  UPDATE public.subscription_manual_grants
  SET revoked_at = v_now,
      revoked_by = v_actor,
      revoke_reason = v_reason
  WHERE id = _grant_id
  RETURNING * INTO v_grant;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,v_grant.user_id,'REVOKE_SUBSCRIPTION_MANUAL_GRANT',jsonb_build_object(
    'grant_id',v_grant.id,
    'plan',v_grant.plan,
    'starts_at',v_grant.starts_at,
    'expires_at',v_grant.expires_at,
    'revoke_reason',v_grant.revoke_reason
  ));

  RETURN jsonb_build_object(
    'changed', true,
    'grantId', v_grant.id,
    'effectivePlan', public.effective_subscription_plan(v_grant.user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_use_feature(_user_id uuid,_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mode text;
  v_stage text;
  v_plan_rank integer;
BEGIN
  IF _user_id IS NULL OR NOT public._has_valid_account_state_internal(_user_id) THEN
    RETURN false;
  END IF;

  -- Preserve Beta lifecycle semantics exactly. Only promoted/ordinary Feature
  -- Access policies continue into the six-mode policy evaluator below.
  SELECT stage INTO v_stage
  FROM public.beta_features
  WHERE feature_key = _feature_key;
  IF FOUND THEN
    IF NOT public.beta_account_eligible(_user_id) THEN RETURN false; END IF;
    IF v_stage IN ('stable','archived') THEN RETURN true; END IF;
    IF v_stage = 'beta' THEN RETURN public.beta_can_test(_user_id); END IF;
  END IF;

  SELECT access_mode INTO v_mode
  FROM public.feature_access_policies
  WHERE feature_key = _feature_key;

  IF v_mode IS NULL OR v_mode = 'disabled' THEN RETURN false; END IF;
  IF v_mode = 'everyone' THEN RETURN true; END IF;
  IF v_mode = 'admins_only' THEN RETURN public._is_admin_level_internal(_user_id); END IF;
  IF v_mode = 'selected_users' THEN
    RETURN EXISTS(
      SELECT 1 FROM public.feature_access_users
      WHERE feature_key = _feature_key AND user_id = _user_id
    );
  END IF;

  IF v_mode IN ('plus_or_pro','pro_only') THEN
    -- PB-015 paid modes must never bypass live ban/suspension/deletion state.
    -- Legacy four-mode semantics above remain unchanged.
    IF NOT public.beta_account_eligible(_user_id) THEN RETURN false; END IF;
    v_plan_rank := public.effective_subscription_plan_rank(_user_id);
    IF v_mode = 'plus_or_pro' THEN RETURN v_plan_rank >= 1; END IF;
    RETURN v_plan_rank >= 2;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_access_set_policy(_feature_key text,_access_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old text;
BEGIN
  IF EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key=_feature_key) THEN
    PERFORM public.beta_feature_access_mutate(_feature_key,'set_policy',_access_mode);
    RETURN;
  END IF;

  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) OR NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _access_mode NOT IN ('disabled','admins_only','selected_users','everyone','plus_or_pro','pro_only') THEN
    RAISE EXCEPTION 'invalid access mode';
  END IF;

  SELECT access_mode INTO v_old
  FROM public.feature_access_policies
  WHERE feature_key = _feature_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feature not found'; END IF;
  IF v_old = _access_mode THEN RETURN; END IF;

  UPDATE public.feature_access_policies
  SET access_mode = _access_mode, updated_at = statement_timestamp(), updated_by = v_actor
  WHERE feature_key = _feature_key;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(v_actor,NULL,'UPDATE_FEATURE_ACCESS_POLICY',jsonb_build_object(
    'feature_key',_feature_key,'previous_access_mode',v_old,'new_access_mode',_access_mode
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.beta_feature_access_mutate(
  _feature_key text,_operation text,_access_mode text DEFAULT NULL,_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changed boolean;
  v_old text;
  v_actor uuid := auth.uid();
BEGIN
  PERFORM public._lock_user_security_pair(auth.uid(),_user_id);
  PERFORM public.assert_beta_super_admin();
  PERFORM 1 FROM public.beta_features WHERE feature_key=_feature_key AND stage='feature_access' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Feature is not managed by Feature Access'; END IF;

  IF _operation='set_policy' THEN
    IF _access_mode IS NULL OR _access_mode NOT IN ('disabled','admins_only','selected_users','everyone','plus_or_pro','pro_only') THEN
      RAISE EXCEPTION 'Invalid access mode';
    END IF;
    SELECT access_mode INTO v_old FROM public.feature_access_policies WHERE feature_key=_feature_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Feature not found'; END IF;
    IF v_old=_access_mode THEN RETURN false; END IF;
    UPDATE public.feature_access_policies
      SET access_mode=_access_mode,updated_at=statement_timestamp(),updated_by=v_actor
      WHERE feature_key=_feature_key;
    INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
      VALUES(v_actor,NULL,'UPDATE_FEATURE_ACCESS_POLICY',jsonb_build_object(
        'feature_key',_feature_key,'previous_access_mode',v_old,'new_access_mode',_access_mode));
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
    IF _user_id IS NULL OR NOT public.beta_account_eligible(_user_id) THEN
      RAISE EXCEPTION 'Account is unavailable';
    END IF;
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

CREATE OR REPLACE FUNCTION public.admit_feature_ai_dispatch_internal(
  _user_id uuid,
  _feature_keys text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keys text[];
  v_key text;
  v_expected integer;
  v_found integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Fresh AI policy transaction required' USING ERRCODE='40001';
  END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'AI user required'; END IF;

  SELECT array_agg(DISTINCT btrim(k) ORDER BY btrim(k))
  INTO v_keys
  FROM unnest(COALESCE(_feature_keys, ARRAY[]::text[])) AS k
  WHERE k IS NOT NULL AND btrim(k) <> '';

  v_expected := COALESCE(array_length(v_keys,1),0);
  IF v_expected < 1 OR v_expected > 8 THEN RAISE EXCEPTION 'Invalid AI feature set'; END IF;

  PERFORM public._lock_user_security_state(_user_id);
  IF NOT public.beta_account_eligible(_user_id) THEN
    RAISE EXCEPTION 'Feature not available';
  END IF;

  SELECT count(*) INTO v_found
  FROM (
    SELECT p.feature_key
    FROM public.feature_access_policies p
    WHERE p.feature_key = ANY(v_keys)
    ORDER BY p.feature_key
    FOR SHARE
  ) locked;
  IF v_found <> v_expected THEN RAISE EXCEPTION 'Feature not available'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:subscription-entitlement:' || _user_id::text, 0));
  PERFORM 1 FROM public.subscriptions WHERE user_id = _user_id FOR SHARE;
  PERFORM 1
  FROM public.subscription_manual_grants
  WHERE user_id = _user_id
  ORDER BY id
  FOR SHARE;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT public.can_use_feature(_user_id, v_key) THEN
      RAISE EXCEPTION 'Feature not available';
    END IF;
  END LOOP;

  PERFORM public.admit_global_ai_dispatch_internal();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.effective_subscription_plan(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.effective_subscription_plan_rank(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.current_user_effective_plan() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.subscription_entitlement_detail(uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.subscription_manual_grant_create(uuid,text,timestamptz,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.subscription_manual_grant_revoke(uuid,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.admit_feature_ai_dispatch_internal(uuid,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.can_use_feature(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.feature_access_set_policy(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.beta_feature_access_mutate(text,text,text,uuid) FROM PUBLIC,anon,service_role;

GRANT EXECUTE ON FUNCTION public.effective_subscription_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.effective_subscription_plan_rank(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_effective_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_entitlement_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_manual_grant_create(uuid,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_manual_grant_revoke(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admit_feature_ai_dispatch_internal(uuid,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.feature_access_set_policy(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.beta_feature_access_mutate(text,text,text,uuid) TO authenticated;

COMMIT;
