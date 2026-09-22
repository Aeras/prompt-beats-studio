BEGIN;

CREATE OR REPLACE FUNCTION public.preserve_saved_prompt_version_change_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.version_change_metadata IS NOT NULL
     AND NEW.version_change_metadata IS DISTINCT FROM OLD.version_change_metadata THEN
    RAISE EXCEPTION 'Version change metadata is immutable once stored';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_saved_prompt_version_change_metadata ON public.saved_prompts;
CREATE TRIGGER trg_preserve_saved_prompt_version_change_metadata
BEFORE UPDATE OF version_change_metadata
ON public.saved_prompts
FOR EACH ROW EXECUTE FUNCTION public.preserve_saved_prompt_version_change_metadata();

REVOKE ALL ON FUNCTION public.preserve_saved_prompt_version_change_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_saved_prompt_version_change_metadata() TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_preferred_prompt_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.preferred_prompt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.saved_prompts sp
    WHERE sp.id = NEW.preferred_prompt_id
      AND sp.user_id = NEW.user_id
      AND sp.project_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Preferred version must belong to this user and project';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_preferred_prompt_ownership ON public.prompt_projects;
CREATE TRIGGER trg_enforce_preferred_prompt_ownership
BEFORE INSERT OR UPDATE OF preferred_prompt_id, user_id
ON public.prompt_projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_preferred_prompt_ownership();

REVOKE ALL ON FUNCTION public.enforce_preferred_prompt_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_preferred_prompt_ownership() TO service_role;

DROP FUNCTION IF EXISTS public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
);

CREATE FUNCTION public.create_prompt_revision_version(
  _user_id uuid,
  _job_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _revision_request text,
  _generator_input_snapshot jsonb,
  _version_change_metadata jsonb,
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
  IF _version_change_metadata IS NULL OR jsonb_typeof(_version_change_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Version change metadata is required';
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

  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

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
    user_id, project_id, version_number, version_label, parent_prompt_id,
    revision_request, source_generation_job_id, generator_input_snapshot,
    version_change_metadata, title, theme, genre, mood, language, tags, lyrics, note
  ) VALUES (
    _user_id, _project_id, v_version, NULL, _parent_prompt_id,
    btrim(_revision_request), _job_id, _generator_input_snapshot,
    _version_change_metadata, COALESCE(_title, ''), COALESCE(_theme, ''),
    COALESCE(_genre, ''), COALESCE(_mood, ''), COALESCE(_language, ''),
    COALESCE(_tags, ''), COALESCE(_lyrics, ''), COALESCE(_note, '')
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
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, text, text, text, text, text
) TO service_role;

DROP FUNCTION IF EXISTS public.create_prompt_lyrics_workspace_version(
  uuid, uuid, uuid, text, text
);

CREATE FUNCTION public.create_prompt_lyrics_workspace_version(
  _user_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _lyrics text,
  _version_label text,
  _version_change_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent public.saved_prompts;
  v_version integer;
  v_inserted public.saved_prompts;
  v_label text;
BEGIN
  IF _lyrics IS NULL OR char_length(_lyrics) = 0 OR char_length(_lyrics) > 12000 THEN
    RAISE EXCEPTION 'Lyrics are required and must be 12000 characters or fewer';
  END IF;
  IF _version_change_metadata IS NULL OR jsonb_typeof(_version_change_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Version change metadata is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;

  SELECT * INTO v_parent
  FROM public.saved_prompts parent
  WHERE parent.id = _parent_prompt_id
    AND parent.user_id = _user_id
    AND parent.project_id = _project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base prompt does not belong to this user/project';
  END IF;

  v_label := NULLIF(left(btrim(COALESCE(_version_label, '')), 120), '');
  IF v_label IS NULL THEN
    v_label := 'Lyrics edit';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version
  FROM public.saved_prompts
  WHERE project_id = _project_id;

  INSERT INTO public.saved_prompts (
    user_id, custom_name, project_id, version_number, version_label,
    generator_input_snapshot, parent_prompt_id, revision_request,
    source_generation_job_id, version_change_metadata, title, theme,
    genre, mood, language, tags, lyrics, note
  ) VALUES (
    _user_id, v_parent.custom_name, _project_id, v_version, v_label,
    v_parent.generator_input_snapshot, _parent_prompt_id, NULL,
    NULL, _version_change_metadata, COALESCE(v_parent.title, ''),
    COALESCE(v_parent.theme, ''), COALESCE(v_parent.genre, ''),
    COALESCE(v_parent.mood, ''), COALESCE(v_parent.language, ''),
    COALESCE(v_parent.tags, ''), _lyrics, COALESCE(v_parent.note, '')
  )
  RETURNING * INTO v_inserted;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'project_id', v_inserted.project_id,
    'version_number', v_inserted.version_number,
    'parent_prompt_id', v_inserted.parent_prompt_id,
    'version_label', v_inserted.version_label
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_prompt_lyrics_workspace_version(
  uuid, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_lyrics_workspace_version(
  uuid, uuid, uuid, text, text, jsonb
) TO service_role;

COMMIT;
