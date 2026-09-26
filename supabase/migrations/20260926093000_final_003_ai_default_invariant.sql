-- FINAL-003: preserve the canonical global AI default invariant at the DB boundary.
--
-- The modern admin mutation already requires enabled + all_users defaults. The
-- older shared `setActiveModel` path writes `ai_model` first and then the three
-- operation defaults. Enforcing the same rule on app_settings prevents that
-- legacy path (or any future alternate writer) from installing a restricted,
-- testing, disabled, or operation-incompatible global default.

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

  IF v_model.status <> 'enabled' OR v_model.access_policy <> 'all_users' THEN
    RAISE EXCEPTION 'AI default model must be enabled and available to all users';
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

DROP TRIGGER IF EXISTS enforce_ai_default_model_invariant_trigger
  ON public.app_settings;

CREATE TRIGGER enforce_ai_default_model_invariant_trigger
BEFORE INSERT OR UPDATE OF key, value ON public.app_settings
FOR EACH ROW
WHEN (
  NEW.key IN (
    'ai_model',
    'ai_generator_default_model',
    'ai_quality_check_default_model',
    'ai_tools_default_model'
  )
)
EXECUTE FUNCTION public.enforce_ai_default_model_invariant();

COMMIT;
