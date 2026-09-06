-- 1. Lock down SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;

-- 2. Stop public exposure of who liked what; keep public like counts via a count-only function
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Users can view their own likes" ON public.likes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.like_count(_track_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT count(*) FROM public.likes WHERE track_id = _track_id $$;
GRANT EXECUTE ON FUNCTION public.like_count(uuid) TO anon, authenticated;

-- 3. Remove is_banned (and other internal fields) from public profile reads via a safe view
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, handle, display_name, avatar_url, created_at, updated_at, artist_alias, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed, donation_provider, donation_url, donation_custom_name
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;