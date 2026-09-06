-- 1. Remove permissive storage write policies that lacked folder-ownership checks.
-- Owner-scoped equivalents ('Users can upload own avatars', 'Users can update own avatars',
-- 'Users can upload their own track covers', 'Users can update their own track covers') remain.
DROP POLICY IF EXISTS "Avatar Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Track Covers Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Track Covers Update Access" ON storage.objects;

-- 2. The avatars bucket must stay private (public buckets are blocked in this workspace),
-- so remove anonymous read access: only signed-in users can read avatar files.
DROP POLICY IF EXISTS "Avatar Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Signed-in users can view avatars" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

-- 3. Bound anonymous profile reads to an explicit public column list.
-- All listed columns are public-facing (sensitive fields live in public.profile_private).
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, handle, display_name, artist_alias, avatar_url, bio, website_url, instagram_url, tiktok_url, youtube_url, x_url, profile_completed, donation_provider, donation_url, donation_custom_name) ON public.profiles TO anon;