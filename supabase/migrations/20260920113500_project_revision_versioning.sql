-- Project Revision foundation: immutable generator snapshots, lineage and atomic revision saves.

ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS generator_input_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS parent_prompt_id uuid,
  ADD COLUMN IF NOT EXISTS revision_request text,
  ADD COLUMN IF NOT EXISTS source_generation_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_parent_prompt_id_fkey'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_parent_prompt_id_fkey
      FOREIGN KEY (parent_prompt_id) REFERENCES public.saved_prompts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_source_generation_job_id_fkey'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_source_generation_job_id_fkey
      FOREIGN KEY (source_generation_job_id) REFERENCES public.ai_generation_jobs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_generator_snapshot_object_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_generator_snapshot_object_check
      CHECK (generator_input_snapshot IS NULL OR jsonb_typeof(generator_input_snapshot) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_revision_request_length_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_revision_request_length_check
      CHECK (revision_request IS NULL OR char_length(revision_request) <= 3000);
  END IF;
END $$;

-- Refuse to add the unique version invariant if an older environment already
-- contains collisions. Do not silently rewrite historical version numbers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.saved_prompts
    WHERE project_id IS NOT NULL AND version_number IS NOT NULL
    GROUP BY project_id, version_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique project versions: duplicate (project_id, version_number) rows exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_prompts_project_version
  ON public.saved_prompts(project_id, version_number)
  WHERE project_id IS NOT NULL AND version_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_prompts_revision_job
  ON public.saved_prompts(source_generation_job_id)
  WHERE source_generation_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_prompts_parent_prompt
  ON public.saved_prompts(parent_prompt_id)
  WHERE parent_prompt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_saved_prompt_revision_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.parent_prompt_id IS NOT NULL THEN
    IF NEW.project_id IS NULL THEN
      RAISE EXCEPTION 'Revision parent requires a project';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.saved_prompts parent
      WHERE parent.id = NEW.parent_prompt_id
        AND parent.user_id = NEW.user_id
        AND parent.project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'Revision parent must belong to the same user and project';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_saved_prompt_revision_lineage ON public.saved_prompts;
CREATE TRIGGER trg_enforce_saved_prompt_revision_lineage
BEFORE INSERT OR UPDATE OF user_id, project_id, parent_prompt_id
ON public.saved_prompts
FOR EACH ROW EXECUTE FUNCTION public.enforce_saved_prompt_revision_lineage();

REVOKE ALL ON FUNCTION public.enforce_saved_prompt_revision_lineage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_saved_prompt_revision_lineage() TO service_role;

CREATE OR REPLACE FUNCTION public.create_prompt_revision_version(
  _user_id uuid,
  _job_id uuid,
  _project_id uuid,
  _parent_prompt_id uuid,
  _revision_request text,
  _generator_input_snapshot jsonb,
  _title text,
  _tags text,
  _lyrics text,
  _note text,
  _theme text,
  _genre text,
  _mood text,
  _language text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.saved_prompts;
  v_version integer;
  v_inserted public.saved_prompts;
BEGIN
  IF _revision_request IS NULL OR char_length(btrim(_revision_request)) = 0 THEN
    RAISE EXCEPTION 'Revision request is required';
  END IF;
  IF char_length(_revision_request) > 3000 THEN
    RAISE EXCEPTION 'Revision request is too long';
  END IF;
  IF _generator_input_snapshot IS NULL OR jsonb_typeof(_generator_input_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Generator input snapshot is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_generation_jobs j
    WHERE j.id = _job_id AND j.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Generation job does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.saved_prompts parent
    WHERE parent.id = _parent_prompt_id
      AND parent.user_id = _user_id
      AND parent.project_id = _project_id
  ) THEN
    RAISE EXCEPTION 'Base prompt does not belong to this user/project';
  END IF;

  SELECT * INTO v_existing
  FROM public.saved_prompts
  WHERE source_generation_job_id = _job_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'project_id', v_existing.project_id,
      'version_number', v_existing.version_number,
      'parent_prompt_id', v_existing.parent_prompt_id
    );
  END IF;

  -- One transaction at a time may allocate a version inside this project.
  PERFORM pg_advisory_xact_lock(hashtext(_project_id::text));

  -- Re-check after acquiring the project lock in case another finalize won.
  SELECT * INTO v_existing
  FROM public.saved_prompts
  WHERE source_generation_job_id = _job_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'project_id', v_existing.project_id,
      'version_number', v_existing.version_number,
      'parent_prompt_id', v_existing.parent_prompt_id
    );
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version
  FROM public.saved_prompts
  WHERE project_id = _project_id;

  INSERT INTO public.saved_prompts (
    user_id,
    project_id,
    version_number,
    version_label,
    parent_prompt_id,
    revision_request,
    source_generation_job_id,
    generator_input_snapshot,
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
    _project_id,
    v_version,
    left(btrim(_revision_request), 120),
    _parent_prompt_id,
    btrim(_revision_request),
    _job_id,
    _generator_input_snapshot,
    COALESCE(_title, ''),
    COALESCE(_theme, ''),
    COALESCE(_genre, ''),
    COALESCE(_mood, ''),
    COALESCE(_language, ''),
    COALESCE(_tags, ''),
    COALESCE(_lyrics, ''),
    COALESCE(_note, '')
  )
  RETURNING * INTO v_inserted;

  UPDATE public.prompt_projects
  SET updated_at = now()
  WHERE id = _project_id AND user_id = _user_id;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'project_id', v_inserted.project_id,
    'version_number', v_inserted.version_number,
    'parent_prompt_id', v_inserted.parent_prompt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prompt_revision_version(
  uuid, uuid, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) TO service_role;
