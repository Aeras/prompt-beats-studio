-- Views run as the querying user (avoid SECURITY DEFINER views)
ALTER VIEW public.public_profiles SET (security_invoker = true);
ALTER VIEW public.track_like_counts SET (security_invoker = true);

-- Profiles: anon may read ONLY the explicit allow-list of public columns
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT (id, handle, display_name, avatar_url, artist_alias, bio,
              website_url, instagram_url, tiktok_url, youtube_url, x_url,
              donation_provider, donation_url, donation_custom_name)
  ON public.profiles TO anon;

DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;
CREATE POLICY "Anon can read allow-listed public profile columns"
  ON public.profiles FOR SELECT TO anon USING (true);

-- Likes: anon may read ONLY track_id (for public counts), never user_id
REVOKE ALL ON public.likes FROM anon;
GRANT SELECT (track_id) ON public.likes TO anon;

DROP POLICY IF EXISTS "Anon can count likes per track" ON public.likes;
CREATE POLICY "Anon can count likes per track"
  ON public.likes FOR SELECT TO anon USING (true);