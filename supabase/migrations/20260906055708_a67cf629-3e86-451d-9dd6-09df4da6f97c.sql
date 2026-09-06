DROP VIEW IF EXISTS public.public_profiles;

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, handle, display_name, avatar_url, created_at, updated_at, artist_alias, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed, donation_provider, donation_url, donation_custom_name) ON public.profiles TO anon;
CREATE POLICY "Public profile fields are viewable by everyone" ON public.profiles FOR SELECT TO anon USING (true);