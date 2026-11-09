-- Align complete_generation_with_creative_direction_history limits with the 200/1000 capacity expansion.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_generation_with_creative_direction_history(
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
     OR length(btrim(_direction->>'coreIdea')) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(_direction->'narrator') <> 'string'
     OR length(_direction->>'narrator') > 200
     OR jsonb_typeof(_direction->'emotionalApproach') <> 'string'
     OR length(_direction->>'emotionalApproach') > 200
     OR jsonb_typeof(_direction->'hookIdentity') <> 'string'
     OR length(_direction->>'hookIdentity') > 200
     OR jsonb_typeof(_direction->'sonicIdentity') <> 'string'
     OR length(_direction->>'sonicIdentity') > 200
     OR length(_direction->>'coreIdea') + length(_direction->>'narrator')
       + length(_direction->>'emotionalApproach') + length(_direction->>'hookIdentity')
       + length(_direction->>'sonicIdentity') > 1000
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

REVOKE ALL ON FUNCTION public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_generation_with_creative_direction_history(uuid,uuid,jsonb,jsonb,text,text,integer) TO service_role;

COMMIT;
