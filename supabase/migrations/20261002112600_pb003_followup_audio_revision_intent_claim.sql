BEGIN;

CREATE OR REPLACE FUNCTION public.claim_auxiliary_ai_request(_operation text, _request_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_request public.ai_auxiliary_requests;
  v_used integer;
  v_token uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN (
    'song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe',
    'audio_revision_intent'
  ) THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;

  IF _operation = 'audio_revision_intent' THEN
    PERFORM public.cleanup_audio_revision_intent_ai_results_internal();
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('aux-ai-request:' || v_user::text || ':' || _operation || ':' || _request_key::text, 0)
  );

  SELECT * INTO v_request
  FROM public.ai_auxiliary_requests
  WHERE user_id = v_user
    AND operation = _operation
    AND request_key = _request_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.status = 'completed' THEN
      IF _operation = 'audio_revision_intent' AND v_request.result IS NULL THEN
        RETURN jsonb_build_object(
          'status','failed',
          'error','AI proposal expired; start a new request.'
        );
      END IF;
      RETURN jsonb_build_object('status','completed','result',v_request.result);
    END IF;

    IF v_request.status = 'processing'
      AND (
        v_request.provider_started_at IS NOT NULL
        OR v_request.updated_at > now() - interval '15 minutes'
      ) THEN
      RETURN jsonb_build_object('status','processing');
    END IF;

    IF v_request.status = 'failed' AND v_request.provider_started_at IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status','failed',
        'error',COALESCE(v_request.error,'AI request failed')
      );
    END IF;

    v_token := gen_random_uuid();
    UPDATE public.ai_auxiliary_requests
    SET status = 'processing',
        execution_token = v_token,
        error = NULL,
        updated_at = now()
    WHERE id = v_request.id;
    RETURN jsonb_build_object('status','claimed','executionToken',v_token);
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('aux-ai-hour:' || v_user::text || ':' || _operation, 0)
  );

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_auxiliary_admissions
    WHERE user_id = v_user
      AND operation = _operation
      AND created_at > now() - interval '1 hour';
    IF v_used >= 10 THEN
      RETURN jsonb_build_object('status','rate_limited');
    END IF;
  END IF;

  INSERT INTO public.ai_auxiliary_admissions(user_id, operation)
  VALUES(v_user, _operation);
  DELETE FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user
    AND created_at < now() - interval '7 days';

  v_token := gen_random_uuid();
  INSERT INTO public.ai_auxiliary_requests(
    user_id,
    operation,
    request_key,
    status,
    execution_token
  ) VALUES (
    v_user,
    _operation,
    _request_key,
    'processing',
    v_token
  );

  RETURN jsonb_build_object('status','claimed','executionToken',v_token);
END;
$$;

COMMIT;
