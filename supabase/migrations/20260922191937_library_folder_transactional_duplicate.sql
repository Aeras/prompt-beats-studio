BEGIN;

CREATE OR REPLACE FUNCTION public.duplicate_standalone_prompt_to_folder(
  _prompt_id uuid,
  _destination_folder_id uuid,
  _new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source public.saved_prompts;
  v_inserted public.saved_prompts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _new_name IS NULL OR char_length(btrim(_new_name)) = 0 OR char_length(btrim(_new_name)) > 200 THEN
    RAISE EXCEPTION 'Duplicate prompt name is required and must be 200 characters or fewer';
  END IF;

  SELECT *
  INTO v_source
  FROM public.saved_prompts
  WHERE id = _prompt_id
    AND user_id = v_user_id
    AND project_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Standalone prompt not found';
  END IF;

  IF _destination_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.library_folders
    WHERE id = _destination_folder_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Destination folder does not belong to this user';
  END IF;

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
    title,
    theme,
    genre,
    mood,
    language,
    tags,
    lyrics,
    note
  ) VALUES (
    v_user_id,
    btrim(_new_name),
    NULL,
    _destination_folder_id,
    v_source.id,
    NULL,
    NULL,
    v_source.generator_input_snapshot,
    NULL,
    NULL,
    NULL,
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
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'folder_id', v_inserted.folder_id,
    'duplicated_from_prompt_id', v_inserted.duplicated_from_prompt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_standalone_prompt_to_folder(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_standalone_prompt_to_folder(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.duplicate_prompt_project_to_folder(
  _project_id uuid,
  _destination_folder_id uuid,
  _new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source_project public.prompt_projects;
  v_new_project public.prompt_projects;
  v_source_prompt public.saved_prompts;
  v_new_prompt_id uuid;
  v_new_parent_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_copied_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _new_name IS NULL OR char_length(btrim(_new_name)) = 0 OR char_length(btrim(_new_name)) > 120 THEN
    RAISE EXCEPTION 'Duplicate project name is required and must be 120 characters or fewer';
  END IF;

  SELECT *
  INTO v_source_project
  FROM public.prompt_projects
  WHERE id = _project_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF _destination_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.library_folders
    WHERE id = _destination_folder_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Destination folder does not belong to this user';
  END IF;

  INSERT INTO public.prompt_projects (
    user_id,
    name,
    creation_notes,
    preferred_prompt_id,
    folder_id,
    duplicated_from_project_id
  ) VALUES (
    v_user_id,
    btrim(_new_name),
    v_source_project.creation_notes,
    NULL,
    _destination_folder_id,
    v_source_project.id
  )
  RETURNING * INTO v_new_project;

  FOR v_source_prompt IN
    SELECT *
    FROM public.saved_prompts
    WHERE user_id = v_user_id
      AND project_id = v_source_project.id
    ORDER BY version_number ASC NULLS LAST, created_at ASC, id ASC
  LOOP
    v_new_parent_id := NULL;
    IF v_source_prompt.parent_prompt_id IS NOT NULL THEN
      v_new_parent_id := NULLIF(v_id_map ->> v_source_prompt.parent_prompt_id::text, '')::uuid;
    END IF;

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
      title,
      theme,
      genre,
      mood,
      language,
      tags,
      lyrics,
      note
    ) VALUES (
      v_user_id,
      v_source_prompt.custom_name,
      v_new_project.id,
      NULL,
      v_source_prompt.id,
      v_source_prompt.version_number,
      v_source_prompt.version_label,
      v_source_prompt.generator_input_snapshot,
      v_new_parent_id,
      v_source_prompt.revision_request,
      NULL,
      v_source_prompt.version_change_metadata,
      v_source_prompt.version_user_note,
      v_source_prompt.title,
      v_source_prompt.theme,
      v_source_prompt.genre,
      v_source_prompt.mood,
      v_source_prompt.language,
      v_source_prompt.tags,
      v_source_prompt.lyrics,
      v_source_prompt.note
    )
    RETURNING id INTO v_new_prompt_id;

    v_id_map := v_id_map || jsonb_build_object(v_source_prompt.id::text, v_new_prompt_id::text);
    v_copied_count := v_copied_count + 1;
  END LOOP;

  IF v_source_project.preferred_prompt_id IS NOT NULL THEN
    UPDATE public.prompt_projects
    SET preferred_prompt_id = NULLIF(v_id_map ->> v_source_project.preferred_prompt_id::text, '')::uuid,
        updated_at = now()
    WHERE id = v_new_project.id
      AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_new_project.id,
    'folder_id', v_new_project.folder_id,
    'duplicated_from_project_id', v_new_project.duplicated_from_project_id,
    'copied_versions', v_copied_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_prompt_project_to_folder(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_prompt_project_to_folder(uuid, uuid, text) TO authenticated, service_role;

COMMIT;
