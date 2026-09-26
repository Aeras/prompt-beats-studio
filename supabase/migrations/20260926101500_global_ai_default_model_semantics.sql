-- Global operation defaults are authoritative for every user, while model access
-- policy continues to control which non-default models a user may choose.
--
-- This forward-only migration supersedes FINAL-003's earlier requirement that a
-- default model itself must have access_policy = all_users. Defaults still must
-- be enabled and technically eligible for the operation they serve.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_ai_default_model_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_model_id text;
  v_model public.ai_models%ROWTYPE;
BEGIN
  IF NEW.key NOT IN (
    'ai_model',
    'ai_generator_default_model',
    'ai_quality_check_default_model',
    'ai_tools_default_model'
  ) THEN
    RETURN NEW;
  END IF;

  v_model_id := NULLIF(trim(NEW.value ->> 'model'), '');
  IF v_model_id IS NULL THEN
    RAISE EXCEPTION 'AI default setting requires a model id';
  END IF;

  SELECT *
  INTO v_model
  FROM public.ai_models
  WHERE provider_model_id = v_model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI default model is not installed';
  END IF;

  IF v_model.status <> 'enabled' THEN
    RAISE EXCEPTION 'AI default model must be enabled';
  END IF;

  IF NEW.key IN ('ai_model', 'ai_generator_default_model', 'ai_tools_default_model')
     AND (
       COALESCE(v_model.generator_compatible, false) IS NOT TRUE
       OR COALESCE(v_model.generator_enabled, false) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'AI default model is not eligible for Generator/AI Tools';
  END IF;

  IF NEW.key IN ('ai_model', 'ai_quality_check_default_model')
     AND (
       COALESCE(v_model.quality_check_compatible, false) IS NOT TRUE
       OR COALESCE(v_model.quality_check_enabled, false) IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'AI default model is not eligible for Quality Check';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_default_model_invariant()
  FROM PUBLIC, anon, authenticated;

COMMIT;
