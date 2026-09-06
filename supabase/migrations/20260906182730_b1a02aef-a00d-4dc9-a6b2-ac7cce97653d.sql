-- Corrective migration: make public.likes fully private at the grant + RLS level
-- 1. Revoke any SELECT privileges from anon entirely (idempotent)
REVOKE ALL ON public.likes FROM anon;

-- 2. Authenticated users keep own-row access; service_role keeps full access
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;

-- 3. Remove any public/permissive SELECT policies on likes (idempotent)
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
DROP POLICY IF EXISTS "Anyone can read like counts" ON public.likes;
DROP POLICY IF EXISTS "Likes are publicly readable" ON public.likes;
DROP POLICY IF EXISTS "Public can view likes" ON public.likes;

-- 4. Minimal SELECT policy: authenticated users can read only their own like rows
DROP POLICY IF EXISTS "Users can view their own likes" ON public.likes;
CREATE POLICY "Users can view their own likes" ON public.likes
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5. Preserve INSERT/DELETE ownership policies (recreate idempotently)
DROP POLICY IF EXISTS "Users can like as themselves" ON public.likes;
CREATE POLICY "Users can like as themselves" ON public.likes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.likes;
CREATE POLICY "Users can remove their own likes" ON public.likes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. Count-only SECURITY DEFINER function for public like counts; never returns user_id
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