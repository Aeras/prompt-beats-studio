-- FINAL-008: make provider-start/finalization transitions server-authoritative.
--
-- Client-authenticated callers may still claim/read their own durable work, but
-- only the service role may mark provider execution or finalize/fail results.

BEGIN;

-- ---------------------------------------------------------------------------
-- Auxiliary AI durable requests
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_auxiliary_ai_provider_started_internal(
  _user_id uuid,
  _operation text,
  _request_key uuid,
  _execution_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  UPDATE public.ai_auxiliary_requests
  SET provider_started_at = now(), updated_at = now()
  WHERE user_id = _user_id
    AND operation = _operation
    AND request_key = _request_key
    AND status = 'processing'
    AND execution_token = _execution_token
    AND provider_started_at IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_auxiliary_ai_request_internal(
  _user_id uuid,
  _operation text,
  _request_key uuid,
  _execution_token uuid,
  _result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  UPDATE public.ai_auxiliary_requests
  SET status = 'completed',
      result = _result,
      error = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE user_id = _user_id
    AND operation = _operation
    AND request_key = _request_key
    AND execution_token = _execution_token
    AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'auxiliary AI request claim lost';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_auxiliary_ai_request_internal(
  _user_id uuid,
  _operation text,
  _request_key uuid,
  _execution_token uuid,
  _error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  UPDATE public.ai_auxiliary_requests
  SET status = 'failed',
      error = left(COALESCE(_error, 'AI request failed'), 500),
      updated_at = now()
  WHERE user_id = _user_id
    AND operation = _operation
    AND request_key = _request_key
    AND execution_token = _execution_token
    AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_auxiliary_ai_provider_started(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_auxiliary_ai_request(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_auxiliary_ai_request(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_auxiliary_ai_provider_started_internal(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_auxiliary_ai_request_internal(uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_auxiliary_ai_request_internal(uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_auxiliary_ai_provider_started_internal(uuid, text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_auxiliary_ai_request_internal(uuid, text, uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_auxiliary_ai_request_internal(uuid, text, uuid, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Quality Check durable actions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_quality_check_provider_started_internal(
  _user_id uuid,
  _idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;
  IF NOT public.has_valid_account_state(_user_id) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  PERFORM public._lock_user_security_state(_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  UPDATE public.ai_quality_check_actions
  SET provider_started_at = now(), updated_at = now()
  WHERE user_id = _user_id
    AND idempotency_key = _idempotency_key
    AND status = 'processing'
    AND provider_started_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality check is no longer claimable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_quality_check_internal(
  _user_id uuid,
  _idempotency_key uuid,
  _quality_report jsonb,
  _provider text,
  _model text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_action public.ai_quality_check_actions;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;
  IF NOT public.has_valid_account_state(_user_id) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;
  IF COALESCE(trim(_provider), '') = '' OR COALESCE(trim(_model), '') = '' THEN
    RAISE EXCEPTION 'quality check model metadata is required';
  END IF;

  PERFORM public._lock_user_security_state(_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = _user_id
    AND idempotency_key = _idempotency_key
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
  WHERE user_id = _user_id
    AND quality_check_key = _idempotency_key;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'completed',
        quality_report = _quality_report,
        consumed_generation_id = v_id,
        provider = _provider,
        model = _model,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ai_generations (user_id, quality_check_key)
  VALUES (_user_id, _idempotency_key)
  RETURNING id INTO v_id;

  UPDATE public.ai_quality_check_actions
  SET status = 'completed',
      quality_report = _quality_report,
      consumed_generation_id = v_id,
      provider = _provider,
      model = _model,
      updated_at = now()
  WHERE id = v_action.id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_quality_check_internal(
  _user_id uuid,
  _idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  PERFORM public._lock_user_security_state(_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  UPDATE public.ai_quality_check_actions
  SET status = 'failed', updated_at = now()
  WHERE user_id = _user_id
    AND idempotency_key = _idempotency_key
    AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_quality_check_provider_started(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_quality_check(uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_quality_check(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_quality_check_provider_started_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_quality_check_internal(uuid, uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_quality_check_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_quality_check_provider_started_internal(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_quality_check_internal(uuid, uuid, jsonb, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_quality_check_internal(uuid, uuid)
  TO service_role;

COMMIT;
