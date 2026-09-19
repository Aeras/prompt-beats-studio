-- Phase 1: persistent AI model registry and operation-specific defaults.
-- Browser roles cannot access this table; all reads/writes are server-side only.

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_model_id text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'testing'
    CHECK (status IN ('testing','enabled','disabled','deprecated','archived')),
  access_policy text NOT NULL DEFAULT 'admin_only'
    CHECK (access_policy IN ('admin_only','selected_users','all_users')),

  generator_compatible boolean NOT NULL DEFAULT false,
  generator_enabled boolean NOT NULL DEFAULT false,
  generator_reasoning_effort text
    CHECK (generator_reasoning_effort IS NULL OR generator_reasoning_effort IN ('none','low','medium','high','xhigh','max')),

  quality_check_compatible boolean NOT NULL DEFAULT false,
  quality_check_enabled boolean NOT NULL DEFAULT false,
  quality_check_reasoning_effort text
    CHECK (quality_check_reasoning_effort IS NULL OR quality_check_reasoning_effort IN ('none','low','medium','high','xhigh','max')),

  structured_output_supported boolean,
  reasoning_supported boolean,
  usage_reporting_supported boolean,
  context_window integer,
  max_output_tokens integer,

  input_price_per_million numeric(12,6),
  output_price_per_million numeric(12,6),
  cached_input_price_per_million numeric(12,6),
  cache_write_price_per_million numeric(12,6),
  pricing_currency text NOT NULL DEFAULT 'USD',
  pricing_status text NOT NULL DEFAULT 'unknown'
    CHECK (pricing_status IN ('verified','unknown','outdated')),
  pricing_updated_at timestamptz,

  preview boolean NOT NULL DEFAULT false,
  deprecated boolean NOT NULL DEFAULT false,
  retirement_date date,
  discovered_at timestamptz,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  health_status text NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy','degraded','failing','unknown')),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_model_id)
);

REVOKE ALL ON public.ai_models FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_models TO service_role;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_models (
  provider, provider_model_id, display_name, status, access_policy,
  generator_compatible, generator_enabled, generator_reasoning_effort,
  quality_check_compatible, quality_check_enabled, quality_check_reasoning_effort,
  structured_output_supported, reasoning_supported, usage_reporting_supported,
  input_price_per_million, output_price_per_million,
  cached_input_price_per_million, cache_write_price_per_million,
  pricing_status, pricing_updated_at, preview
) VALUES
  ('gemini','gemini-3-flash-preview','Gemini 3 Flash Preview','enabled','all_users',true,true,'medium',true,true,'high',true,false,true,0.5,3.0,NULL,NULL,'verified',now(),true),
  ('gemini','gemini-3.6-flash','Gemini 3.6 Flash','enabled','all_users',true,true,'medium',true,true,'high',true,false,true,NULL,NULL,NULL,NULL,'unknown',NULL,false),
  ('gemini','gemini-3.8-flash','Gemini 3.8 Flash','enabled','all_users',true,true,'medium',true,true,'high',true,false,true,NULL,NULL,NULL,NULL,'unknown',NULL,false),
  ('gemini','gemini-3.1-pro-preview','Gemini 3.1 Pro','enabled','all_users',true,true,'medium',true,true,'high',true,false,true,1.25,10.0,NULL,NULL,'verified',now(),true),
  ('anthropic','claude-sonnet-5','Claude Sonnet 5','enabled','all_users',true,true,'medium',true,true,'high',false,false,true,3.0,15.0,NULL,NULL,'verified',now(),false),
  ('anthropic','claude-opus-5','Claude Opus 5','enabled','all_users',true,true,'medium',true,true,'high',false,false,true,NULL,NULL,NULL,NULL,'unknown',NULL,false),
  ('anthropic','claude-fable-5','Claude Fable 5','enabled','all_users',true,true,'medium',true,true,'high',false,false,true,NULL,NULL,NULL,NULL,'unknown',NULL,false),
  ('xai','grok-4.6','Grok 4.6','enabled','all_users',true,true,'medium',true,true,'high',true,false,true,2.0,6.0,NULL,NULL,'verified',now(),false),
  ('openai','gpt-5.6-luna','GPT-5.6 Luna','enabled','selected_users',true,true,'medium',true,true,'high',true,true,true,0.2,1.2,0.02,0.25,'verified',now(),false),
  ('openai','gpt-5.6-terra','GPT-5.6 Terra','enabled','selected_users',true,true,'medium',true,true,'high',true,true,true,2.0,12.0,0.2,2.5,'verified',now(),false),
  ('openai','gpt-5.6-sol','GPT-5.6 Sol','enabled','selected_users',true,true,'medium',true,true,'high',true,true,true,4.0,20.0,0.4,5.0,'verified',now(),false),
  ('openai','gpt-6-astra','GPT-6 Astra','enabled','selected_users',true,true,'medium',true,true,'high',true,true,true,10.0,50.0,1.0,12.5,'verified',now(),false)
ON CONFLICT (provider, provider_model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = now();

WITH chosen AS (
  SELECT m.id, m.provider_model_id
  FROM public.ai_models m
  WHERE m.provider_model_id = COALESCE(
    (SELECT value->>'model' FROM public.app_settings WHERE key = 'ai_model'),
    'gemini-3-flash-preview'
  )
    AND m.status = 'enabled'
  LIMIT 1
), fallback AS (
  SELECT id, provider_model_id
  FROM public.ai_models
  WHERE provider_model_id = 'gemini-3-flash-preview'
  LIMIT 1
), effective AS (
  SELECT * FROM chosen
  UNION ALL
  SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM chosen)
  LIMIT 1
)
INSERT INTO public.app_settings (key, value)
SELECT 'ai_generator_default_model', jsonb_build_object('registryId', id, 'model', provider_model_id)
FROM effective
ON CONFLICT (key) DO NOTHING;

WITH chosen AS (
  SELECT m.id, m.provider_model_id
  FROM public.ai_models m
  WHERE m.provider_model_id = COALESCE(
    (SELECT value->>'model' FROM public.app_settings WHERE key = 'ai_model'),
    'gemini-3-flash-preview'
  )
    AND m.status = 'enabled'
  LIMIT 1
), fallback AS (
  SELECT id, provider_model_id
  FROM public.ai_models
  WHERE provider_model_id = 'gemini-3-flash-preview'
  LIMIT 1
), effective AS (
  SELECT * FROM chosen
  UNION ALL
  SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM chosen)
  LIMIT 1
)
INSERT INTO public.app_settings (key, value)
SELECT 'ai_quality_check_default_model', jsonb_build_object('registryId', id, 'model', provider_model_id)
FROM effective
ON CONFLICT (key) DO NOTHING;
