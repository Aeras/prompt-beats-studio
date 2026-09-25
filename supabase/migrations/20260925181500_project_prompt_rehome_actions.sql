BEGIN;

-- Preserve canonical Version History metadata. Two tightly-scoped server-side
-- flows are allowed to rewrite it: Lyrics Review leaf replacement and an
-- explicit Project-version rehome. Detaching a version clears the metadata.
CREATE OR REPLACE FUNCTION public.preserve_saved_prompt_version_change_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.version_change_metadata IS NOT NULL
     AND NEW.version_change_metadata IS DISTINCT FROM OLD.version_change_metadata
     AND NOT (NEW.project_id IS NULL AND NEW.version_change_metadata IS NULL)
     AND COALESCE(current_setting('promptbeats.allow_version_metadata_update', true), '')
       NOT IN ('lyrics_review_latest', 'project_prompt_rehome') THEN
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

CREATE OR REPLACE FUNCTION public.detach_prompt_project_version(
  _user_id uuid,
  _prompt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.saved_prompts;
  v_source_project_id uuid;
  v_source_parent_id uuid;
  v_fallback_preferred_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id AND user_id = _user_id;

  IF NOT FOUND OR v_source.project_id IS NULL THEN
    RAISE EXCEPTION 'Project version not found';
  END IF;

  v_source_project_id := v_source.project_id;
  v_source_parent_id := v_source.parent_prompt_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_source_project_id::text, 0));

  SELECT * INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id
    AND user_id = _user_id
    AND project_id = v_source_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project version changed while detaching';
  END IF;

  -- Keep existing version numbers stable. Children skip over the removed node
  -- so no remaining Project version points at a standalone prompt.
  UPDATE public.saved_prompts
  SET parent_prompt_id = v_source_parent_id,
      updated_at = now()
  WHERE user_id = _user_id
    AND project_id = v_source_project_id
    AND parent_prompt_id = _prompt_id;

  SELECT sp.id INTO v_fallback_preferred_id
  FROM public.saved_prompts sp
  WHERE sp.user_id = _user_id
    AND sp.project_id = v_source_project_id
    AND sp.id <> _prompt_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC, sp.id DESC
  LIMIT 1;

  UPDATE public.prompt_projects
  SET preferred_prompt_id = CASE
        WHEN preferred_prompt_id = _prompt_id THEN v_fallback_preferred_id
        ELSE preferred_prompt_id
      END,
      updated_at = now()
  WHERE id = v_source_project_id AND user_id = _user_id;

  -- Linked audio is Project-version specific. Detaching removes only the links;
  -- the user's uploaded tracks themselves are never deleted.
  DELETE FROM public.project_version_tracks
  WHERE user_id = _user_id AND version_prompt_id = _prompt_id;

  -- The existing detach trigger clears version_number, label, parent lineage,
  -- Version History metadata/note, branch label and revision request.
  UPDATE public.saved_prompts
  SET project_id = NULL,
      updated_at = now()
  WHERE id = _prompt_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', _prompt_id,
    'source_project_id', v_source_project_id,
    'previous_version_number', v_source.version_number,
    'project_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.detach_prompt_project_version(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detach_prompt_project_version(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.copy_prompt_version_to_project(
  _user_id uuid,
  _prompt_id uuid,
  _destination_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.saved_prompts;
  v_parent_id uuid;
  v_next_version integer;
  v_inserted public.saved_prompts;
BEGIN
  SELECT * INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id AND user_id = _user_id;

  IF NOT FOUND OR v_source.project_id IS NULL THEN
    RAISE EXCEPTION 'Project version not found';
  END IF;
  IF v_source.project_id = _destination_project_id THEN
    RAISE EXCEPTION 'Choose a different destination project';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _destination_project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Destination project not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_destination_project_id::text, 0));

  SELECT sp.id INTO v_parent_id
  FROM public.saved_prompts sp
  WHERE sp.user_id = _user_id
    AND sp.project_id = _destination_project_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC, sp.id DESC
  LIMIT 1;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.saved_prompts
  WHERE user_id = _user_id AND project_id = _destination_project_id;

  INSERT INTO public.saved_prompts (
    user_id,
    custom_name,
    project_id,
    folder_id,
    duplicated_from_prompt_id,
    version_number,
    version_label,
    generator_input_snapshot,
    parent_prompt_id,
    revision_request,
    source_generation_job_id,
    version_change_metadata,
    version_user_note,
    branch_label,
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
    v_source.custom_name,
    _destination_project_id,
    NULL,
    v_source.id,
    v_next_version,
    NULL,
    v_source.generator_input_snapshot,
    v_parent_id,
    NULL,
    NULL,
    jsonb_build_object(
      'schemaVersion', 1,
      'source', 'manual_edit',
      'title', 'Copied to project',
      'summary', 'A copy of an existing saved prompt was added to this project.',
      'changedFields', '[]'::jsonb,
      'changedSections', '[]'::jsonb,
      'userRequest', NULL
    ),
    NULL,
    NULL,
    v_source.title,
    v_source.theme,
    v_source.genre,
    v_source.mood,
    v_source.language,
    v_source.tags,
    v_source.lyrics,
    v_source.note
  ) RETURNING * INTO v_inserted;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _destination_project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'project_id', _destination_project_id,
    'version_number', v_next_version,
    'parent_prompt_id', v_parent_id,
    'copied_from_prompt_id', _prompt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.copy_prompt_version_to_project(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_prompt_version_to_project(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.move_prompt_version_to_project(
  _user_id uuid,
  _prompt_id uuid,
  _destination_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.saved_prompts;
  v_source_project_id uuid;
  v_source_parent_id uuid;
  v_destination_parent_id uuid;
  v_next_version integer;
  v_fallback_preferred_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id AND user_id = _user_id;

  IF NOT FOUND OR v_source.project_id IS NULL THEN
    RAISE EXCEPTION 'Project version not found';
  END IF;

  v_source_project_id := v_source.project_id;
  v_source_parent_id := v_source.parent_prompt_id;

  IF v_source_project_id = _destination_project_id THEN
    RAISE EXCEPTION 'Choose a different destination project';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _destination_project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Destination project not found';
  END IF;

  -- Lock both Projects in deterministic order to avoid concurrent allocator races.
  IF v_source_project_id::text < _destination_project_id::text THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_source_project_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(_destination_project_id::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(_destination_project_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_source_project_id::text, 0));
  END IF;

  SELECT * INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id
    AND user_id = _user_id
    AND project_id = v_source_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project version changed while moving';
  END IF;

  SELECT sp.id INTO v_destination_parent_id
  FROM public.saved_prompts sp
  WHERE sp.user_id = _user_id
    AND sp.project_id = _destination_project_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC, sp.id DESC
  LIMIT 1;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.saved_prompts
  WHERE user_id = _user_id AND project_id = _destination_project_id;

  -- Keep source version numbers unchanged. Only repair lineage around the node
  -- being removed, so V1,V2,V4 remains V1,V2,V4 rather than being renumbered.
  UPDATE public.saved_prompts
  SET parent_prompt_id = v_source_parent_id,
      updated_at = now()
  WHERE user_id = _user_id
    AND project_id = v_source_project_id
    AND parent_prompt_id = _prompt_id;

  SELECT sp.id INTO v_fallback_preferred_id
  FROM public.saved_prompts sp
  WHERE sp.user_id = _user_id
    AND sp.project_id = v_source_project_id
    AND sp.id <> _prompt_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC, sp.id DESC
  LIMIT 1;

  UPDATE public.prompt_projects
  SET preferred_prompt_id = CASE
        WHEN preferred_prompt_id = _prompt_id THEN v_fallback_preferred_id
        ELSE preferred_prompt_id
      END,
      updated_at = now()
  WHERE id = v_source_project_id AND user_id = _user_id;

  PERFORM set_config('promptbeats.allow_version_metadata_update', 'project_prompt_rehome', true);

  UPDATE public.saved_prompts
  SET project_id = _destination_project_id,
      folder_id = NULL,
      version_number = v_next_version,
      version_label = NULL,
      parent_prompt_id = v_destination_parent_id,
      version_change_metadata = jsonb_build_object(
        'schemaVersion', 1,
        'source', 'manual_edit',
        'title', 'Moved to project',
        'summary', 'An existing saved prompt was moved into this project as a new version.',
        'changedFields', '[]'::jsonb,
        'changedSections', '[]'::jsonb,
        'userRequest', NULL
      ),
      version_user_note = NULL,
      branch_label = NULL,
      revision_request = NULL,
      updated_at = now()
  WHERE id = _prompt_id AND user_id = _user_id;

  PERFORM set_config('promptbeats.allow_version_metadata_update', '', true);

  -- A moved prompt keeps its linked uploaded tracks. Re-home only the relation's
  -- Project id after the prompt itself belongs to the destination Project.
  UPDATE public.project_version_tracks
  SET project_id = _destination_project_id
  WHERE user_id = _user_id AND version_prompt_id = _prompt_id;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _destination_project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', _prompt_id,
    'source_project_id', v_source_project_id,
    'project_id', _destination_project_id,
    'previous_version_number', v_source.version_number,
    'version_number', v_next_version,
    'parent_prompt_id', v_destination_parent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_prompt_version_to_project(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_prompt_version_to_project(uuid, uuid, uuid) TO service_role;

COMMIT;
