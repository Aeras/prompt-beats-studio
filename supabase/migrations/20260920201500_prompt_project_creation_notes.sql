-- Add private project-level Creation Notes.
-- Notes are owned and protected by the existing prompt_projects RLS policy.

ALTER TABLE public.prompt_projects
  ADD COLUMN IF NOT EXISTS creation_notes text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prompt_projects_creation_notes_length_check'
      AND conrelid = 'public.prompt_projects'::regclass
  ) THEN
    ALTER TABLE public.prompt_projects
      ADD CONSTRAINT prompt_projects_creation_notes_length_check
      CHECK (char_length(creation_notes) <= 6000);
  END IF;
END $$;
