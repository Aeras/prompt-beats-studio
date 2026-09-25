BEGIN;

-- A prompt that is no longer attached to a Project is a true standalone prompt.
-- Version-chain metadata is meaningful only while the prompt belongs to a Project.
CREATE OR REPLACE FUNCTION public.preserve_saved_prompt_version_change_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.version_change_metadata IS NOT NULL
     AND NEW.version_change_metadata IS DISTINCT FROM OLD.version_change_metadata
     AND NOT (NEW.project_id IS NULL AND NEW.version_change_metadata IS NULL) THEN
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

-- Whenever a Project version becomes detached (including ON DELETE SET NULL when
-- its Project is deleted), remove all state that belongs only to that version chain.
CREATE OR REPLACE FUNCTION public.reset_detached_saved_prompt_version_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.project_id IS NOT NULL AND NEW.project_id IS NULL THEN
    NEW.version_number := NULL;
    NEW.version_label := NULL;
    NEW.parent_prompt_id := NULL;
    NEW.version_change_metadata := NULL;
    NEW.version_user_note := NULL;
    NEW.branch_label := NULL;
    NEW.revision_request := NULL;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_detached_saved_prompt_version_state
  ON public.saved_prompts;
CREATE TRIGGER trg_reset_detached_saved_prompt_version_state
BEFORE UPDATE OF project_id ON public.saved_prompts
FOR EACH ROW
EXECUTE FUNCTION public.reset_detached_saved_prompt_version_state();

-- Ensure standalone -> Project assignment is present in every environment.
-- Existing Project revision creation paths are intentionally untouched.
CREATE OR REPLACE FUNCTION public.assign_standalone_prompt_project_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_next_version integer;
BEGIN
  IF OLD.project_id IS NULL AND NEW.project_id IS NOT NULL THEN
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
    NEW.version_label := NULL;
    NEW.version_user_note := NULL;
    NEW.branch_label := NULL;
    NEW.revision_request := NULL;

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

-- Repair prompts detached by Project deletions before this migration. They were
-- left with historical V1/V2/... lineage fields even though project_id was NULL.
UPDATE public.saved_prompts
SET
  version_number = NULL,
  version_label = NULL,
  parent_prompt_id = NULL,
  version_change_metadata = NULL,
  version_user_note = NULL,
  branch_label = NULL,
  revision_request = NULL,
  updated_at = now()
WHERE project_id IS NULL
  AND (
    version_number IS NOT NULL
    OR version_label IS NOT NULL
    OR parent_prompt_id IS NOT NULL
    OR version_change_metadata IS NOT NULL
    OR version_user_note IS NOT NULL
    OR branch_label IS NOT NULL
    OR revision_request IS NOT NULL
  );

COMMIT;