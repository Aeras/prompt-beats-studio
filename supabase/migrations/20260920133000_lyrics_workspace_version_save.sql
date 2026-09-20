-- Lyrics Workspace: atomically save edited lyrics as a new version in the
-- existing Prompt Project lineage. No new project/version tables or columns.

CREATE OR REPLACE FUNCTION public.create_prompt_lyrics_workspace_version(
  _user_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _lyrics text,
  _version_label text DEFAULT 'Lyrics edit'
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
    user_id,
    custom_name,
    project_id,
    version_number,
    version_label,
    generator_input_snapshot,
    parent_prompt_id,
    revision_request,
    source_generation_job_id,
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
    v_parent.custom_name,
    _project_id,
    v_version,
    v_label,
    v_parent.generator_input_snapshot,
    _parent_prompt_id,
    NULL,
    NULL,
    COALESCE(v_parent.title, ''),
    COALESCE(v_parent.theme, ''),
    COALESCE(v_parent.genre, ''),
    COALESCE(v_parent.mood, ''),
    COALESCE(v_parent.language, ''),
    COALESCE(v_parent.tags, ''),
    _lyrics,
    COALESCE(v_parent.note, '')
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
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_lyrics_workspace_version(
  uuid, uuid, uuid, text, text
) TO service_role;
