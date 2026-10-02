BEGIN;

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
  IF _operation NOT IN (
    'song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe',
    'audio_revision_intent'
  ) THEN
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
    INSERT INTO public.ai_auxiliary_admissions(user_id, operation)
    VALUES (v_user, _operation);
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

  INSERT INTO public.ai_auxiliary_admissions(user_id, operation)
  VALUES(v_user, _operation);
  DELETE FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user AND created_at < now() - interval '7 days';
  RETURN true;
END;
$$;

COMMIT;
