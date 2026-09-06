-- 1. Remove the public row-level read on likes
DROP POLICY IF EXISTS "Anyone can read like counts" ON public.likes;

-- 2. Ensure anon has no direct table access; authenticated keeps own-row access via RLS
REVOKE ALL ON public.likes FROM anon;
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;

-- 3. Count-only, RLS-bypassing function for public like counts (published tracks only)
CREATE OR REPLACE FUNCTION public.like_count(_track_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)
  FROM public.likes l
  JOIN public.tracks t ON t.id = l.track_id
  WHERE l.track_id = _track_id
    AND (t.is_published = true OR t.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.like_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.like_count(uuid) TO anon, authenticated, service_role;