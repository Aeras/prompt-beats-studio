BEGIN;

CREATE TABLE IF NOT EXISTS public.library_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_folder_id uuid NULL REFERENCES public.library_folders(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_folders_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS library_folders_unique_sibling_name_idx
ON public.library_folders (
  user_id,
  COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

CREATE INDEX IF NOT EXISTS library_folders_user_parent_idx
ON public.library_folders(user_id, parent_folder_id, name);

ALTER TABLE public.prompt_projects
  ADD COLUMN IF NOT EXISTS folder_id uuid NULL,
  ADD COLUMN IF NOT EXISTS duplicated_from_project_id uuid NULL;

ALTER TABLE public.saved_prompts
  ADD COLUMN IF NOT EXISTS folder_id uuid NULL,
  ADD COLUMN IF NOT EXISTS duplicated_from_prompt_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='prompt_projects_folder_id_fkey'
      AND conrelid='public.prompt_projects'::regclass
  ) THEN
    ALTER TABLE public.prompt_projects
      ADD CONSTRAINT prompt_projects_folder_id_fkey
      FOREIGN KEY (folder_id)
      REFERENCES public.library_folders(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='prompt_projects_duplicated_from_project_id_fkey'
      AND conrelid='public.prompt_projects'::regclass
  ) THEN
    ALTER TABLE public.prompt_projects
      ADD CONSTRAINT prompt_projects_duplicated_from_project_id_fkey
      FOREIGN KEY (duplicated_from_project_id)
      REFERENCES public.prompt_projects(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='saved_prompts_folder_id_fkey'
      AND conrelid='public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_folder_id_fkey
      FOREIGN KEY (folder_id)
      REFERENCES public.library_folders(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='saved_prompts_duplicated_from_prompt_id_fkey'
      AND conrelid='public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_duplicated_from_prompt_id_fkey
      FOREIGN KEY (duplicated_from_prompt_id)
      REFERENCES public.saved_prompts(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='saved_prompts_folder_only_for_standalone_check'
      AND conrelid='public.saved_prompts'::regclass
  ) THEN
    ALTER TABLE public.saved_prompts
      ADD CONSTRAINT saved_prompts_folder_only_for_standalone_check
      CHECK (project_id IS NULL OR folder_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prompt_projects_user_folder_idx
ON public.prompt_projects(user_id, folder_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS saved_prompts_user_folder_idx
ON public.saved_prompts(user_id, folder_id, updated_at DESC)
WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS prompt_projects_duplicated_from_idx
ON public.prompt_projects(duplicated_from_project_id)
WHERE duplicated_from_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS saved_prompts_duplicated_from_idx
ON public.saved_prompts(duplicated_from_prompt_id)
WHERE duplicated_from_prompt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_library_folder_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_exists boolean;
  v_depth integer := 1;
  v_cycle boolean := false;
BEGIN
  NEW.name := btrim(NEW.name);

  IF NEW.parent_folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT NULL AND NEW.parent_folder_id = NEW.id THEN
    RAISE EXCEPTION 'A folder cannot be moved into itself';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.library_folders
    WHERE id = NEW.parent_folder_id
      AND user_id = NEW.user_id
  ) INTO v_parent_exists;

  IF NOT v_parent_exists THEN
    RAISE EXCEPTION 'Parent folder does not belong to this user';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_folder_id, 1 AS level
    FROM public.library_folders
    WHERE id = NEW.parent_folder_id
      AND user_id = NEW.user_id
    UNION ALL
    SELECT f.id, f.parent_folder_id, a.level + 1
    FROM public.library_folders f
    JOIN ancestors a ON f.id = a.parent_folder_id
    WHERE f.user_id = NEW.user_id
      AND a.level < 10
  )
  SELECT
    COALESCE(MAX(level), 0) + 1,
    COALESCE(bool_or(id = NEW.id), false)
  INTO v_depth, v_cycle
  FROM ancestors;

  IF v_cycle THEN
    RAISE EXCEPTION 'A folder cannot be moved into one of its descendants';
  END IF;

  IF v_depth > 5 THEN
    RAISE EXCEPTION 'Folder nesting cannot exceed 5 levels';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_library_folder_hierarchy ON public.library_folders;
CREATE TRIGGER trg_validate_library_folder_hierarchy
BEFORE INSERT OR UPDATE OF parent_folder_id, user_id, name
ON public.library_folders
FOR EACH ROW EXECUTE FUNCTION public.validate_library_folder_hierarchy();

CREATE OR REPLACE FUNCTION public.touch_library_folder_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_library_folder_updated_at ON public.library_folders;
CREATE TRIGGER trg_touch_library_folder_updated_at
BEFORE UPDATE ON public.library_folders
FOR EACH ROW EXECUTE FUNCTION public.touch_library_folder_updated_at();

CREATE OR REPLACE FUNCTION public.validate_library_item_folder_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.library_folders f
    WHERE f.id = NEW.folder_id
      AND f.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Destination folder does not belong to this user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_prompt_project_folder_ownership ON public.prompt_projects;
CREATE TRIGGER trg_validate_prompt_project_folder_ownership
BEFORE INSERT OR UPDATE OF folder_id, user_id
ON public.prompt_projects
FOR EACH ROW EXECUTE FUNCTION public.validate_library_item_folder_ownership();

DROP TRIGGER IF EXISTS trg_validate_saved_prompt_folder_ownership ON public.saved_prompts;
CREATE TRIGGER trg_validate_saved_prompt_folder_ownership
BEFORE INSERT OR UPDATE OF folder_id, user_id
ON public.saved_prompts
FOR EACH ROW EXECUTE FUNCTION public.validate_library_item_folder_ownership();

ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own library folders" ON public.library_folders;
CREATE POLICY "Users manage their own library folders"
ON public.library_folders
FOR ALL
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND NOT public.current_user_is_banned()
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND NOT public.current_user_is_banned()
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.library_folders
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_library_folders(_query text)
RETURNS TABLE (
  id uuid,
  name text,
  parent_folder_id uuid,
  path text,
  depth integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE tree AS (
    SELECT
      f.id,
      f.name,
      f.parent_folder_id,
      f.name::text AS path,
      1 AS depth
    FROM public.library_folders f
    WHERE f.user_id = auth.uid()
      AND f.parent_folder_id IS NULL

    UNION ALL

    SELECT
      child.id,
      child.name,
      child.parent_folder_id,
      (tree.path || ' / ' || child.name)::text,
      tree.depth + 1
    FROM public.library_folders child
    JOIN tree ON tree.id = child.parent_folder_id
    WHERE child.user_id = auth.uid()
      AND tree.depth < 5
  )
  SELECT tree.id, tree.name, tree.parent_folder_id, tree.path, tree.depth
  FROM tree
  WHERE btrim(COALESCE(_query, '')) = ''
     OR tree.name ILIKE '%' || btrim(_query) || '%'
     OR tree.path ILIKE '%' || btrim(_query) || '%'
  ORDER BY lower(tree.path)
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.search_library_folders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_folders(text) TO authenticated, service_role;

COMMIT;
