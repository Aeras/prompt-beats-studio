BEGIN;

CREATE TABLE IF NOT EXISTS public.project_audio_outcome_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  source_version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE,
  source_track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  intent_match_level text NOT NULL,
  note text,
  lock_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_audio_outcome_intent_match_check
    CHECK (intent_match_level IN ('not_met', 'partially_met', 'mostly_met', 'met')),
  CONSTRAINT project_audio_outcome_note_length
    CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT project_audio_outcome_lock_version_check
    CHECK (lock_version >= 0),
  CONSTRAINT project_audio_outcome_source_unique
    UNIQUE (user_id, project_id, source_version_prompt_id, source_track_id)
);

CREATE INDEX IF NOT EXISTS project_audio_outcome_version_lookup_idx
  ON public.project_audio_outcome_evaluations(user_id, project_id, source_version_prompt_id);

CREATE TABLE IF NOT EXISTS public.project_audio_revision_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  source_version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE,
  source_track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_request text NOT NULL DEFAULT '',
  accepted_keep_text text NOT NULL DEFAULT '',
  accepted_change_text text NOT NULL DEFAULT '',
  accepted_revision_brief text,
  unresolved_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  lock_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT project_audio_revision_intent_request_length
    CHECK (char_length(user_request) <= 4000),
  CONSTRAINT project_audio_revision_intent_keep_length
    CHECK (char_length(accepted_keep_text) <= 900),
  CONSTRAINT project_audio_revision_intent_change_length
    CHECK (char_length(accepted_change_text) <= 1200),
  CONSTRAINT project_audio_revision_intent_brief_length
    CHECK (accepted_revision_brief IS NULL OR char_length(accepted_revision_brief) <= 600),
  CONSTRAINT project_audio_revision_intent_unresolved_array
    CHECK (jsonb_typeof(unresolved_suggestions) = 'array'),
  CONSTRAINT project_audio_revision_intent_status_check
    CHECK (status IN ('draft', 'completed')),
  CONSTRAINT project_audio_revision_intent_lock_version_check
    CHECK (lock_version >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_audio_revision_intent_one_active_idx
  ON public.project_audio_revision_intents(
    user_id,
    project_id,
    source_version_prompt_id,
    source_track_id
  )
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS project_audio_revision_intent_source_lookup_idx
  ON public.project_audio_revision_intents(
    user_id,
    project_id,
    source_version_prompt_id,
    source_track_id,
    created_at DESC
  );

ALTER TABLE public.project_audio_revision_feedback
  ADD COLUMN IF NOT EXISTS revision_intent_id uuid
  REFERENCES public.project_audio_revision_intents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_audio_revision_feedback_intent_unique_idx
  ON public.project_audio_revision_feedback(revision_intent_id)
  WHERE revision_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_audio_source_is_currently_eligible(
  _user_id uuid,
  _project_id uuid,
  _source_version_prompt_id uuid,
  _source_track_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.prompt_projects p
      WHERE p.id = _project_id
        AND p.user_id = _user_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.saved_prompts sp
      WHERE sp.id = _source_version_prompt_id
        AND sp.user_id = _user_id
        AND sp.project_id = _project_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_version_tracks pvt
      JOIN public.tracks t ON t.id = pvt.track_id
      WHERE pvt.user_id = _user_id
        AND pvt.project_id = _project_id
        AND pvt.version_prompt_id = _source_version_prompt_id
        AND pvt.track_id = _source_track_id
        AND t.user_id = _user_id
        AND t.source_type = 'upload'
        AND t.moderation_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.validate_project_audio_outcome_evaluation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.project_audio_source_is_currently_eligible(
    NEW.user_id,
    NEW.project_id,
    NEW.source_version_prompt_id,
    NEW.source_track_id
  ) THEN
    RAISE EXCEPTION 'Source audio is not an available linked result for this version';
  END IF;

  NEW.note := NULLIF(btrim(COALESCE(NEW.note, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_project_audio_outcome_evaluation
  ON public.project_audio_outcome_evaluations;
CREATE TRIGGER trg_validate_project_audio_outcome_evaluation
BEFORE INSERT OR UPDATE OF user_id, project_id, source_version_prompt_id, source_track_id,
  intent_match_level, note, lock_version
ON public.project_audio_outcome_evaluations
FOR EACH ROW EXECUTE FUNCTION public.validate_project_audio_outcome_evaluation();

CREATE OR REPLACE FUNCTION public.validate_project_audio_revision_intent()
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
    RAISE EXCEPTION 'Project does not belong to revision intent owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.saved_prompts sp
    WHERE sp.id = NEW.source_version_prompt_id
      AND sp.user_id = NEW.user_id
      AND sp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Source version does not belong to revision intent owner/project';
  END IF;

  IF TG_OP = 'INSERT' THEN
    requires_current_source_eligibility := true;
  ELSE
    IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Completed revision intent cannot be reopened';
    END IF;

    requires_current_source_eligibility :=
      NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.source_version_prompt_id IS DISTINCT FROM OLD.source_version_prompt_id
      OR NEW.source_track_id IS DISTINCT FROM OLD.source_track_id
      OR NEW.user_request IS DISTINCT FROM OLD.user_request
      OR NEW.accepted_keep_text IS DISTINCT FROM OLD.accepted_keep_text
      OR NEW.accepted_change_text IS DISTINCT FROM OLD.accepted_change_text
      OR NEW.accepted_revision_brief IS DISTINCT FROM OLD.accepted_revision_brief
      OR NEW.unresolved_suggestions IS DISTINCT FROM OLD.unresolved_suggestions;
  END IF;

  IF requires_current_source_eligibility AND NOT public.project_audio_source_is_currently_eligible(
    NEW.user_id,
    NEW.project_id,
    NEW.source_version_prompt_id,
    NEW.source_track_id
  ) THEN
    RAISE EXCEPTION 'Source audio is not an available linked result for this version';
  END IF;

  IF NEW.status = 'completed' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_audio_revision_feedback f
      JOIN public.saved_prompts child ON child.id = f.created_revision_prompt_id
      WHERE f.revision_intent_id = NEW.id
        AND f.user_id = NEW.user_id
        AND f.project_id = NEW.project_id
        AND f.source_version_prompt_id = NEW.source_version_prompt_id
        AND f.source_track_id = NEW.source_track_id
        AND child.user_id = NEW.user_id
        AND child.project_id = NEW.project_id
        AND child.parent_prompt_id = NEW.source_version_prompt_id
    ) THEN
      RAISE EXCEPTION 'Revision intent cannot complete without canonical feedback and child lineage';
    END IF;
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;

  NEW.user_request := btrim(NEW.user_request);
  NEW.accepted_keep_text := btrim(NEW.accepted_keep_text);
  NEW.accepted_change_text := btrim(NEW.accepted_change_text);
  NEW.accepted_revision_brief := NULLIF(btrim(COALESCE(NEW.accepted_revision_brief, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_project_audio_revision_intent
  ON public.project_audio_revision_intents;
CREATE TRIGGER trg_validate_project_audio_revision_intent
BEFORE INSERT OR UPDATE OF user_id, project_id, source_version_prompt_id, source_track_id,
  user_request, accepted_keep_text, accepted_change_text, accepted_revision_brief,
  unresolved_suggestions, status, lock_version
ON public.project_audio_revision_intents
FOR EACH ROW EXECUTE FUNCTION public.validate_project_audio_revision_intent();

-- Extend the canonical feedback validator with the single authoritative Intent relation.
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

  IF requires_current_source_eligibility AND NOT public.project_audio_source_is_currently_eligible(
    NEW.user_id,
    NEW.project_id,
    NEW.source_version_prompt_id,
    NEW.source_track_id
  ) THEN
    RAISE EXCEPTION 'Source audio is not an available linked result for this version';
  END IF;

  IF NEW.revision_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_audio_revision_intents i
    WHERE i.id = NEW.revision_intent_id
      AND i.user_id = NEW.user_id
      AND i.project_id = NEW.project_id
      AND i.source_version_prompt_id = NEW.source_version_prompt_id
      AND i.source_track_id = NEW.source_track_id
  ) THEN
    RAISE EXCEPTION 'Revision intent provenance does not match feedback provenance';
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

ALTER TABLE public.project_audio_outcome_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audio_revision_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_audio_outcome_evaluations
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_audio_revision_intents
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_audio_outcome_evaluations TO service_role;
GRANT ALL ON TABLE public.project_audio_revision_intents TO service_role;

REVOKE ALL ON FUNCTION public.project_audio_source_is_currently_eligible(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_project_audio_outcome_evaluation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_project_audio_revision_intent()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_project_audio_revision_feedback()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_audio_source_is_currently_eligible(uuid,uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_project_audio_outcome_evaluation() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_project_audio_revision_intent() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_project_audio_revision_feedback() TO service_role;

COMMIT;
