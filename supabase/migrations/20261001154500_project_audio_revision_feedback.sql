BEGIN;

CREATE TABLE IF NOT EXISTS public.project_audio_revision_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  source_version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE,
  source_track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  keep_text text NOT NULL DEFAULT '',
  change_text text NOT NULL DEFAULT '',
  revision_brief text,
  imported_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_revision_prompt_id uuid REFERENCES public.saved_prompts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_audio_revision_feedback_keep_length
    CHECK (char_length(keep_text) <= 900),
  CONSTRAINT project_audio_revision_feedback_change_length
    CHECK (char_length(change_text) <= 1200),
  CONSTRAINT project_audio_revision_feedback_brief_length
    CHECK (revision_brief IS NULL OR char_length(revision_brief) <= 600),
  CONSTRAINT project_audio_revision_feedback_has_direction
    CHECK (char_length(btrim(keep_text)) > 0 OR char_length(btrim(change_text)) > 0),
  CONSTRAINT project_audio_revision_feedback_evidence_array
    CHECK (jsonb_typeof(imported_evidence) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_project_audio_revision_feedback_source
  ON public.project_audio_revision_feedback(user_id, project_id, source_version_prompt_id, source_track_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_audio_revision_feedback_created_revision
  ON public.project_audio_revision_feedback(created_revision_prompt_id)
  WHERE created_revision_prompt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_project_audio_revision_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  IF NOT EXISTS (
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

DROP TRIGGER IF EXISTS trg_validate_project_audio_revision_feedback
  ON public.project_audio_revision_feedback;
CREATE TRIGGER trg_validate_project_audio_revision_feedback
BEFORE INSERT OR UPDATE OF user_id, project_id, source_version_prompt_id, source_track_id,
  keep_text, change_text, revision_brief, created_revision_prompt_id
ON public.project_audio_revision_feedback
FOR EACH ROW EXECUTE FUNCTION public.validate_project_audio_revision_feedback();

REVOKE ALL ON FUNCTION public.validate_project_audio_revision_feedback()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_project_audio_revision_feedback() TO service_role;

ALTER TABLE public.project_audio_revision_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_audio_revision_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_audio_revision_feedback TO service_role;

COMMIT;
