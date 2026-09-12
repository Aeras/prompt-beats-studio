-- AI cost-admission hardening.
-- Generation jobs and Quality Checks reserve admission before any provider call.

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
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

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

-- Mark the point after which a processing job may have an in-flight provider
-- request. Only pre-provider claims are safe to reclaim.
ALTER TABLE public.ai_generation_jobs
  ADD COLUMN IF NOT EXISTS provider_started_at timestamptz;

-- Any pre-existing processing job may already have reached a provider before
-- this migration. Treat it as started rather than risk a duplicate call.
UPDATE public.ai_generation_jobs
SET provider_started_at = COALESCE(started_at, updated_at, now())
WHERE status = 'processing' AND provider_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.sweep_generation_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_count integer := 0;
BEGIN
  -- Only a processing claim that never reached the provider is reclaimable.
  UPDATE public.ai_generation_jobs
  SET status = 'failed',
      error = 'The generation could not be started. Please try again.',
      completed_at = now()
  WHERE status = 'processing'
    AND provider_started_at IS NULL
    AND started_at < now() - interval '15 minutes';

  FOR v_job IN
    SELECT id FROM public.ai_generation_jobs
    WHERE status = 'pending'
      AND dismissed_at IS NULL
      AND created_at > now() - interval '30 minutes'
    ORDER BY created_at
    LIMIT 10
  LOOP
    PERFORM public.kick_generation_runner(v_job.id);
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ai_generation_jobs
  SET status = 'failed',
      error = 'The generation could not be started. Please try again.',
      completed_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '30 minutes';

  RETURN v_count;
END;
$$;

ALTER TABLE public.ai_quality_check_actions
  ADD COLUMN IF NOT EXISTS provider_started_at timestamptz;

-- Any pre-existing processing claim may already have reached a provider before
-- this migration. Treat it as started rather than risk a duplicate call.
UPDATE public.ai_quality_check_actions
SET provider_started_at = COALESCE(updated_at, created_at, now())
WHERE status = 'processing' AND provider_started_at IS NULL;

-- Provider-committed work is ambiguous: it may have been accepted by the
-- external provider. This function is deliberately operational and service
-- role-only. The caller must first establish that the worker which owned the
-- job/action has been terminated or fenced; SQL cannot fence an already-paused
-- process from a later external network call.
CREATE OR REPLACE FUNCTION public.reconcile_provider_committed_generation(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  UPDATE public.ai_generation_jobs
  SET status = 'failed',
      error = 'The provider result requires operational reconciliation.',
      completed_at = now()
  WHERE id = _job_id
    AND status = 'processing'
    AND provider_started_at IS NOT NULL
    AND provider_started_at < now() - interval '45 minutes'
  RETURNING true INTO v_changed;
  RETURN COALESCE(v_changed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_provider_committed_quality(_action_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  UPDATE public.ai_quality_check_actions
  SET status = 'failed', updated_at = now()
  WHERE id = _action_id
    AND status = 'processing'
    AND provider_started_at IS NOT NULL
    AND provider_started_at < now() - interval '45 minutes'
  RETURNING true INTO v_changed;
  RETURN COALESCE(v_changed, false);
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

REVOKE ALL ON FUNCTION public.reconcile_provider_committed_generation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_provider_committed_quality(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_provider_committed_generation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_provider_committed_quality(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.start_generation_job(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_generation_job(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.sweep_generation_jobs() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_quality_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_quality_check_provider_started(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_quality_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_quality_check(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quality_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_quality_check_provider_started(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_quality_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quality_check(uuid, jsonb) TO authenticated;
