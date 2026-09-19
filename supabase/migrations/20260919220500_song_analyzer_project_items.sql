-- AI Song Analyzer project integration.
-- Source audio is never stored. Only structured analysis results may be persisted.

CREATE TABLE IF NOT EXISTS public.song_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  model text NOT NULL,
  generator_ready jsonb NOT NULL,
  detailed_analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.song_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own song analyses" ON public.song_analyses;
CREATE POLICY "Users manage their own song analyses"
ON public.song_analyses
FOR ALL
USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());

CREATE INDEX IF NOT EXISTS idx_song_analyses_user_project
  ON public.song_analyses(user_id, project_id, created_at);

CREATE OR REPLACE FUNCTION public.enforce_song_analysis_project_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.prompt_projects p
    WHERE p.id = NEW.project_id
      AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_song_analysis_project_ownership ON public.song_analyses;
CREATE TRIGGER trg_enforce_song_analysis_project_ownership
BEFORE INSERT OR UPDATE OF user_id, project_id ON public.song_analyses
FOR EACH ROW EXECUTE FUNCTION public.enforce_song_analysis_project_ownership();

REVOKE ALL ON FUNCTION public.enforce_song_analysis_project_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_song_analysis_project_ownership() TO service_role;
