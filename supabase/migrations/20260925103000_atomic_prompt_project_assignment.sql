-- Assign a standalone saved prompt to a Project atomically.
-- The project-scoped transaction lock prevents concurrent assignments from
-- allocating the same version_number under uq_saved_prompts_project_version.

CREATE OR REPLACE FUNCTION public.assign_standalone_prompt_to_project(
  _prompt_id uuid,
  _project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prompt public.saved_prompts;
  v_previous public.saved_prompts;
  v_version integer;
  v_metadata jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Serialize version allocation per target project for this transaction only.
  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  IF NOT EXISTS (
    SELECT 1
    FROM public.prompt_projects p
    WHERE p.id = _project_id
      AND p.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT *
    INTO v_prompt
  FROM public.saved_prompts sp
  WHERE sp.id = _prompt_id
    AND sp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt not found';
  END IF;

  IF v_prompt.project_id IS NOT NULL THEN
    IF v_prompt.project_id = _project_id THEN
      RETURN jsonb_build_object(
        'id', v_prompt.id,
        'project_id', v_prompt.project_id,
        'version_number', v_prompt.version_number,
        'parent_prompt_id', v_prompt.parent_prompt_id
      );
    END IF;
    RAISE EXCEPTION 'Project versions cannot be moved between projects';
  END IF;

  SELECT *
    INTO v_previous
  FROM public.saved_prompts sp
  WHERE sp.project_id = _project_id
    AND sp.user_id = v_user_id
  ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC
  LIMIT 1;

  SELECT COALESCE(MAX(sp.version_number), 0) + 1
    INTO v_version
  FROM public.saved_prompts sp
  WHERE sp.project_id = _project_id
    AND sp.user_id = v_user_id;

  v_metadata := CASE
    WHEN v_version = 1 THEN
      jsonb_build_object(
        'schemaVersion', 1,
        'source', 'initial_generation',
        'title', 'Initial version',
        'summary', 'The initial saved version of this project.',
        'changedFields', '[]'::jsonb,
        'changedSections', '[]'::jsonb,
        'userRequest', NULL
      )
    ELSE
      jsonb_build_object(
        'schemaVersion', 1,
        'source', 'manual_edit',
        'title', 'Added to project',
        'summary', 'A saved prompt was added to this project as a new version.',
        'changedFields', '[]'::jsonb,
        'changedSections', '[]'::jsonb,
        'userRequest', NULL
      )
  END;

  UPDATE public.saved_prompts
  SET project_id = _project_id,
      folder_id = NULL,
      version_number = v_version,
      parent_prompt_id = v_previous.id,
      version_change_metadata = v_metadata,
      updated_at = now()
  WHERE id = _prompt_id
    AND user_id = v_user_id
  RETURNING * INTO v_prompt;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'id', v_prompt.id,
    'project_id', v_prompt.project_id,
    'version_number', v_prompt.version_number,
    'parent_prompt_id', v_prompt.parent_prompt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_standalone_prompt_to_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_standalone_prompt_to_project(uuid, uuid) TO authenticated, service_role;
