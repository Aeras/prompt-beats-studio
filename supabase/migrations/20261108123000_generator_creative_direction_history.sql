BEGIN;

CREATE TABLE public.generator_creative_direction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('project','song_universe','session')),
  scope_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.ai_generation_jobs(id) ON DELETE CASCADE,
  direction jsonb NOT NULL CHECK (
    jsonb_typeof(direction) = 'object'
    AND (direction - ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity']::text[]) = '{}'::jsonb
    AND direction ?& ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity']
    AND jsonb_typeof(direction->'coreIdea') = 'string'
    AND length(btrim(direction->>'coreIdea')) BETWEEN 1 AND 140
    AND jsonb_typeof(direction->'narrator') = 'string'
    AND length(direction->>'narrator') <= 140
    AND jsonb_typeof(direction->'emotionalApproach') = 'string'
    AND length(direction->>'emotionalApproach') <= 140
    AND jsonb_typeof(direction->'hookIdentity') = 'string'
    AND length(direction->>'hookIdentity') <= 140
    AND jsonb_typeof(direction->'sonicIdentity') = 'string'
    AND length(direction->>'sonicIdentity') <= 140
    AND length(direction->>'coreIdea') + length(direction->>'narrator')
      + length(direction->>'emotionalApproach') + length(direction->>'hookIdentity')
      + length(direction->>'sonicIdentity') <= 560
    AND position(chr(10) in concat_ws('', direction->>'coreIdea', direction->>'narrator',
      direction->>'emotionalApproach', direction->>'hookIdentity', direction->>'sonicIdentity')) = 0
    AND position(chr(13) in concat_ws('', direction->>'coreIdea', direction->>'narrator',
      direction->>'emotionalApproach', direction->>'hookIdentity', direction->>'sonicIdentity')) = 0
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (job_id, scope_type, scope_id)
);

CREATE INDEX generator_creative_direction_history_scope_recent_idx
  ON public.generator_creative_direction_history(user_id, scope_type, scope_id, created_at DESC, id DESC);

ALTER TABLE public.generator_creative_direction_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.generator_creative_direction_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.generator_creative_direction_history TO service_role;

CREATE FUNCTION public.clear_generator_creative_direction_scope_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_scope_type text; v_owner uuid;
BEGIN
  IF TG_TABLE_NAME = 'prompt_projects' THEN
    v_scope_type := 'project';
    v_owner := OLD.user_id;
  ELSIF TG_TABLE_NAME = 'song_universes' THEN
    v_scope_type := 'song_universe';
    v_owner := OLD.owner_id;
  ELSE
    RAISE EXCEPTION 'unsupported creative history scope table';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('generator_creative_direction_history:' || v_owner::text, 0)
  );
  DELETE FROM public.generator_creative_direction_history
  WHERE user_id = v_owner AND scope_type = v_scope_type AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER delete_prompt_project_creative_direction_history
AFTER DELETE ON public.prompt_projects
FOR EACH ROW EXECUTE FUNCTION public.clear_generator_creative_direction_scope_history();

CREATE TRIGGER delete_song_universe_creative_direction_history
AFTER DELETE ON public.song_universes
FOR EACH ROW EXECUTE FUNCTION public.clear_generator_creative_direction_scope_history();

CREATE FUNCTION public.generator_creative_direction_scopes_owned(_user_id uuid, _scopes jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_project uuid;
  v_universe uuid;
  v_session boolean := false;
  v_scope jsonb;
BEGIN
  IF _user_id IS NULL OR jsonb_typeof(_scopes) <> 'array' THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(_scopes);
  IF v_count < 1 OR v_count > 2 THEN RETURN false; END IF;

  FOR v_scope IN SELECT value FROM jsonb_array_elements(_scopes) AS x(value) LOOP
    IF jsonb_typeof(v_scope) <> 'object'
       OR (v_scope - ARRAY['type','id']::text[]) <> '{}'::jsonb
       OR NOT (v_scope ?& ARRAY['type','id'])
       OR jsonb_typeof(v_scope->'type') <> 'string'
       OR jsonb_typeof(v_scope->'id') <> 'string'
       OR (v_scope->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    IF v_scope->>'type' = 'project' THEN
      IF v_project IS NOT NULL THEN RETURN false; END IF;
      v_project := (v_scope->>'id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.prompt_projects p WHERE p.id = v_project AND p.user_id = _user_id
      ) THEN RETURN false; END IF;
    ELSIF v_scope->>'type' = 'song_universe' THEN
      IF v_universe IS NOT NULL THEN RETURN false; END IF;
      v_universe := (v_scope->>'id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.song_universes u WHERE u.id = v_universe AND u.owner_id = _user_id
      ) THEN RETURN false; END IF;
    ELSIF v_scope->>'type' = 'session' THEN
      IF v_session OR v_count <> 1 THEN RETURN false; END IF;
      v_session := true;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  IF v_count = 2 AND (v_project IS NULL OR v_universe IS NULL) THEN RETURN false; END IF;
  IF v_count = 2 AND (
    _scopes->0->>'type' IS DISTINCT FROM 'project'
    OR _scopes->1->>'type' IS DISTINCT FROM 'song_universe'
  ) THEN RETURN false; END IF;
  IF v_project IS NOT NULL AND v_universe IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.song_universe_projects m
    WHERE m.project_id = v_project AND m.universe_id = v_universe
  ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

CREATE FUNCTION public.guard_generator_creative_direction_history_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_config jsonb;
BEGIN
  IF NEW.input_payload IS NULL OR jsonb_typeof(NEW.input_payload) <> 'object'
     OR NOT (NEW.input_payload ? 'creativeDirectionHistory') THEN RETURN NEW; END IF;
  v_config := NEW.input_payload->'creativeDirectionHistory';
  IF jsonb_typeof(v_config) <> 'object'
     OR (v_config - ARRAY['version','scopes']::text[]) <> '{}'::jsonb
     OR NOT (v_config ?& ARRAY['version','scopes'])
     OR v_config->>'version' <> '1'
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.user_id = NEW.user_id AND r.role = 'super_admin'::public.app_role
         AND r.moderation_status = 'active'
     )
     OR NEW.input_payload->>'operation' IS DISTINCT FROM 'generate'
     OR NEW.input_payload#>>'{inputSnapshot,generatorMode}' IS DISTINCT FROM 'advanced'
     OR NOT public.generator_creative_direction_scopes_owned(NEW.user_id, v_config->'scopes') THEN
    RAISE EXCEPTION 'creative direction history is not allowed for this generation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_generator_creative_direction_history_job
BEFORE INSERT OR UPDATE OF input_payload ON public.ai_generation_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_generator_creative_direction_history_job();

CREATE FUNCTION public.read_generator_creative_direction_history(_user_id uuid, _scopes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_history jsonb;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.user_id = _user_id AND r.role = 'super_admin'::public.app_role
         AND r.moderation_status = 'active'
     )
     OR NOT public.generator_creative_direction_scopes_owned(_user_id, _scopes) THEN
    RAISE EXCEPTION 'creative direction history is not available';
  END IF;
  WITH requested AS (
    SELECT value->>'type' AS scope_type, (value->>'id')::uuid AS scope_id
    FROM jsonb_array_elements(_scopes) AS x(value)
  ),
  deduped AS (
    SELECT DISTINCT ON (h.job_id) h.job_id, h.direction, h.created_at
    FROM public.generator_creative_direction_history h
    JOIN requested r ON r.scope_type = h.scope_type AND r.scope_id = h.scope_id
    WHERE h.user_id = _user_id
    ORDER BY h.job_id, h.created_at DESC, h.id DESC
  ),
  recent AS (
    SELECT direction, created_at FROM deduped
    ORDER BY created_at DESC, job_id DESC LIMIT 15
  )
  SELECT coalesce(jsonb_agg(direction ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_history FROM recent;
  RETURN v_history;
END;
$$;

CREATE FUNCTION public.complete_generation_with_creative_direction_history(
  _job_id uuid,
  _user_id uuid,
  _result jsonb,
  _direction jsonb,
  _provider text,
  _model text,
  _attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_config jsonb;
  v_scope jsonb;
  v_type text;
  v_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.ai_generation_jobs
  WHERE id = _job_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'generation job not found'; END IF;

  IF v_job.status = 'completed' THEN
    -- A duplicate completion is a successful no-op even if this direction has
    -- since aged out of the 15-row retention window or its scope was deleted.
    RETURN true;
  END IF;
  IF v_job.status <> 'processing' OR v_job.cancel_requested_at IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.user_id = _user_id AND r.role = 'super_admin'::public.app_role
         AND r.moderation_status = 'active'
     ) THEN
    RAISE EXCEPTION 'generation job is no longer eligible for completion';
  END IF;

  v_config := v_job.input_payload->'creativeDirectionHistory';
  IF jsonb_typeof(v_config) <> 'object' OR v_config->>'version' <> '1'
     OR jsonb_typeof(v_config->'scopes') <> 'array' THEN
    RAISE EXCEPTION 'creative direction history configuration is invalid';
  END IF;
  -- Serialize the user's history writes/deletes before checking ownership.
  -- A single lock avoids deadlocks when one transaction deletes multiple scopes.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('generator_creative_direction_history:' || _user_id::text, 0)
  );
  IF NOT public.generator_creative_direction_scopes_owned(_user_id, v_config->'scopes') THEN
    RAISE EXCEPTION 'creative direction history configuration is invalid';
  END IF;
  IF jsonb_typeof(_result) <> 'object' OR (_result - ARRAY['title','tags','lyrics','note']::text[]) <> '{}'::jsonb
     OR NOT (_result ?& ARRAY['title','tags','lyrics','note'])
     OR jsonb_typeof(_result->'title') <> 'string'
     OR jsonb_typeof(_result->'tags') <> 'string'
     OR jsonb_typeof(_result->'lyrics') <> 'string'
     OR jsonb_typeof(_result->'note') <> 'string' THEN
    RAISE EXCEPTION 'user song result must retain its four-field contract';
  END IF;
  IF jsonb_typeof(_direction) <> 'object' OR (_direction - ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity']::text[]) <> '{}'::jsonb
     OR NOT (_direction ?& ARRAY['coreIdea','narrator','emotionalApproach','hookIdentity','sonicIdentity'])
     OR jsonb_typeof(_direction->'coreIdea') <> 'string'
     OR length(btrim(_direction->>'coreIdea')) NOT BETWEEN 1 AND 140
     OR jsonb_typeof(_direction->'narrator') <> 'string'
     OR length(_direction->>'narrator') > 140
     OR jsonb_typeof(_direction->'emotionalApproach') <> 'string'
     OR length(_direction->>'emotionalApproach') > 140
     OR jsonb_typeof(_direction->'hookIdentity') <> 'string'
     OR length(_direction->>'hookIdentity') > 140
     OR jsonb_typeof(_direction->'sonicIdentity') <> 'string'
     OR length(_direction->>'sonicIdentity') > 140
     OR length(_direction->>'coreIdea') + length(_direction->>'narrator')
       + length(_direction->>'emotionalApproach') + length(_direction->>'hookIdentity')
       + length(_direction->>'sonicIdentity') > 560
     OR position(chr(10) in concat_ws('', _direction->>'coreIdea', _direction->>'narrator',
       _direction->>'emotionalApproach', _direction->>'hookIdentity', _direction->>'sonicIdentity')) > 0
     OR position(chr(13) in concat_ws('', _direction->>'coreIdea', _direction->>'narrator',
       _direction->>'emotionalApproach', _direction->>'hookIdentity', _direction->>'sonicIdentity')) > 0 THEN
    RAISE EXCEPTION 'creative direction metadata is invalid';
  END IF;

  UPDATE public.ai_generation_jobs SET status = 'completed', result = _result,
    provider = _provider, model = _model, error = NULL, attempts = _attempts,
    completed_at = now()
  WHERE id = _job_id AND user_id = _user_id
    AND status = 'processing' AND cancel_requested_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'generation completion lost cancellation race'; END IF;

  FOR v_scope IN SELECT value FROM jsonb_array_elements(v_config->'scopes') AS x(value) LOOP
    v_type := v_scope->>'type';
    v_id := (v_scope->>'id')::uuid;
    INSERT INTO public.generator_creative_direction_history(user_id, scope_type, scope_id, job_id, direction)
    VALUES (_user_id, v_type, v_id, _job_id, _direction)
    ON CONFLICT (job_id, scope_type, scope_id) DO NOTHING;

    DELETE FROM public.generator_creative_direction_history h
    USING (
      SELECT id, row_number() OVER (ORDER BY created_at DESC, id DESC) AS position
      FROM public.generator_creative_direction_history
      WHERE user_id = _user_id AND scope_type = v_type AND scope_id = v_id
    ) ranked
    WHERE h.id = ranked.id AND ranked.position > 15;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.guard_generator_creative_direction_history_job() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_generator_creative_direction_scope_history() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_generator_creative_direction_history(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_generator_creative_direction_history(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer) TO service_role;

COMMIT;
