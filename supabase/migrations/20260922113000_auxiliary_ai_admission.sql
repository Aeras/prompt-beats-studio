-- Durable admission for immediate/auxiliary AI operations that do not use the
-- Generator or Quality Check job tables. Count admitted attempts, not only
-- successful provider calls, so provider failures cannot be abused to bypass
-- cost protection. Admin-level accounts keep the existing unrestricted test
-- behavior.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_auxiliary_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN (
    'song_setup_assistant',
    'ai_music_lab',
    'song_analyzer'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_auxiliary_admissions_user_operation_created_idx
  ON public.ai_auxiliary_admissions(user_id, operation, created_at DESC);

ALTER TABLE public.ai_auxiliary_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_auxiliary_admissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_auxiliary_admissions TO service_role;

CREATE OR REPLACE FUNCTION public.admit_auxiliary_ai_request(
  _operation text,
  _limit_per_hour integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _operation NOT IN ('song_setup_assistant','ai_music_lab','song_analyzer') THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;
  IF _limit_per_hour < 1 OR _limit_per_hour > 100 THEN
    RAISE EXCEPTION 'invalid AI rate limit';
  END IF;

  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN
    RAISE EXCEPTION 'account is not available';
  END IF;

  IF public._is_admin_level_internal(v_user) THEN
    RETURN true;
  END IF;

  -- Serialize admission per user so concurrent requests cannot race past the
  -- hourly limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai:' || v_user::text, 0));

  SELECT count(*)::integer
    INTO v_used
  FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user
    AND operation = _operation
    AND created_at > now() - interval '1 hour';

  IF v_used >= _limit_per_hour THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_auxiliary_admissions(user_id, operation)
  VALUES (v_user, _operation);

  -- Keep the admission table bounded without a separate scheduler.
  DELETE FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user
    AND created_at < now() - interval '7 days';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_auxiliary_ai_request(text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_auxiliary_ai_request(text, integer)
  TO authenticated, service_role;

COMMIT;
