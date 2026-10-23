-- Durable user-requested cancellation for AI generation jobs.
-- Dismissal remains a separate operation and retains its existing semantics.
BEGIN;

ALTER TABLE public.ai_generation_jobs
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_outcome text;

ALTER TABLE public.ai_generation_jobs
  ADD CONSTRAINT ai_generation_jobs_cancellation_outcome_check
  CHECK (cancellation_outcome IS NULL OR cancellation_outcome IN (
    'cancelled_before_start',
    'connection_aborted_unconfirmed',
    'cancelled_upstream_confirmed',
    'cancel_failed',
    'already_completed'
  ));

CREATE FUNCTION public.request_generation_job_cancellation(_job_id uuid)
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
  FROM public.ai_generation_jobs
  WHERE id = _job_id AND user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'generation job is not available'; END IF;
  IF v_status IN ('completed','failed','cancelled') THEN RETURN 'ALREADY_FINAL'; END IF;
  IF v_requested IS NOT NULL THEN RETURN 'ALREADY_REQUESTED'; END IF;

  IF v_status = 'pending' THEN
    UPDATE public.ai_generation_jobs
    SET status = 'cancelled',
        cancel_requested_at = now(),
        cancellation_outcome = 'cancelled_before_start',
        completed_at = now()
    WHERE id = _job_id AND user_id = v_user;
    RETURN 'CANCELLED_BEFORE_START';
  END IF;

  -- Processing remains processing until the worker observes the request.
  -- A database write alone cannot stop a remote provider.
  UPDATE public.ai_generation_jobs
  SET cancel_requested_at = now()
  WHERE id = _job_id AND user_id = v_user;
  RETURN 'REQUESTED';
END;
$$;

REVOKE ALL ON FUNCTION public.request_generation_job_cancellation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_generation_job_cancellation(uuid)
  TO authenticated;

COMMIT;
