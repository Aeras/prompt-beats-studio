BEGIN;

CREATE OR REPLACE FUNCTION public.search_library_scope(
  _folder_id uuid,
  _query text
)
RETURNS TABLE (
  item_type text,
  item_id uuid,
  name text,
  folder_id uuid,
  path text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE full_tree AS (
    SELECT
      f.id,
      f.parent_folder_id,
      f.name,
      f.name::text AS path,
      1 AS depth
    FROM public.library_folders f
    WHERE f.user_id = auth.uid()
      AND f.parent_folder_id IS NULL

    UNION ALL

    SELECT
      child.id,
      child.parent_folder_id,
      child.name,
      (full_tree.path || ' / ' || child.name)::text,
      full_tree.depth + 1
    FROM public.library_folders child
    JOIN full_tree ON full_tree.id = child.parent_folder_id
    WHERE child.user_id = auth.uid()
      AND full_tree.depth < 5
  ),
  scope_tree AS (
    SELECT
      f.id,
      f.parent_folder_id
    FROM public.library_folders f
    WHERE f.user_id = auth.uid()
      AND _folder_id IS NOT NULL
      AND f.id = _folder_id

    UNION ALL

    SELECT
      child.id,
      child.parent_folder_id
    FROM public.library_folders child
    JOIN scope_tree scope ON scope.id = child.parent_folder_id
    WHERE child.user_id = auth.uid()
  ),
  scope_ids AS (
    SELECT id FROM scope_tree
    UNION
    SELECT id FROM full_tree WHERE _folder_id IS NULL
  ),
  normalized AS (
    SELECT lower(btrim(COALESCE(_query, ''))) AS q
  ),
  folder_results AS (
    SELECT
      'folder'::text AS item_type,
      ft.id AS item_id,
      ft.name::text AS name,
      ft.id AS folder_id,
      ft.path::text AS path
    FROM full_tree ft
    CROSS JOIN normalized n
    WHERE ft.id IN (SELECT id FROM scope_ids)
      AND (n.q = '' OR lower(ft.name) LIKE '%' || n.q || '%' OR lower(ft.path) LIKE '%' || n.q || '%')
  ),
  project_results AS (
    SELECT
      'project'::text AS item_type,
      p.id AS item_id,
      p.name::text AS name,
      p.folder_id,
      COALESCE(ft.path, 'Root')::text AS path
    FROM public.prompt_projects p
    LEFT JOIN full_tree ft ON ft.id = p.folder_id
    CROSS JOIN normalized n
    WHERE p.user_id = auth.uid()
      AND (
        (_folder_id IS NULL)
        OR p.folder_id IN (SELECT id FROM scope_ids)
      )
      AND (
        n.q = ''
        OR lower(p.name) LIKE '%' || n.q || '%'
        OR lower(p.creation_notes) LIKE '%' || n.q || '%'
        OR EXISTS (
          SELECT 1
          FROM public.saved_prompts sp
          WHERE sp.user_id = auth.uid()
            AND sp.project_id = p.id
            AND (
              lower(COALESCE(sp.custom_name, '')) LIKE '%' || n.q || '%'
              OR lower(COALESCE(sp.title, '')) LIKE '%' || n.q || '%'
              OR lower(sp.theme) LIKE '%' || n.q || '%'
              OR lower(sp.genre) LIKE '%' || n.q || '%'
              OR lower(sp.mood) LIKE '%' || n.q || '%'
              OR lower(sp.tags) LIKE '%' || n.q || '%'
              OR lower(sp.lyrics) LIKE '%' || n.q || '%'
              OR lower(sp.note) LIKE '%' || n.q || '%'
            )
        )
      )
  ),
  prompt_results AS (
    SELECT
      'prompt'::text AS item_type,
      sp.id AS item_id,
      COALESCE(NULLIF(sp.custom_name, ''), NULLIF(sp.title, ''), NULLIF(sp.theme, ''), 'Untitled Prompt')::text AS name,
      sp.folder_id,
      COALESCE(ft.path, 'Root')::text AS path
    FROM public.saved_prompts sp
    LEFT JOIN full_tree ft ON ft.id = sp.folder_id
    CROSS JOIN normalized n
    WHERE sp.user_id = auth.uid()
      AND sp.project_id IS NULL
      AND (
        (_folder_id IS NULL)
        OR sp.folder_id IN (SELECT id FROM scope_ids)
      )
      AND (
        n.q = ''
        OR lower(COALESCE(sp.custom_name, '')) LIKE '%' || n.q || '%'
        OR lower(COALESCE(sp.title, '')) LIKE '%' || n.q || '%'
        OR lower(sp.theme) LIKE '%' || n.q || '%'
        OR lower(sp.genre) LIKE '%' || n.q || '%'
        OR lower(sp.mood) LIKE '%' || n.q || '%'
        OR lower(sp.tags) LIKE '%' || n.q || '%'
        OR lower(sp.lyrics) LIKE '%' || n.q || '%'
        OR lower(sp.note) LIKE '%' || n.q || '%'
      )
  )
  SELECT * FROM folder_results
  UNION ALL
  SELECT * FROM project_results
  UNION ALL
  SELECT * FROM prompt_results
  ORDER BY path, item_type, name
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.search_library_scope(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_scope(uuid, text) TO authenticated, service_role;

COMMIT;
