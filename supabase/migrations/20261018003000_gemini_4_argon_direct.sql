-- Gemini 4 Argon: direct Google Gemini model.
-- Enabled for Generator, AI Tools and Quality Check. Music Analyzer support is
-- built into the application code and does not require an app_settings entry.

INSERT INTO public.ai_models (
  provider,
  provider_model_id,
  display_name,
  status,
  access_policy,
  generator_compatible,
  generator_enabled,
  generator_reasoning_effort,
  quality_check_compatible,
  quality_check_enabled,
  quality_check_reasoning_effort,
  structured_output_supported,
  reasoning_supported,
  usage_reporting_supported,
  context_window,
  max_output_tokens,
  input_price_per_million,
  output_price_per_million,
  cached_input_price_per_million,
  pricing_currency,
  pricing_status,
  pricing_updated_at,
  pricing_source,
  pricing_source_url,
  pricing_checked_at,
  preview,
  deprecated,
  notes,
  updated_at
) VALUES (
  'gemini',
  'gemini-4-argon',
  'Gemini 4 Argon',
  'enabled',
  'all_users',
  true,
  true,
  'medium',
  true,
  true,
  'high',
  true,
  true,
  true,
  1048576,
  65536,
  2.000000,
  10.000000,
  0.100000,
  'USD',
  'verified',
  now(),
  'official_documentation',
  'https://ai.google.dev/gemini-api/docs/pricing',
  now(),
  false,
  false,
  'Direct Google Gemini API. Stable GA model with text/image/video/audio/PDF input and text output. Introductory pricing is valid through 2026-11-30 and must be refreshed before 2026-12-01.',
  now()
)
ON CONFLICT (provider, provider_model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  access_policy = EXCLUDED.access_policy,
  generator_compatible = EXCLUDED.generator_compatible,
  generator_enabled = EXCLUDED.generator_enabled,
  generator_reasoning_effort = EXCLUDED.generator_reasoning_effort,
  quality_check_compatible = EXCLUDED.quality_check_compatible,
  quality_check_enabled = EXCLUDED.quality_check_enabled,
  quality_check_reasoning_effort = EXCLUDED.quality_check_reasoning_effort,
  structured_output_supported = EXCLUDED.structured_output_supported,
  reasoning_supported = EXCLUDED.reasoning_supported,
  usage_reporting_supported = EXCLUDED.usage_reporting_supported,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  cached_input_price_per_million = EXCLUDED.cached_input_price_per_million,
  pricing_currency = EXCLUDED.pricing_currency,
  pricing_status = EXCLUDED.pricing_status,
  pricing_updated_at = EXCLUDED.pricing_updated_at,
  pricing_source = EXCLUDED.pricing_source,
  pricing_source_url = EXCLUDED.pricing_source_url,
  pricing_checked_at = EXCLUDED.pricing_checked_at,
  preview = false,
  deprecated = false,
  notes = EXCLUDED.notes,
  updated_at = now();

-- The user previously added Argon through OpenRouter for Music Analyzer.
-- Remove only that duplicate Analyzer entry so the selector uses the direct
-- Google model and therefore the connected Gemini billing account.
UPDATE public.app_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{models}',
  COALESCE(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(COALESCE(value->'models', '[]'::jsonb)) AS item
      WHERE NOT (
        item->>'provider' = 'openrouter'
        AND item->>'id' = 'google/gemini-4-argon'
      )
    ),
    '[]'::jsonb
  )
),
updated_at = now()
WHERE key = 'song_analyzer_extra_models';
