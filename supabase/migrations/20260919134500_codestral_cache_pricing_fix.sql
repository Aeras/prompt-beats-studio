-- Correct Codestral 25.08 cache pricing metadata.
-- Mistral publishes standard input/output token prices for codestral-2508,
-- but does not publish a separate cached-input or cache-write token rate
-- compatible with PromptBeats' calculator. Keep those fields NULL rather
-- than inferring a discount.
UPDATE public.ai_models
SET
  cached_input_price_per_million = NULL,
  cache_write_price_per_million = NULL,
  pricing_status = 'verified',
  pricing_updated_at = now(),
  updated_at = now()
WHERE provider_model_id = 'codestral-2508';
