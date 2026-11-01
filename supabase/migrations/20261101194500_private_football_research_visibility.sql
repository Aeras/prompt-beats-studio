-- Per-user UI visibility without mutating immutable research/audit snapshots.
BEGIN;
CREATE TABLE public.private_football_research_hidden (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.private_football_research_runs(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, run_id)
);
ALTER TABLE public.private_football_research_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_research_hidden FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.private_football_research_hidden TO service_role;
COMMIT;
