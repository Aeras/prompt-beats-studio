BEGIN;

-- Keep version metadata immutable for ordinary updates, while allowing the
-- dedicated latest-version Lyrics Review replacement RPC to refresh the
-- canonical metadata atomically with the destructive lyric replacement.
CREATE OR REPLACE FUNCTION public.preserve_saved_prompt_version_change_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.version_change_metadata IS NOT NULL
     AND NEW.version_change_metadata IS DISTINCT FROM OLD.version_change_metadata
     AND COALESCE(current_setting('promptbeats.allow_version_metadata_update', true), '') <> 'lyrics_review_latest' THEN
    RAISE EXCEPTION 'Version change metadata is immutable once stored';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_saved_prompt_version_change_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_saved_prompt_version_change_metadata() TO service_role;

CREATE OR REPLACE FUNCTION public.create_prompt_lyrics_review_version(
  _user_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _lyrics text,
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
    _user_id, v_parent.custom_name, _project_id, v_version, 'Lyrics Review',
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

REVOKE ALL ON FUNCTION public.create_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_latest_prompt_lyrics_review_version(
  _user_id uuid,
  _project_id uuid,
  _version_prompt_id uuid,
  _lyrics text,
  _version_change_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.saved_prompts;
  v_latest public.saved_prompts;
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

  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  SELECT * INTO v_target
  FROM public.saved_prompts sp
  WHERE sp.id = _version_prompt_id
    AND sp.user_id = _user_id
    AND sp.project_id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version does not belong to this user/project';
  END IF;

  SELECT * INTO v_latest
  FROM public.saved_prompts sp
  WHERE sp.user_id = _user_id
    AND sp.project_id = _project_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_latest.id <> _version_prompt_id THEN
    RAISE EXCEPTION 'Only the latest project version can be replaced';
  END IF;

  PERFORM set_config('promptbeats.allow_version_metadata_update', 'lyrics_review_latest', true);

  UPDATE public.saved_prompts
  SET lyrics = _lyrics,
      version_change_metadata = _version_change_metadata
  WHERE id = _version_prompt_id
    AND user_id = _user_id
    AND project_id = _project_id;

  PERFORM set_config('promptbeats.allow_version_metadata_update', '', true);

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_target.id,
    'project_id', v_target.project_id,
    'version_number', v_target.version_number,
    'parent_prompt_id', v_target.parent_prompt_id,
    'replaced', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_latest_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_latest_prompt_lyrics_review_version(
  uuid, uuid, uuid, text, jsonb
) TO service_role;

COMMIT;
