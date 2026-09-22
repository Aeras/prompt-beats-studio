BEGIN;

CREATE TABLE IF NOT EXISTS public.project_version_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  version_prompt_id uuid NOT NULL REFERENCES public.saved_prompts(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_version_tracks_version_track_unique UNIQUE (version_prompt_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_project_version_tracks_project_version
  ON public.project_version_tracks(project_id, version_prompt_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_project_version_tracks_user
  ON public.project_version_tracks(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_version_tracks_track
  ON public.project_version_tracks(track_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_version_tracks_one_primary
  ON public.project_version_tracks(version_prompt_id)
  WHERE is_primary = true;

CREATE OR REPLACE FUNCTION public.validate_project_version_track_relation()
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
    RAISE EXCEPTION 'Project does not belong to relation owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.saved_prompts sp
    WHERE sp.id = NEW.version_prompt_id
      AND sp.user_id = NEW.user_id
      AND sp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Version does not belong to relation owner/project';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tracks t
    WHERE t.id = NEW.track_id
      AND t.user_id = NEW.user_id
      AND t.source_type = 'upload'
  ) THEN
    RAISE EXCEPTION 'Track must be an owned PromptBeats upload';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_project_version_track_relation ON public.project_version_tracks;
CREATE TRIGGER trg_validate_project_version_track_relation
BEFORE INSERT OR UPDATE OF user_id, project_id, version_prompt_id, track_id
ON public.project_version_tracks
FOR EACH ROW EXECUTE FUNCTION public.validate_project_version_track_relation();

REVOKE ALL ON FUNCTION public.validate_project_version_track_relation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_project_version_track_relation() TO service_role;

ALTER TABLE public.project_version_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own project version tracks" ON public.project_version_tracks;
CREATE POLICY "Users can read their own project version tracks"
ON public.project_version_tracks
FOR SELECT
USING (auth.uid() = user_id AND NOT public.current_user_is_banned());

REVOKE ALL ON TABLE public.project_version_tracks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_version_tracks TO authenticated, service_role;
GRANT ALL ON TABLE public.project_version_tracks TO service_role;

CREATE OR REPLACE FUNCTION public.link_project_version_tracks(
  _project_id uuid,
  _version_prompt_id uuid,
  _track_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_track_ids uuid[];
  v_valid_count integer := 0;
  v_inserted integer := 0;
BEGIN
  IF v_user_id IS NULL OR public.current_user_is_banned() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(_track_ids, '{}'::uuid[])) AS value
    WHERE value IS NOT NULL
  ) INTO v_track_ids;

  IF COALESCE(cardinality(v_track_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one track';
  END IF;
  IF cardinality(v_track_ids) > 50 THEN
    RAISE EXCEPTION 'Too many tracks selected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = _project_id AND p.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.saved_prompts sp
    WHERE sp.id = _version_prompt_id
      AND sp.project_id = _project_id
      AND sp.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Project version not found';
  END IF;

  SELECT count(*)::integer
  INTO v_valid_count
  FROM public.tracks t
  WHERE t.id = ANY(v_track_ids)
    AND t.user_id = v_user_id
    AND t.source_type = 'upload'
    AND t.moderation_status = 'active';

  IF v_valid_count <> cardinality(v_track_ids) THEN
    RAISE EXCEPTION 'One or more tracks are unavailable or not owned PromptBeats uploads';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_version_tracks pvt
    WHERE pvt.user_id = v_user_id
      AND pvt.version_prompt_id = _version_prompt_id
      AND pvt.track_id = ANY(v_track_ids)
  ) THEN
    RAISE EXCEPTION 'One or more tracks are already linked to this version';
  END IF;

  INSERT INTO public.project_version_tracks (
    user_id, project_id, version_prompt_id, track_id
  )
  SELECT v_user_id, _project_id, _version_prompt_id, track_id
  FROM unnest(v_track_ids) AS track_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'linked_count', v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_project_version_track(
  _project_id uuid,
  _version_prompt_id uuid,
  _track_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_user_id IS NULL OR public.current_user_is_banned() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.project_version_tracks
  WHERE user_id = v_user_id
    AND project_id = _project_id
    AND version_prompt_id = _version_prompt_id
    AND track_id = _track_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Linked track not found';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_primary_project_version_track(
  _project_id uuid,
  _version_prompt_id uuid,
  _track_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR public.current_user_is_banned() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.saved_prompts sp
    WHERE sp.id = _version_prompt_id
      AND sp.project_id = _project_id
      AND sp.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Project version not found';
  END IF;

  IF _track_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_version_tracks pvt
    WHERE pvt.user_id = v_user_id
      AND pvt.project_id = _project_id
      AND pvt.version_prompt_id = _version_prompt_id
      AND pvt.track_id = _track_id
  ) THEN
    RAISE EXCEPTION 'Track is not linked to this version';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_version_prompt_id::text, 0));

  UPDATE public.project_version_tracks
  SET is_primary = false
  WHERE user_id = v_user_id
    AND project_id = _project_id
    AND version_prompt_id = _version_prompt_id
    AND is_primary = true;

  IF _track_id IS NOT NULL THEN
    UPDATE public.project_version_tracks
    SET is_primary = true
    WHERE user_id = v_user_id
      AND project_id = _project_id
      AND version_prompt_id = _version_prompt_id
      AND track_id = _track_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'primary_track_id', _track_id);
END;
$$;

REVOKE ALL ON FUNCTION public.link_project_version_tracks(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_project_version_track(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_primary_project_version_track(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_project_version_tracks(uuid, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlink_project_version_track(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_primary_project_version_track(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copy_project_version_track_links_on_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_project_id uuid;
  v_expected_source_project_id uuid;
BEGIN
  IF NEW.project_id IS NULL OR NEW.duplicated_from_prompt_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sp.project_id
  INTO v_source_project_id
  FROM public.saved_prompts sp
  WHERE sp.id = NEW.duplicated_from_prompt_id
    AND sp.user_id = NEW.user_id;

  SELECT p.duplicated_from_project_id
  INTO v_expected_source_project_id
  FROM public.prompt_projects p
  WHERE p.id = NEW.project_id
    AND p.user_id = NEW.user_id;

  IF v_source_project_id IS NULL
     OR v_expected_source_project_id IS NULL
     OR v_source_project_id <> v_expected_source_project_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.project_version_tracks (
    user_id,
    project_id,
    version_prompt_id,
    track_id,
    is_primary,
    created_at
  )
  SELECT
    NEW.user_id,
    NEW.project_id,
    NEW.id,
    source_link.track_id,
    source_link.is_primary,
    source_link.created_at
  FROM public.project_version_tracks source_link
  WHERE source_link.user_id = NEW.user_id
    AND source_link.project_id = v_source_project_id
    AND source_link.version_prompt_id = NEW.duplicated_from_prompt_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copy_project_version_track_links_on_duplicate ON public.saved_prompts;
CREATE TRIGGER trg_copy_project_version_track_links_on_duplicate
AFTER INSERT ON public.saved_prompts
FOR EACH ROW EXECUTE FUNCTION public.copy_project_version_track_links_on_duplicate();

REVOKE ALL ON FUNCTION public.copy_project_version_track_links_on_duplicate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_project_version_track_links_on_duplicate() TO service_role;

COMMIT;
