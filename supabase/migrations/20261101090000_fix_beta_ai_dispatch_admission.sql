-- PB-015 follow-up: preserve Beta feature lifecycle in atomic AI dispatch admission.
-- Forward-only, no production policy mutation. Execute only after reviewed approval.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.admit_feature_ai_dispatch_internal(
  _user_id uuid, _feature_keys text[]
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  SELECT array_agg(DISTINCT btrim(k) ORDER BY btrim(k)) INTO v_keys
  FROM unnest(COALESCE(_feature_keys, ARRAY[]::text[])) k
  WHERE k IS NOT NULL AND btrim(k) <> '';
  v_expected := COALESCE(array_length(v_keys, 1), 0);
  IF v_expected < 1 OR v_expected > 8 THEN RAISE EXCEPTION 'Invalid AI feature set'; END IF;

  PERFORM public._lock_user_security_state(_user_id);
  IF NOT public.beta_account_eligible(_user_id) THEN
    RAISE EXCEPTION 'Feature not available';
  END IF;

  -- Lock both valid policy authorities before checking live entitlements.
  -- A Beta-only key must not require an extra legacy Feature Access row.
  SELECT count(*) INTO v_found
  FROM (
    SELECT feature_key FROM public.feature_access_policies
    WHERE feature_key = ANY(v_keys)
    ORDER BY feature_key FOR SHARE
  ) policies;
  -- Retain the existing locks until transaction completion.
  PERFORM 1 FROM public.beta_features
  WHERE feature_key = ANY(v_keys)
  ORDER BY feature_key FOR SHARE;

  SELECT count(*) INTO v_found FROM (
    SELECT unnest(v_keys) AS feature_key
  ) keys
  WHERE EXISTS (
    SELECT 1 FROM public.feature_access_policies p WHERE p.feature_key = keys.feature_key
  ) OR EXISTS (
    SELECT 1 FROM public.beta_features b WHERE b.feature_key = keys.feature_key
  );
  IF v_found <> v_expected THEN RAISE EXCEPTION 'Feature not available'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('promptbeats:subscription-entitlement:' || _user_id::text, 0));
  PERFORM 1 FROM public.subscriptions WHERE user_id = _user_id FOR SHARE;
  PERFORM 1 FROM public.subscription_manual_grants
  WHERE user_id = _user_id ORDER BY id FOR SHARE;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF EXISTS (
      SELECT 1 FROM public.beta_features
      WHERE feature_key = v_key AND stage = 'archived'
    ) OR NOT public.can_use_feature(_user_id, v_key) THEN
      RAISE EXCEPTION 'Feature not available';
    END IF;
  END LOOP;
  PERFORM public.admit_global_ai_dispatch_internal();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_feature_ai_dispatch_internal(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_feature_ai_dispatch_internal(uuid,text[]) TO service_role;
COMMIT;
