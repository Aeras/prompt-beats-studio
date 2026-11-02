-- Optional expert interpretation; independent of immutable base football research.
-- Apply only in an approved coordinated release. Service-role only.
BEGIN;
CREATE TABLE public.private_football_expert_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.private_football_research_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  decision jsonb,
  usage jsonb,
  error_code text,
  CONSTRAINT expert_review_completed CHECK (
    status <> 'completed' OR (decision IS NOT NULL AND completed_at IS NOT NULL AND provider_started_at IS NOT NULL)
  )
);
CREATE INDEX private_football_expert_reviews_owner_time
  ON public.private_football_expert_reviews(user_id, created_at DESC);
ALTER TABLE public.private_football_expert_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_expert_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.private_football_expert_reviews TO service_role;
CREATE FUNCTION public.protect_private_football_expert_reviews()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status <> 'processing' THEN
    RAISE EXCEPTION 'terminal expert review immutable';
  END IF;
  IF (OLD.run_id, OLD.user_id, OLD.model_id, OLD.created_at)
     IS DISTINCT FROM (NEW.run_id, NEW.user_id, NEW.model_id, NEW.created_at)
     OR (OLD.provider_started_at IS NOT NULL AND NEW.provider_started_at IS DISTINCT FROM OLD.provider_started_at)
  THEN
    RAISE EXCEPTION 'expert review identity immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_private_football_expert_reviews_trigger
  BEFORE UPDATE ON public.private_football_expert_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_football_expert_reviews();
COMMIT;
