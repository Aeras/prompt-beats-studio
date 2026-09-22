BEGIN;

-- Enforce the five-level limit for an entire moved subtree, not only the
-- folder being moved. Without this, moving a deep subtree under another deep
-- branch could create descendants beyond the supported depth.
CREATE OR REPLACE FUNCTION public.validate_library_folder_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_exists boolean;
  v_node_depth integer := 1;
  v_cycle boolean := false;
  v_subtree_height integer := 1;
BEGIN
  NEW.name := btrim(NEW.name);

  IF NEW.parent_folder_id IS NOT NULL AND NEW.id IS NOT NULL AND NEW.parent_folder_id = NEW.id THEN
    RAISE EXCEPTION 'A folder cannot be moved into itself';
  END IF;

  IF NEW.parent_folder_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.library_folders
      WHERE id = NEW.parent_folder_id
        AND user_id = NEW.user_id
    ) INTO v_parent_exists;

    IF NOT v_parent_exists THEN
      RAISE EXCEPTION 'Parent folder does not belong to this user';
    END IF;

    WITH RECURSIVE ancestors AS (
      SELECT id, parent_folder_id, 1 AS level
      FROM public.library_folders
      WHERE id = NEW.parent_folder_id
        AND user_id = NEW.user_id

      UNION ALL

      SELECT f.id, f.parent_folder_id, a.level + 1
      FROM public.library_folders f
      JOIN ancestors a ON f.id = a.parent_folder_id
      WHERE f.user_id = NEW.user_id
        AND a.level < 10
    )
    SELECT
      COALESCE(MAX(level), 0) + 1,
      COALESCE(bool_or(id = NEW.id), false)
    INTO v_node_depth, v_cycle
    FROM ancestors;

    IF v_cycle THEN
      RAISE EXCEPTION 'A folder cannot be moved into one of its descendants';
    END IF;
  ELSE
    v_node_depth := 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE descendants AS (
      SELECT id, 1 AS level
      FROM public.library_folders
      WHERE id = NEW.id
        AND user_id = NEW.user_id

      UNION ALL

      SELECT child.id, d.level + 1
      FROM public.library_folders child
      JOIN descendants d ON child.parent_folder_id = d.id
      WHERE child.user_id = NEW.user_id
        AND d.level < 10
    )
    SELECT COALESCE(MAX(level), 1)
    INTO v_subtree_height
    FROM descendants;
  ELSE
    v_subtree_height := 1;
  END IF;

  IF v_node_depth + v_subtree_height - 1 > 5 THEN
    RAISE EXCEPTION 'Folder nesting cannot exceed 5 levels';
  END IF;

  RETURN NEW;
END;
$$;

-- Rebuild Project version parent links in a second pass. The previous
-- implementation depended on parent versions being encountered first, which
-- was normally true but not guaranteed for legacy or irregular version data.
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

  -- Pass 1: copy every creative version without carrying any parent link.
  FOR v_source_prompt IN
    SELECT *
    FROM public.saved_prompts
    WHERE user_id = v_user_id
      AND project_id = v_source_project.id
    ORDER BY created_at ASC, id ASC
  LOOP
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
      NULL,
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

  -- Pass 2: reconstruct parent_prompt_id only through the new internal IDs.
  FOR v_source_prompt IN
    SELECT *
    FROM public.saved_prompts
    WHERE user_id = v_user_id
      AND project_id = v_source_project.id
      AND parent_prompt_id IS NOT NULL
  LOOP
    v_new_prompt_id := NULLIF(v_id_map ->> v_source_prompt.id::text, '')::uuid;
    v_new_parent_id := NULLIF(v_id_map ->> v_source_prompt.parent_prompt_id::text, '')::uuid;

    IF v_new_prompt_id IS NULL OR v_new_parent_id IS NULL THEN
      RAISE EXCEPTION 'Project version graph contains an external or missing parent reference';
    END IF;

    UPDATE public.saved_prompts
    SET parent_prompt_id = v_new_parent_id,
        updated_at = now()
    WHERE id = v_new_prompt_id
      AND user_id = v_user_id
      AND project_id = v_new_project.id;
  END LOOP;

  IF v_source_project.preferred_prompt_id IS NOT NULL THEN
    v_new_prompt_id := NULLIF(v_id_map ->> v_source_project.preferred_prompt_id::text, '')::uuid;

    IF v_new_prompt_id IS NULL THEN
      RAISE EXCEPTION 'Preferred Project version could not be mapped into the duplicate';
    END IF;

    UPDATE public.prompt_projects
    SET preferred_prompt_id = v_new_prompt_id,
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
