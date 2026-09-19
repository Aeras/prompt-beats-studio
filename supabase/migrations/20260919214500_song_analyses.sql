CREATE TABLE public.song_analyses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id uuid REFERENCES public.prompt_projects(id) ON DELETE SET NULL, name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
 model text NOT NULL CHECK (model IN ('gemini-3.8-flash','gemini-3.1-pro-preview')), summary text NOT NULL,
 generator_ready jsonb NOT NULL, detailed_analysis jsonb NOT NULL, confidence_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
 analysis_schema_version integer NOT NULL DEFAULT 1 CHECK (analysis_schema_version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.song_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own song analyses" ON public.song_analyses FOR ALL USING (auth.uid()=user_id AND NOT public.current_user_is_banned()) WITH CHECK (auth.uid()=user_id AND NOT public.current_user_is_banned());
CREATE INDEX idx_song_analyses_user_project ON public.song_analyses(user_id,project_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.enforce_song_analysis_project_ownership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.prompt_projects p WHERE p.id=NEW.project_id AND p.user_id=NEW.user_id) THEN RAISE EXCEPTION 'Prompt project does not belong to this user'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER trg_enforce_song_analysis_project_ownership BEFORE INSERT OR UPDATE OF user_id,project_id ON public.song_analyses FOR EACH ROW EXECUTE FUNCTION public.enforce_song_analysis_project_ownership();
REVOKE ALL ON FUNCTION public.enforce_song_analysis_project_ownership() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.enforce_song_analysis_project_ownership() TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.song_analyses TO authenticated;
