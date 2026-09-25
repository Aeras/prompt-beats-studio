-- Song Universe: private multi-song creative continuity layer.

INSERT INTO public.feature_access_policies(feature_key, display_name, description, access_mode)
VALUES (
  'song_universe',
  'Song Universes',
  'Private multi-song creative worlds, Creative Bible context and continuity tools.',
  'everyone'
)
ON CONFLICT (feature_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.song_universes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text,
  universe_type text NOT NULL DEFAULT 'other'
    CHECK (universe_type IN ('album','ep','song_series','creative_era','other')),
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','writing','production','review','complete','archived')),
  creative_bible jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  initial_direction text,
  cover_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS song_universes_owner_updated_idx
  ON public.song_universes(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS song_universes_owner_status_idx
  ON public.song_universes(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.song_universe_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL REFERENCES public.song_universes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  universe_role text,
  project_status text NOT NULL DEFAULT 'idea'
    CHECK (project_status IN ('idea','draft','in_progress','review','final')),
  intentional_outlier boolean NOT NULL DEFAULT false,
  inherited_traits jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_universe_projects_one_universe_per_project UNIQUE(project_id),
  CONSTRAINT song_universe_projects_position_key UNIQUE(universe_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS song_universe_projects_universe_position_idx
  ON public.song_universe_projects(universe_id, position);

CREATE TABLE IF NOT EXISTS public.song_universe_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL REFERENCES public.song_universes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_type text NOT NULL
    CHECK (analysis_type IN ('continuity','motif_usage','project_fit','context_summary','creative_bible')),
  source_revision text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS song_universe_ai_analyses_universe_created_idx
  ON public.song_universe_ai_analyses(universe_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.song_universe_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_universes_touch_updated_at ON public.song_universes;
CREATE TRIGGER song_universes_touch_updated_at
BEFORE UPDATE ON public.song_universes
FOR EACH ROW EXECUTE FUNCTION public.song_universe_touch_updated_at();

DROP TRIGGER IF EXISTS song_universe_projects_touch_updated_at ON public.song_universe_projects;
CREATE TRIGGER song_universe_projects_touch_updated_at
BEFORE UPDATE ON public.song_universe_projects
FOR EACH ROW EXECUTE FUNCTION public.song_universe_touch_updated_at();

CREATE OR REPLACE FUNCTION public.song_universe_validate_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.song_universes WHERE id = NEW.universe_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Song Universe not found.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = NEW.project_id AND p.user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'Project does not belong to the Song Universe owner.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_universe_validate_project_owner_trigger ON public.song_universe_projects;
CREATE TRIGGER song_universe_validate_project_owner_trigger
BEFORE INSERT OR UPDATE OF universe_id, project_id
ON public.song_universe_projects
FOR EACH ROW EXECUTE FUNCTION public.song_universe_validate_project_owner();

CREATE OR REPLACE FUNCTION public.song_universe_validate_analysis_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = NEW.universe_id AND u.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Song Universe does not belong to this user.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_universe_validate_analysis_owner_trigger ON public.song_universe_ai_analyses;
CREATE TRIGGER song_universe_validate_analysis_owner_trigger
BEFORE INSERT OR UPDATE OF universe_id, owner_id
ON public.song_universe_ai_analyses
FOR EACH ROW EXECUTE FUNCTION public.song_universe_validate_analysis_owner();

ALTER TABLE public.song_universes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_universe_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_universe_ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS song_universes_owner_all ON public.song_universes;
CREATE POLICY song_universes_owner_all ON public.song_universes
FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS song_universe_projects_owner_select ON public.song_universe_projects;
CREATE POLICY song_universe_projects_owner_select ON public.song_universe_projects
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.song_universes u
  WHERE u.id = universe_id AND u.owner_id = auth.uid()
));
DROP POLICY IF EXISTS song_universe_projects_owner_insert ON public.song_universe_projects;
CREATE POLICY song_universe_projects_owner_insert ON public.song_universe_projects
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.song_universes u
  WHERE u.id = universe_id AND u.owner_id = auth.uid()
));
DROP POLICY IF EXISTS song_universe_projects_owner_update ON public.song_universe_projects;
CREATE POLICY song_universe_projects_owner_update ON public.song_universe_projects
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.song_universes u
  WHERE u.id = universe_id AND u.owner_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.song_universes u
  WHERE u.id = universe_id AND u.owner_id = auth.uid()
));
DROP POLICY IF EXISTS song_universe_projects_owner_delete ON public.song_universe_projects;
CREATE POLICY song_universe_projects_owner_delete ON public.song_universe_projects
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.song_universes u
  WHERE u.id = universe_id AND u.owner_id = auth.uid()
));

DROP POLICY IF EXISTS song_universe_ai_analyses_owner_all ON public.song_universe_ai_analyses;
CREATE POLICY song_universe_ai_analyses_owner_all ON public.song_universe_ai_analyses
FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

REVOKE ALL ON public.song_universes FROM anon;
REVOKE ALL ON public.song_universe_projects FROM anon;
REVOKE ALL ON public.song_universe_ai_analyses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_universes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_universe_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_universe_ai_analyses TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_song_universe_projects(_universe_id uuid, _membership_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = _universe_id AND u.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Song Universe not found.';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.song_universe_projects WHERE universe_id = _universe_id;
  IF v_count <> coalesce(array_length(_membership_ids, 1), 0)
     OR EXISTS (
       SELECT 1 FROM unnest(_membership_ids) AS supplied(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.song_universe_projects p
         WHERE p.id = supplied.id AND p.universe_id = _universe_id
       )
     )
     OR (SELECT count(DISTINCT id) FROM unnest(_membership_ids) AS supplied(id)) <> v_count
  THEN
    RAISE EXCEPTION 'Invalid Song Universe project order.';
  END IF;
  SET CONSTRAINTS song_universe_projects_position_key DEFERRED;
  UPDATE public.song_universe_projects p
  SET position = ordered.position
  FROM (
    SELECT id, ordinality::integer - 1 AS position
    FROM unnest(_membership_ids) WITH ORDINALITY AS u(id, ordinality)
  ) ordered
  WHERE p.id = ordered.id AND p.universe_id = _universe_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_song_universe_projects(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_song_universe_projects(uuid, uuid[]) TO authenticated, service_role;

-- Song Universe AI uses the same durable auxiliary-AI admission infrastructure.
ALTER TABLE public.ai_auxiliary_admissions
  DROP CONSTRAINT IF EXISTS ai_auxiliary_admissions_operation_check;
ALTER TABLE public.ai_auxiliary_admissions
  ADD CONSTRAINT ai_auxiliary_admissions_operation_check
  CHECK (operation IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe'));

CREATE OR REPLACE FUNCTION public.admit_auxiliary_ai_request(
  _operation text,
  _limit_per_hour integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe') THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;
  IF _limit_per_hour < 1 OR _limit_per_hour > 100 THEN RAISE EXCEPTION 'invalid AI rate limit'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  IF public._is_admin_level_internal(v_user) THEN RETURN true; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai:' || v_user::text, 0));
  SELECT count(*)::integer INTO v_used
  FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user AND operation = _operation AND created_at > now() - interval '1 hour';
  IF v_used >= _limit_per_hour THEN RETURN false; END IF;
  INSERT INTO public.ai_auxiliary_admissions(user_id, operation) VALUES (v_user, _operation);
  DELETE FROM public.ai_auxiliary_admissions WHERE user_id = v_user AND created_at < now() - interval '7 days';
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admit_auxiliary_ai_request(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_auxiliary_ai_request(text, integer) TO authenticated, service_role;
