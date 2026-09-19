-- Make public.ai_models the single source of truth for AI token pricing.
-- Prices verified against provider-published standard API pricing on 2026-09-19.
-- PromptBeats normal Generator/QC requests use the standard short-context tiers.
-- Provider-specific long-context / priority / batch multipliers are intentionally
-- not modeled here because those modes are not used by the current app.
--
-- cache_write_price_per_million is populated only where the provider bills
-- cache writes as a per-token write rate compatible with PromptBeats' calculator.
-- Gemini context-cache storage is billed by token-hour, so it is not stored in
-- cache_write_price_per_million.

WITH pricing(provider_model_id, input_price, output_price, cached_input_price, cache_write_price) AS (
  VALUES
    ('gemini-3-flash-preview', 0.50::numeric, 3.00::numeric, 0.05::numeric, NULL::numeric),
    ('gemini-3.6-flash',       0.75::numeric, 3.75::numeric, 0.075::numeric, NULL::numeric),
    ('gemini-3.8-flash',       0.75::numeric, 3.75::numeric, 0.075::numeric, NULL::numeric),
    ('gemini-3.1-pro-preview', 2.00::numeric, 12.00::numeric, 0.20::numeric, NULL::numeric),

    ('claude-sonnet-5',        2.00::numeric, 10.00::numeric, 0.20::numeric, 2.50::numeric),
    ('claude-opus-5',          5.00::numeric, 25.00::numeric, 0.50::numeric, 6.25::numeric),
    ('claude-fable-5',        10.00::numeric, 50.00::numeric, 1.00::numeric, 12.50::numeric),

    ('grok-4.6',               2.00::numeric, 6.00::numeric, 0.50::numeric, NULL::numeric),

    ('codestral-2508',         0.30::numeric, 0.90::numeric, 0.03::numeric, NULL::numeric),

    ('gpt-5.6-luna',           0.20::numeric, 1.20::numeric, 0.02::numeric, 0.25::numeric),
    ('gpt-5.6-terra',          2.00::numeric, 12.00::numeric, 0.20::numeric, 2.50::numeric),
    ('gpt-5.6-sol',            4.00::numeric, 20.00::numeric, 0.40::numeric, 5.00::numeric),
    ('gpt-6-astra',           10.00::numeric, 50.00::numeric, 1.00::numeric, 12.50::numeric)
)
UPDATE public.ai_models AS m
SET
  input_price_per_million = p.input_price,
  output_price_per_million = p.output_price,
  cached_input_price_per_million = p.cached_input_price,
  cache_write_price_per_million = p.cache_write_price,
  pricing_currency = 'USD',
  pricing_status = 'verified',
  pricing_updated_at = now(),
  updated_at = now()
FROM pricing AS p
WHERE m.provider_model_id = p.provider_model_id;
