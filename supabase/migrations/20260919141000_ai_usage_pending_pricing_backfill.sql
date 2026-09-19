-- Track AI usage independently from pricing and automatically backfill
-- costs once verified pricing becomes available for a model.
--
-- Historical rule:
--   * Existing non-NULL estimated_cost_usd values are never overwritten.
--   * Only usage rows with NULL cost are eligible for backfill.
--
-- This lets PromptBeats safely record token usage for newly added models even
-- when pricing has not been entered yet, then price those rows later without
-- losing the original usage data.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer,
  ADD COLUMN IF NOT EXISTS cache_write_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_status text,
  ADD COLUMN IF NOT EXISTS cost_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_status_at_recording text;

ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_cost_status_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_cost_status_check
  CHECK (cost_status IS NULL OR cost_status IN ('calculated','pending_pricing','usage_unavailable'));

ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_pricing_status_at_recording_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_pricing_status_at_recording_check
  CHECK (
    pricing_status_at_recording IS NULL OR
    pricing_status_at_recording IN ('verified','unknown','outdated','missing')
  );

-- Classify legacy rows without pretending to know the historical pricing status.
UPDATE public.ai_usage_logs
SET
  cost_status = CASE
    WHEN estimated_cost_usd IS NOT NULL THEN 'calculated'
    WHEN input_tokens IS NULL AND output_tokens IS NULL THEN 'usage_unavailable'
    ELSE 'pending_pricing'
  END,
  cost_calculated_at = CASE
    WHEN estimated_cost_usd IS NOT NULL THEN COALESCE(cost_calculated_at, created_at)
    ELSE cost_calculated_at
  END
WHERE cost_status IS NULL;

CREATE OR REPLACE FUNCTION public._calculate_ai_usage_cost(
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cached_input_tokens integer DEFAULT NULL,
  p_cache_write_tokens integer DEFAULT NULL
)
RETURNS numeric(12,6)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_input_price numeric;
  v_output_price numeric;
  v_cached_input_price numeric;
  v_cache_write_price numeric;
  v_total_input numeric;
  v_cached_input numeric;
  v_cache_write numeric;
  v_uncached_input numeric;
  v_cost numeric;
BEGIN
  IF p_input_tokens IS NULL AND p_output_tokens IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    input_price_per_million,
    output_price_per_million,
    cached_input_price_per_million,
    cache_write_price_per_million
  INTO
    v_input_price,
    v_output_price,
    v_cached_input_price,
    v_cache_write_price
  FROM public.ai_models
  WHERE provider_model_id = p_model
    AND pricing_status = 'verified'
    AND input_price_per_million IS NOT NULL
    AND output_price_per_million IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_total_input := GREATEST(COALESCE(p_input_tokens, 0), 0);
  v_cached_input := LEAST(
    v_total_input,
    GREATEST(COALESCE(p_cached_input_tokens, 0), 0)
  );
  v_cache_write := LEAST(
    GREATEST(v_total_input - v_cached_input, 0),
    GREATEST(COALESCE(p_cache_write_tokens, 0), 0)
  );
  v_uncached_input := GREATEST(v_total_input - v_cached_input - v_cache_write, 0);

  v_cost :=
    (v_uncached_input / 1000000.0) * v_input_price +
    (v_cached_input / 1000000.0) * COALESCE(v_cached_input_price, v_input_price) +
    (v_cache_write / 1000000.0) * COALESCE(v_cache_write_price, v_input_price) +
    (GREATEST(COALESCE(p_output_tokens, 0), 0) / 1000000.0) * v_output_price;

  RETURN ROUND(v_cost, 6);
END;
$$;

REVOKE ALL ON FUNCTION public._calculate_ai_usage_cost(text, integer, integer, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._calculate_ai_usage_cost(text, integer, integer, integer, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public._price_ai_usage_log_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pricing_status text;
BEGIN
  SELECT pricing_status
  INTO v_pricing_status
  FROM public.ai_models
  WHERE provider_model_id = NEW.model
  LIMIT 1;

  NEW.pricing_status_at_recording := COALESCE(v_pricing_status, 'missing');

  IF NEW.input_tokens IS NULL AND NEW.output_tokens IS NULL THEN
    NEW.estimated_cost_usd := NULL;
    NEW.cost_status := 'usage_unavailable';
    NEW.cost_calculated_at := NULL;
    RETURN NEW;
  END IF;

  NEW.estimated_cost_usd := public._calculate_ai_usage_cost(
    NEW.model,
    NEW.input_tokens,
    NEW.output_tokens,
    NEW.cached_input_tokens,
    NEW.cache_write_tokens
  );

  IF NEW.estimated_cost_usd IS NULL THEN
    NEW.cost_status := 'pending_pricing';
    NEW.cost_calculated_at := NULL;
  ELSE
    NEW.cost_status := 'calculated';
    NEW.cost_calculated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_usage_logs_price_before_insert ON public.ai_usage_logs;
CREATE TRIGGER ai_usage_logs_price_before_insert
BEFORE INSERT ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public._price_ai_usage_log_before_insert();

CREATE OR REPLACE FUNCTION public.backfill_pending_ai_usage_costs(p_model text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.ai_usage_logs AS l
  SET
    estimated_cost_usd = public._calculate_ai_usage_cost(
      l.model,
      l.input_tokens,
      l.output_tokens,
      l.cached_input_tokens,
      l.cache_write_tokens
    ),
    cost_status = 'calculated',
    cost_calculated_at = now()
  WHERE l.model = p_model
    AND l.estimated_cost_usd IS NULL
    AND l.cost_status = 'pending_pricing'
    AND (l.input_tokens IS NOT NULL OR l.output_tokens IS NOT NULL)
    AND public._calculate_ai_usage_cost(
      l.model,
      l.input_tokens,
      l.output_tokens,
      l.cached_input_tokens,
      l.cache_write_tokens
    ) IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_pending_ai_usage_costs(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_pending_ai_usage_costs(text)
TO service_role;

CREATE OR REPLACE FUNCTION public._backfill_ai_usage_when_pricing_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.pricing_status = 'verified'
     AND NEW.input_price_per_million IS NOT NULL
     AND NEW.output_price_per_million IS NOT NULL THEN
    PERFORM public.backfill_pending_ai_usage_costs(NEW.provider_model_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_models_backfill_pricing_after_insert ON public.ai_models;
CREATE TRIGGER ai_models_backfill_pricing_after_insert
AFTER INSERT ON public.ai_models
FOR EACH ROW
EXECUTE FUNCTION public._backfill_ai_usage_when_pricing_verified();

DROP TRIGGER IF EXISTS ai_models_backfill_pricing_after_update ON public.ai_models;
CREATE TRIGGER ai_models_backfill_pricing_after_update
AFTER UPDATE OF
  input_price_per_million,
  output_price_per_million,
  cached_input_price_per_million,
  cache_write_price_per_million,
  pricing_status
ON public.ai_models
FOR EACH ROW
EXECUTE FUNCTION public._backfill_ai_usage_when_pricing_verified();

-- Backfill legacy NULL-cost rows now that the registry has verified pricing.
DO $$
DECLARE
  v_model record;
BEGIN
  FOR v_model IN
    SELECT provider_model_id
    FROM public.ai_models
    WHERE pricing_status = 'verified'
      AND input_price_per_million IS NOT NULL
      AND output_price_per_million IS NOT NULL
  LOOP
    PERFORM public.backfill_pending_ai_usage_costs(v_model.provider_model_id);
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS ai_usage_logs_cost_status_idx
ON public.ai_usage_logs (cost_status, model);
