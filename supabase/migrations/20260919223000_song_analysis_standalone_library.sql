-- AI Song Analyzer standalone library support.
-- Keeps structured analyses independent from source audio and makes Project association optional.

ALTER TABLE public.song_analyses
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.song_analyses
SET name = 'Song Analysis'
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE public.song_analyses
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN project_id DROP NOT NULL;

-- Project deletion must not delete a saved analysis. It becomes standalone.
ALTER TABLE public.song_analyses
  DROP CONSTRAINT IF EXISTS song_analyses_project_id_fkey;

ALTER TABLE public.song_analyses
  ADD CONSTRAINT song_analyses_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.prompt_projects(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'song_analyses_name_check'
      AND conrelid = 'public.song_analyses'::regclass
  ) THEN
    ALTER TABLE public.song_analyses
      ADD CONSTRAINT song_analyses_name_check
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 200);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_song_analysis_project_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION public.enforce_song_analysis_project_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_song_analysis_project_ownership() TO service_role;
