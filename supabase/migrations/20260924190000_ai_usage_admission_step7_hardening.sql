-- Step 7 hardening: cost-admission, AI Music Lab accounting support, and
-- durable recovery for usage analytics. No user-facing credit price changes.
BEGIN;

-- A failed analytics insert must not permanently erase provider cost evidence.
CREATE TABLE IF NOT EXISTS public.ai_usage_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_outbox_retry_idx
  ON public.ai_usage_outbox(next_attempt_at, created_at);

ALTER TABLE public.ai_usage_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.flush_ai_usage_outbox(_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_row record;
  v_flushed integer := 0;
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
BEGIN
  FOR v_row IN
    SELECT id, payload, attempts
    FROM public.ai_usage_outbox
    WHERE next_attempt_at <= now()
    ORDER BY created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.ai_usage_logs(
        user_id,
        generation_id,
        provider,
        model,
        operation,
        input_tokens,
        output_tokens,
        total_tokens,
        cached_input_tokens,
        cache_write_tokens,
        success
      ) VALUES (
        NULLIF(v_row.payload->>'user_id', '')::uuid,
        NULLIF(v_row.payload->>'generation_id', '')::uuid,
        v_row.payload->>'provider',
        v_row.payload->>'model',
        v_row.payload->>'operation',
        NULLIF(v_row.payload->>'input_tokens', '')::integer,
        NULLIF(v_row.payload->>'output_tokens', '')::integer,
        NULLIF(v_row.payload->>'total_tokens', '')::integer,
        NULLIF(v_row.payload->>'cached_input_tokens', '')::integer,
        NULLIF(v_row.payload->>'cache_write_tokens', '')::integer,
        COALESCE((v_row.payload->>'success')::boolean, false)
      );

      DELETE FROM public.ai_usage_outbox WHERE id = v_row.id;
      v_flushed := v_flushed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ai_usage_outbox
      SET attempts = attempts + 1,
          last_error = SQLERRM,
          next_attempt_at = now() + make_interval(secs => LEAST(3600, 30 * (attempts + 1))),
          updated_at = now()
      WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN v_flushed;
END;
$$;

REVOKE ALL ON FUNCTION public.flush_ai_usage_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_ai_usage_outbox(integer) TO service_role;

-- Auxiliary AI already has atomic per-user admission. Add a very small burst
-- de-duplication window so double taps / immediate transport retries cannot
-- launch two expensive provider calls back-to-back. Admins remain exempt from
-- the hourly quota, but are also protected from accidental duplicate requests.
CREATE OR REPLACE FUNCTION public.admit_auxiliary_ai_request(
  _operation text,
  _limit_per_hour integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN ('song_setup_assistant','ai_music_lab','song_analyzer','inspiration_wall','story_map','song_universe') THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;
  IF _limit_per_hour < 1 OR _limit_per_hour > 100 THEN RAISE EXCEPTION 'invalid AI rate limit'; END IF;

  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai:' || v_user::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.ai_auxiliary_admissions
    WHERE user_id = v_user
      AND operation = _operation
      AND created_at > now() - interval '15 seconds'
  ) THEN
    RETURN false;
  END IF;

  IF public._is_admin_level_internal(v_user) THEN
    INSERT INTO public.ai_auxiliary_admissions(user_id, operation) VALUES (v_user, _operation);
    DELETE FROM public.ai_auxiliary_admissions
      WHERE user_id = v_user AND created_at < now() - interval '7 days';
    RETURN true;
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user
    AND operation = _operation
    AND created_at > now() - interval '1 hour';

  IF v_used >= _limit_per_hour THEN RETURN false; END IF;

  INSERT INTO public.ai_auxiliary_admissions(user_id, operation) VALUES (v_user, _operation);
  DELETE FROM public.ai_auxiliary_admissions
    WHERE user_id = v_user AND created_at < now() - interval '7 days';
  RETURN true;
END;
$$;

-- Quality Check user credits remain success-only, but provider attempts that
-- really started and then failed must still count toward cost-admission. This
-- closes the gap where repeated failing calls could otherwise bypass the
-- shared hourly anti-abuse budget.
CREATE OR REPLACE FUNCTION public.start_quality_check_job(_idempotency_key uuid, _input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
  v_failed_started integer;
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

  IF NOT public.can_use_feature(v_user,'quality_check') THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id=v_user AND created_at>now()-interval '1 hour';

    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user AND status IN('pending','processing');

    SELECT count(*)::integer INTO v_failed_started
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user
      AND status='failed'
      AND provider_started_at>now()-interval '1 hour';

    IF v_used+v_reserved+v_failed_started>=10 THEN
      RETURN jsonb_build_object('rate_limited',true);
    END IF;
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

CREATE OR REPLACE FUNCTION public.claim_quality_check(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
  v_failed_started integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND idempotency_key=_idempotency_key
  FOR UPDATE;

  IF FOUND AND v_action.status='completed' THEN
    RETURN jsonb_build_object('status','completed','qualityReport',v_action.quality_report,'provider',v_action.provider,'model',v_action.model);
  END IF;
  IF FOUND AND v_action.status='failed' AND v_action.provider_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','failed');
  END IF;
  IF FOUND AND v_action.status='processing'
     AND (v_action.provider_started_at IS NOT NULL OR v_action.updated_at>now()-interval '15 minutes')
  THEN
    RETURN jsonb_build_object('status','processing');
  END IF;

  IF NOT public.can_use_feature(v_user,'quality_check') THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id=v_user AND created_at>now()-interval '1 hour';

    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user
      AND status IN('pending','processing')
      AND (v_action.id IS NULL OR id<>v_action.id);

    SELECT count(*)::integer INTO v_failed_started
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user
      AND status='failed'
      AND provider_started_at>now()-interval '1 hour';

    IF v_used+v_reserved+v_failed_started>=10 THEN
      RETURN jsonb_build_object('status','rate_limited');
    END IF;
  END IF;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status='processing',quality_report=NULL,consumed_generation_id=NULL,
        provider_started_at=NULL,provider=NULL,model=NULL,updated_at=now()
    WHERE id=v_action.id;
    RETURN jsonb_build_object('status','claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions(user_id,idempotency_key,status)
  VALUES(v_user,_idempotency_key,'processing');
  RETURN jsonb_build_object('status','claimed');
END;
$$;

COMMIT;
