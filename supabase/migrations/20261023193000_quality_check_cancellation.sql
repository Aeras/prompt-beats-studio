-- Durable Quality Check cancellation: owner-authorized request, no retries or
-- fictitious confirmation of upstream savings. Existing QC completion must be
-- fenced under its row lock against any recorded cancellation request.
BEGIN;

ALTER TABLE public.ai_quality_check_actions
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_outcome text;

ALTER TABLE public.ai_quality_check_actions
  DROP CONSTRAINT IF EXISTS ai_quality_check_actions_status_check;
ALTER TABLE public.ai_quality_check_actions
  ADD CONSTRAINT ai_quality_check_actions_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

CREATE FUNCTION public.request_quality_check_cancellation(_action_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
  v_requested timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;
  SELECT status, cancel_requested_at INTO v_status, v_requested
  FROM public.ai_quality_check_actions
  WHERE id = _action_id AND user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality check action is not available'; END IF;
  IF v_status IN ('completed', 'failed', 'cancelled') THEN RETURN 'ALREADY_FINAL'; END IF;
  IF v_requested IS NOT NULL THEN RETURN 'ALREADY_REQUESTED'; END IF;

  IF v_status = 'pending' THEN
    UPDATE public.ai_quality_check_actions
    SET status = 'cancelled',
        cancel_requested_at = now(),
        cancellation_outcome = 'cancelled_before_start',
        completed_at = now(),
        updated_at = now()
    WHERE id = _action_id AND user_id = v_user;
    RETURN 'CANCELLED_BEFORE_START';
  END IF;

  UPDATE public.ai_quality_check_actions
  SET cancel_requested_at = now(), updated_at = now()
  WHERE id = _action_id AND user_id = v_user;
  RETURN 'REQUESTED';
END;
$$;

REVOKE ALL ON FUNCTION public.request_quality_check_cancellation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_quality_check_cancellation(uuid)
  TO authenticated;

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
    'createdAt', v_action.created_at,
    'cancelRequestedAt', v_action.cancel_requested_at,
    'cancellationOutcome', v_action.cancellation_outcome
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
    'createdAt', v_action.created_at,
    'cancelRequestedAt', v_action.cancel_requested_at,
    'cancellationOutcome', v_action.cancellation_outcome
  );
END;
$$;

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

  IF v_action.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'quality check cancellation was requested';
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

COMMIT;
