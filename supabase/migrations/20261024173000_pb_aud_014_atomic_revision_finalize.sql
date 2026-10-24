-- PB-AUD-014: serialize revision persistence with cancellation at the job-row lock.
-- Deployment requires separately reviewed migration/replay and production cutover.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_generation_revision_atomic(
  _job_id uuid,
  _user_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _revision_request text,
  _snapshot jsonb,
  _metadata jsonb,
  _title text,
  _tags text,
  _lyrics text,
  _note text,
  _theme text,
  _genre text,
  _mood text,
  _language text,
  _provider text,
  _model text,
  _result jsonb,
  _attempts integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_revision jsonb;
  v_result jsonb;
BEGIN
  -- Cancellation RPC updates this same row. The lock orders the competing
  -- operations: cancellation wins first => no prompt write, otherwise the
  -- job becomes completed before cancellation can inspect its status.
  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = _job_id AND user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.status <> 'processing'
     OR v_job.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revision job is no longer eligible for finalization';
  END IF;

  IF _project_id IS NULL THEN
    UPDATE public.saved_prompts
    SET title = _title, tags = _tags, lyrics = _lyrics, note = _note,
        theme = _theme, genre = _genre, mood = _mood, language = _language,
        generator_input_snapshot = _snapshot,
        revision_request = _revision_request,
        version_change_metadata = _metadata, updated_at = now()
    WHERE id = _parent_prompt_id AND user_id = _user_id AND project_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Standalone revision target not found';
    END IF;
    v_result := _result;
  ELSE
    v_revision := public.create_prompt_revision_version(
      _user_id, _job_id, _project_id, _parent_prompt_id, _revision_request,
      _snapshot, _metadata, _title, _tags, _lyrics, _note,
      _theme, _genre, _mood, _language
    );
    v_result := _result || jsonb_build_object(
      'revisionMeta', jsonb_build_object(
        'savedPromptId', v_revision->>'id',
        'projectId', v_revision->>'project_id',
        'versionNumber', (v_revision->>'version_number')::integer,
        'parentPromptId', v_revision->>'parent_prompt_id'
      )
    );
  END IF;

  UPDATE public.ai_generation_jobs
  SET status = 'completed', result = v_result,
      provider = _provider, model = _model, error = NULL,
      attempts = _attempts, completed_at = now()
  WHERE id = _job_id AND user_id = _user_id
    AND status = 'processing' AND cancel_requested_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision finalization lost the cancellation race';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_generation_revision_atomic(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text,
  text, text, text, text, text, text, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_generation_revision_atomic(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text,
  text, text, text, text, text, text, jsonb, integer
) TO service_role;

COMMIT;
