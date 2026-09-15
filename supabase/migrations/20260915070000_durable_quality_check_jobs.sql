-- Durable Quality Check jobs.
--
-- A Quality Check is admitted by the authenticated browser, persisted first,
-- and then executed by the existing database-triggered runner. The provider
-- request is therefore independent of the browser connection, just like song
-- generation. A creation is consumed only after a valid QC report has been
-- persisted and finalized.

BEGIN;

ALTER TABLE public.ai_quality_check_actions
  DROP CONSTRAINT IF EXISTS ai_quality_check_actions_status_check;

ALTER TABLE public.ai_quality_check_actions
  ADD CONSTRAINT ai_quality_check_actions_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE public.ai_quality_check_actions
  ADD COLUMN IF NOT EXISTS input_payload jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS ai_quality_check_actions_recovery_idx
  ON public.ai_quality_check_actions(user_id, created_at DESC)
  WHERE status IN ('pending', 'processing', 'completed');

-- Uses the same private runner URL/token as durable song generation.
CREATE OR REPLACE FUNCTION public.kick_quality_check_runner(_action_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
BEGIN
  SELECT value #>> '{}' INTO v_url FROM public.app_settings WHERE key = 'runner_url';
  SELECT value #>> '{}' INTO v_token FROM public.app_settings WHERE key = 'runner_token';
  IF v_url IS NULL OR v_token IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', v_token),
    body := jsonb_build_object('qualityActionId', _action_id),
    timeout_milliseconds := 170000
  );
EXCEPTION WHEN OTHERS THEN
  -- The runner sweep is the recovery backstop; admission must stay atomic even
  -- when the immediate network signal cannot be delivered.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_quality_check_runner(uuid)
  FROM PUBLIC, anon, authenticated;

-- Browser-facing admission. The payload has already passed the application
-- Zod schema; the worker validates it again before any provider call.
CREATE OR REPLACE FUNCTION public.start_quality_check_job(
  _idempotency_key uuid,
  _input jsonb
)
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
  v_generation_key text := NULLIF(_input ->> 'generationId', '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Match the account-first authorization discipline used by generation jobs.
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;
  IF _input IS NULL OR jsonb_typeof(_input) <> 'object' THEN
    RAISE EXCEPTION 'invalid quality check input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user AND idempotency_key = _idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId', v_action.id,
      'status', v_action.status,
      'qualityReport', v_action.quality_report,
      'provider', v_action.provider,
      'model', v_action.model,
      'error', v_action.error,
      'createdAt', v_action.created_at
    );
  END IF;

  -- A lost start response or a second tab must not create a second provider
  -- call for the same originating song while one is already active.
  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user
    AND status IN ('pending', 'processing')
    AND (
      (v_generation_key IS NULL AND COALESCE(input_payload ->> 'generationId', '') = '')
      OR input_payload ->> 'generationId' = v_generation_key
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId', v_action.id,
      'status', v_action.status,
      'qualityReport', v_action.quality_report,
      'provider', v_action.provider,
      'model', v_action.model,
      'error', v_action.error,
      'createdAt', v_action.created_at
    );
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id = v_user AND created_at > now() - interval '1 hour';

    -- Every unfinalized QC is a reserved provider action. Do not age these out
    -- automatically: provider-started work may still be billable and must be
    -- explicitly reconciled before it can be bypassed.
    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id = v_user
      AND status IN ('pending', 'processing');

    IF v_used + v_reserved >= 10 THEN
      RETURN jsonb_build_object('rate_limited', true);
    END IF;
  END IF;

  INSERT INTO public.ai_quality_check_actions (
    user_id,
    idempotency_key,
    status,
    input_payload,
    quality_report,
    consumed_generation_id,
    provider_started_at,
    provider,
    model,
    error,
    started_at,
    completed_at,
    updated_at
  )
  VALUES (
    v_user,
    _idempotency_key,
    'pending',
    _input,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    now()
  )
  RETURNING * INTO v_action;

  PERFORM public.kick_quality_check_runner(v_action.id);

  RETURN jsonb_build_object(
    'actionId', v_action.id,
    'status', v_action.status,
    'qualityReport', NULL,
    'provider', NULL,
    'model', NULL,
    'error', NULL,
    'createdAt', v_action.created_at
  );
END;
$$;

-- Safe authenticated status reads. The QC table itself remains inaccessible to
-- browser roles; these functions expose only the caller's own action state.
CREATE OR REPLACE FUNCTION public.get_quality_check_job(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_action public.ai_quality_check_actions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE id = _action_id AND user_id = v_user;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'actionId', v_action.id,
    'status', v_action.status,
    'qualityReport', v_action.quality_report,
    'provider', v_action.provider,
    'model', v_action.model,
    'error', v_action.error,
    'createdAt', v_action.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_latest_quality_check_job(_generation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_action public.ai_quality_check_actions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id = v_user
    AND status IN ('pending', 'processing', 'completed')
    AND created_at > now() - interval '30 minutes'
    AND (
      (_generation_id IS NULL AND COALESCE(input_payload ->> 'generationId', '') = '')
      OR input_payload ->> 'generationId' = _generation_id::text
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'actionId', v_action.id,
    'status', v_action.status,
    'qualityReport', v_action.quality_report,
    'provider', v_action.provider,
    'model', v_action.model,
    'error', v_action.error,
    'createdAt', v_action.created_at
  );
END;
$$;

-- Service-only finalization. The provider result is persisted on the action row
-- first; if this transaction ever fails, the runner can retry only this
-- finalization step without making a second provider request.
CREATE OR REPLACE FUNCTION public.finalize_quality_check_job(_action_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_quality_check_actions;
  v_generation_id uuid;
BEGIN
  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE id = _action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quality check action not found';
  END IF;

  IF v_action.status = 'completed' AND v_action.consumed_generation_id IS NOT NULL THEN
    RETURN v_action.consumed_generation_id;
  END IF;

  IF v_action.status <> 'processing' THEN
    RAISE EXCEPTION 'quality check action is not processing';
  END IF;
  IF v_action.provider_started_at IS NULL THEN
    RAISE EXCEPTION 'quality check provider was not started';
  END IF;
  IF v_action.quality_report IS NULL
     OR COALESCE(trim(v_action.provider), '') = ''
     OR COALESCE(trim(v_action.model), '') = '' THEN
    RAISE EXCEPTION 'quality check result is incomplete';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_action.user_id::text, 0));

  SELECT id INTO v_generation_id
  FROM public.ai_generations
  WHERE user_id = v_action.user_id
    AND quality_check_key = v_action.idempotency_key;

  IF NOT FOUND THEN
    INSERT INTO public.ai_generations(user_id, quality_check_key)
    VALUES (v_action.user_id, v_action.idempotency_key)
    RETURNING id INTO v_generation_id;
  END IF;

  UPDATE public.ai_quality_check_actions
  SET status = 'completed',
      consumed_generation_id = v_generation_id,
      error = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_action.id;

  RETURN v_generation_id;
END;
$$;

-- Preserve the current hardened generation admission logic verbatim, changing
-- only the QC reservation predicate so new pending durable checks are counted.
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
    WHERE user_id = v_user AND status IN ('pending', 'processing');

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

-- Keep the legacy synchronous QC endpoint safe for already-loaded/cached
-- clients during rollout: pending durable QC actions count as reservations too.
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
      'qualityReport', v_action.quality_report,
      'provider', v_action.provider,
      'model', v_action.model
    );
  END IF;

  IF FOUND AND v_action.status = 'failed' AND v_action.provider_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;

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
    WHERE user_id = v_user
      AND status IN ('pending', 'processing')
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
        provider = NULL,
        model = NULL,
        updated_at = now()
    WHERE id = v_action.id;
    RETURN jsonb_build_object('status', 'claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions (user_id, idempotency_key, status)
  VALUES (v_user, _idempotency_key, 'processing');
  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

REVOKE ALL ON FUNCTION public.start_quality_check_job(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quality_check_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_latest_quality_check_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_quality_check_job(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_quality_check_job(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quality_check_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_quality_check_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_quality_check_job(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.start_generation_job(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_generation_job(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_quality_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quality_check(uuid) TO authenticated;

COMMIT;
