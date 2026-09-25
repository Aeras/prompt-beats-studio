BEGIN;

CREATE OR REPLACE FUNCTION public.assign_standalone_prompt_project_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_next_version integer;
BEGIN
  -- Only the standalone -> Project transition is handled here. Existing
  -- Project revision/version flows are intentionally left untouched.
  IF OLD.project_id IS NULL AND NEW.project_id IS NOT NULL THEN
    -- Serialize assignments per Project so two standalone prompts cannot
    -- receive the same version_number under concurrent requests.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.project_id::text));

    SELECT sp.id
      INTO v_parent_id
    FROM public.saved_prompts sp
    WHERE sp.user_id = NEW.user_id
      AND sp.project_id = NEW.project_id
      AND sp.id <> NEW.id
    ORDER BY sp.version_number DESC NULLS LAST, sp.created_at DESC
    LIMIT 1;

    SELECT COALESCE(MAX(sp.version_number), 0) + 1
      INTO v_next_version
    FROM public.saved_prompts sp
    WHERE sp.user_id = NEW.user_id
      AND sp.project_id = NEW.project_id
      AND sp.id <> NEW.id;

    NEW.folder_id := NULL;
    NEW.version_number := v_next_version;
    NEW.parent_prompt_id := v_parent_id;

    -- Preserve the established V1 semantics for an empty Project. Later
    -- imported standalone prompts are recorded as manual additions.
    IF v_next_version = 1 THEN
      NEW.version_change_metadata := jsonb_build_object(
        'schemaVersion', 1,
        'source', 'initial_generation',
        'title', 'Initial version',
        'summary', 'The initial saved version of this project.',
        'changedFields', '[]'::jsonb,
        'changedSections', '[]'::jsonb,
        'userRequest', NULL
      );
    ELSE
      NEW.version_change_metadata := jsonb_build_object(
        'schemaVersion', 1,
        'source', 'manual_edit',
        'title', 'Added to project',
        'summary', 'A saved prompt was added to this project as a new version.',
        'changedFields', '[]'::jsonb,
        'changedSections', '[]'::jsonb,
        'userRequest', NULL
      );
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_standalone_prompt_project_version
  ON public.saved_prompts;

CREATE TRIGGER trg_assign_standalone_prompt_project_version
BEFORE UPDATE OF project_id ON public.saved_prompts
FOR EACH ROW
EXECUTE FUNCTION public.assign_standalone_prompt_project_version();

COMMIT;
