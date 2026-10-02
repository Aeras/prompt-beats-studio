BEGIN;

-- PB-003 FOLLOW-UP: separate current source eligibility from historical child binding.
-- Starting/changing a revision request still requires the source upload to be an
-- eligible linked result. Binding an already-created canonical child validates
-- immutable Project/Version lineage and must not fail only because the source
-- Track was later unlinked or moderated.
CREATE OR REPLACE FUNCTION public.validate_project_audio_revision_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requires_current_source_eligibility boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.prompt_projects p
    WHERE p.id = NEW.project_id
      AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Project does not belong to feedback owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.saved_prompts sp
    WHERE sp.id = NEW.source_version_prompt_id
      AND sp.user_id = NEW.user_id
      AND sp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Source version does not belong to feedback owner/project';
  END IF;

  IF TG_OP = 'INSERT' THEN
    requires_current_source_eligibility := true;
  ELSE
    requires_current_source_eligibility :=
      NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.source_version_prompt_id IS DISTINCT FROM OLD.source_version_prompt_id
      OR NEW.source_track_id IS DISTINCT FROM OLD.source_track_id
      OR NEW.keep_text IS DISTINCT FROM OLD.keep_text
      OR NEW.change_text IS DISTINCT FROM OLD.change_text
      OR NEW.revision_brief IS DISTINCT FROM OLD.revision_brief;
  END IF;

  IF requires_current_source_eligibility AND NOT EXISTS (
    SELECT 1
    FROM public.project_version_tracks pvt
    JOIN public.tracks t ON t.id = pvt.track_id
    WHERE pvt.user_id = NEW.user_id
      AND pvt.project_id = NEW.project_id
      AND pvt.version_prompt_id = NEW.source_version_prompt_id
      AND pvt.track_id = NEW.source_track_id
      AND t.user_id = NEW.user_id
      AND t.source_type = 'upload'
      AND t.moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Source audio is not an available linked result for this version';
  END IF;

  IF NEW.created_revision_prompt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.saved_prompts revision
    WHERE revision.id = NEW.created_revision_prompt_id
      AND revision.user_id = NEW.user_id
      AND revision.project_id = NEW.project_id
      AND revision.parent_prompt_id = NEW.source_version_prompt_id
  ) THEN
    RAISE EXCEPTION 'Created revision must be a child of the source version in the same project';
  END IF;

  NEW.keep_text := btrim(NEW.keep_text);
  NEW.change_text := btrim(NEW.change_text);
  NEW.revision_brief := NULLIF(btrim(COALESCE(NEW.revision_brief, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_project_audio_revision_feedback()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_project_audio_revision_feedback() TO service_role;

COMMIT;
