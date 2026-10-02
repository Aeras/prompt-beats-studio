BEGIN;

ALTER TABLE public.ai_auxiliary_requests
  DROP CONSTRAINT IF EXISTS ai_auxiliary_requests_operation_check;
ALTER TABLE public.ai_auxiliary_requests
  ADD CONSTRAINT ai_auxiliary_requests_operation_check
  CHECK (operation IN (
    'song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe',
    'audio_revision_intent'
  ));

ALTER TABLE public.ai_auxiliary_admissions
  DROP CONSTRAINT IF EXISTS ai_auxiliary_admissions_operation_check;
ALTER TABLE public.ai_auxiliary_admissions
  ADD CONSTRAINT ai_auxiliary_admissions_operation_check
  CHECK (operation IN (
    'song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe',
    'audio_revision_intent'
  ));

CREATE INDEX IF NOT EXISTS ai_auxiliary_audio_revision_intent_expiry_idx
  ON public.ai_auxiliary_requests(completed_at)
  WHERE operation = 'audio_revision_intent'
    AND status = 'completed'
    AND result IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_audio_revision_intent_ai_results_internal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.ai_auxiliary_requests
  SET result = NULL,
      updated_at = now()
  WHERE operation = 'audio_revision_intent'
    AND status = 'completed'
    AND result IS NOT NULL
    AND completed_at IS NOT NULL
    AND completed_at <= now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_audio_revision_intent_ai_results_internal()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_audio_revision_intent_ai_results_internal()
  TO service_role;

COMMIT;
