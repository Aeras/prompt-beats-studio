-- Prompt Project Library foundation.
-- Projects are intentionally generic so future Analyzer/Coach records can reference
-- the same project entity without introducing a second project system.

CREATE TABLE IF NOT EXISTS public.prompt_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own prompt projects" ON public.prompt_projects;
CREATE POLICY "Users manage their own prompt projects"
ON public.prompt_projects
FOR ALL
USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());

ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS version_number integer,
  ADD COLUMN IF NOT EXISTS version_label text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_project_id_fkey'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.prompt_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_version_number_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_version_number_check
      CHECK (version_number IS NULL OR version_number > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prompt_projects_user_updated
  ON public.prompt_projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_project
  ON public.saved_prompts(user_id, project_id, version_number, created_at);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_updated
  ON public.saved_prompts(user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_saved_prompt_project_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prompt_projects p
    WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Prompt project does not belong to this user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_saved_prompt_project_ownership ON public.saved_prompts;
CREATE TRIGGER trg_enforce_saved_prompt_project_ownership
BEFORE INSERT OR UPDATE OF user_id, project_id ON public.saved_prompts
FOR EACH ROW EXECUTE FUNCTION public.enforce_saved_prompt_project_ownership();

REVOKE ALL ON FUNCTION public.enforce_saved_prompt_project_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_saved_prompt_project_ownership() TO service_role;

CREATE OR REPLACE FUNCTION public.next_prompt_project_version(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(MAX(sp.version_number), 0) + 1
  FROM public.saved_prompts sp
  WHERE sp.project_id = p_project_id
    AND sp.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.next_prompt_project_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_prompt_project_version(uuid) TO authenticated, service_role;
