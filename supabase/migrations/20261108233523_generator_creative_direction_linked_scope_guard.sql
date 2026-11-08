-- Keep the history scope canonical when a Project is already linked to a Song Universe.
-- Forward-only correction: the initial feature migration remains immutable.
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
  IF v_project IS NOT NULL AND v_universe IS NULL AND EXISTS (
    SELECT 1 FROM public.song_universe_projects m WHERE m.project_id = v_project
  ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_creative_direction_scopes_owned(uuid,jsonb)
  TO service_role;

COMMIT;
