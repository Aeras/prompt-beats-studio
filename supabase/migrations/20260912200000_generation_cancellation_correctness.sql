-- Pending cancellation is terminal; processing work is only hidden from recovery.
BEGIN;

ALTER TABLE public.ai_generation_jobs
  DROP CONSTRAINT ai_generation_jobs_status_check;
ALTER TABLE public.ai_generation_jobs
  ADD CONSTRAINT ai_generation_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- The old return type is void. PostgreSQL requires replacement rather than
-- CREATE OR REPLACE to change it to text. Existing callers may ignore the result.
DROP FUNCTION public.dismiss_generation_job(uuid);
CREATE FUNCTION public.dismiss_generation_job(_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Match account/security lock ordering before taking the resource row lock.
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  -- Serializes dismissal against the runner's conditional pending claim and
  -- against other dismissals. Read the status only after acquiring the lock.
  SELECT status INTO v_status
  FROM public.ai_generation_jobs
  WHERE id = _job_id AND user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'generation job is not available'; END IF;

  UPDATE public.ai_generation_jobs
  SET dismissed_at = COALESCE(dismissed_at, now()),
      status = CASE WHEN v_status = 'pending' THEN 'cancelled' ELSE v_status END
  WHERE id = _job_id AND user_id = v_user;

  -- No accounting rows or provider-execution metadata are changed.
  RETURN CASE
    WHEN v_status = 'pending' THEN 'CANCELLED'
    WHEN v_status = 'processing' THEN 'DISMISSED'
    ELSE 'ALREADY_FINAL'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_generation_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_generation_job(uuid) TO authenticated;

COMMIT;
