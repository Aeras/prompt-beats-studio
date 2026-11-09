-- Keep job scopes canonical without restricting independent history reads.
-- Read RPCs may request a single Project or Song Universe scope; job admission
-- requires a linked Project's paired Universe to be persisted on the job.
BEGIN;

CREATE OR REPLACE FUNCTION public.generator_creative_direction_scopes_owned(_user_id uuid, _scopes jsonb)
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

CREATE OR REPLACE FUNCTION public.guard_generator_creative_direction_history_job()
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
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_config->'scopes') AS requested(value)
    JOIN public.song_universe_projects membership
      ON membership.project_id = (requested.value->>'id')::uuid
    WHERE requested.value->>'type' = 'project'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_config->'scopes') AS paired(value)
        WHERE paired.value->>'type' = 'song_universe'
          AND paired.value->>'id' = membership.universe_id::text
      )
  ) THEN
    RAISE EXCEPTION 'linked Project history requires its Song Universe scope';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.guard_generator_creative_direction_history_job()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
