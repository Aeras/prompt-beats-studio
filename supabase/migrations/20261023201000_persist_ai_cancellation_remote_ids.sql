-- Preserve remote async operation IDs for cancellation recovery across workers.
-- These IDs are internal; only service-role writers may set them.
BEGIN;
ALTER TABLE public.ai_generation_jobs
  ADD COLUMN IF NOT EXISTS cancellation_remote_id text,
  ADD COLUMN IF NOT EXISTS cancellation_remote_provider text;
ALTER TABLE public.ai_quality_check_actions
  ADD COLUMN IF NOT EXISTS cancellation_remote_id text,
  ADD COLUMN IF NOT EXISTS cancellation_remote_provider text;
ALTER TABLE public.ai_generation_jobs
  ADD CONSTRAINT ai_generation_jobs_remote_provider_check
  CHECK (cancellation_remote_provider IS NULL OR cancellation_remote_provider IN ('openai', 'gemini'));
ALTER TABLE public.ai_quality_check_actions
  ADD CONSTRAINT ai_quality_check_remote_provider_check
  CHECK (cancellation_remote_provider IS NULL OR cancellation_remote_provider IN ('openai', 'gemini'));
COMMIT;
