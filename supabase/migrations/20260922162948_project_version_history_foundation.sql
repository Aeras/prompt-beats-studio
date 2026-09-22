BEGIN;

ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS version_change_metadata jsonb,
  ADD COLUMN IF NOT EXISTS version_user_note text;

ALTER TABLE public.prompt_projects
  ADD COLUMN IF NOT EXISTS preferred_prompt_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_version_change_metadata_object_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_version_change_metadata_object_check
      CHECK (version_change_metadata IS NULL OR jsonb_typeof(version_change_metadata) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_prompts_version_user_note_length_check'
      AND conrelid = 'public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_version_user_note_length_check
      CHECK (version_user_note IS NULL OR char_length(version_user_note) <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_projects_preferred_prompt_id_fkey'
      AND conrelid = 'public.prompt_projects'::regclass
  ) THEN
    ALTER TABLE public.prompt_projects
      ADD CONSTRAINT prompt_projects_preferred_prompt_id_fkey
      FOREIGN KEY (preferred_prompt_id)
      REFERENCES public.saved_prompts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
