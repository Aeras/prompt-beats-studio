-- Keep auto-generated revision badges compact.
-- Revision instructions remain stored in revision_request, not version_label.

UPDATE public.saved_prompts
SET version_label = NULL
WHERE source_generation_job_id IS NOT NULL
  AND revision_request IS NOT NULL
  AND version_label = left(btrim(revision_request), 120);

CREATE OR REPLACE FUNCTION public.create_prompt_revision_version(
  _user_id uuid,
  _job_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _revision_request text,
  _generator_input_snapshot jsonb,
  _title text,
  _tags text,
  _lyrics text,
  _note text,
  _theme text,
  _genre text,
  _mood text,
  _language text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.saved_prompts;
  v_version integer;
  v_inserted public.saved_prompts;
BEGIN
  IF _revision_request IS NULL OR char_length(btrim(_revision_request)) = 0 THEN
    RAISE EXCEPTION 'Revision request is required';
  END IF;
  IF char_length(_revision_request) > 3000 THEN
    RAISE EXCEPTION 'Revision request is too long';
  END IF;
  IF _generator_input_snapshot IS NULL OR jsonb_typeof(_generator_input_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Generator input snapshot is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_generation_jobs j
    WHERE j.id = _job_id AND j.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Generation job does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.saved_prompts parent
    WHERE parent.id = _parent_prompt_id
      AND parent.user_id = _user_id
      AND parent.project_id = _project_id
  ) THEN
    RAISE EXCEPTION 'Base prompt does not belong to this user/project';
  END IF;

  SELECT * INTO v_existing
  FROM public.saved_prompts
  WHERE source_generation_job_id = _job_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'project_id', v_existing.project_id,
      'version_number', v_existing.version_number,
      'parent_prompt_id', v_existing.parent_prompt_id
    );
  END IF;

  -- One transaction at a time may allocate a version inside this project.
  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  -- Re-check after acquiring the project lock in case another finalize won.
  SELECT * INTO v_existing
  FROM public.saved_prompts
  WHERE source_generation_job_id = _job_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'project_id', v_existing.project_id,
      'version_number', v_existing.version_number,
      'parent_prompt_id', v_existing.parent_prompt_id
    );
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version
  FROM public.saved_prompts
  WHERE project_id = _project_id;

  INSERT INTO public.saved_prompts (
    user_id,
    project_id,
    version_number,
    version_label,
    parent_prompt_id,
    revision_request,
    source_generation_job_id,
    generator_input_snapshot,
    title,
    theme,
    genre,
    mood,
    language,
    tags,
    lyrics,
    note
  ) VALUES (
    _user_id,
    _project_id,
    v_version,
    NULL,
    _parent_prompt_id,
    btrim(_revision_request),
    _job_id,
    _generator_input_snapshot,
    COALESCE(_title, ''),
    COALESCE(_theme, ''),
    COALESCE(_genre, ''),
    COALESCE(_mood, ''),
    COALESCE(_language, ''),
    COALESCE(_tags, ''),
    COALESCE(_lyrics, ''),
    COALESCE(_note, '')
  )
  RETURNING * INTO v_inserted;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'project_id', v_inserted.project_id,
    'version_number', v_inserted.version_number,
    'parent_prompt_id', v_inserted.parent_prompt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;


REVOKE ALL ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) TO service_role;
