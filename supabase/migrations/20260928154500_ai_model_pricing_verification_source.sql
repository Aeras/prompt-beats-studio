-- Track where AI model pricing verification came from without changing the
-- existing rule that public.ai_models remains the source of truth for runtime cost accounting.
ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS pricing_source text,
  ADD COLUMN IF NOT EXISTS pricing_source_url text,
  ADD COLUMN IF NOT EXISTS pricing_checked_at timestamptz;

ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_pricing_source_check;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_pricing_source_check
  CHECK (
    pricing_source IS NULL OR
    pricing_source IN ('provider_metadata','official_docs','verified_catalog','unverified')
  );

COMMENT ON COLUMN public.ai_models.pricing_source IS
  'Most recent verification source for stored token pricing. DB values remain authoritative until an admin saves reviewed changes.';
COMMENT ON COLUMN public.ai_models.pricing_source_url IS
  'Official provider pricing/documentation URL used by the most recent pricing verification when available.';
COMMENT ON COLUMN public.ai_models.pricing_checked_at IS
  'Timestamp of the most recent pricing verification attempt.';
