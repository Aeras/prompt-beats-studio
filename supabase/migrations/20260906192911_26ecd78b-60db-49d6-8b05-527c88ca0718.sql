-- Audit #8: restrict anonymous access to public profile columns only
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, handle, display_name, artist_alias, avatar_url, bio,
  website_url, instagram_url, tiktok_url, youtube_url, x_url,
  donation_provider, donation_url, donation_custom_name
) ON public.profiles TO anon;

-- Explicit allow-list public representation
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.handle,
  p.display_name,
  p.artist_alias,
  p.avatar_url,
  p.bio,
  p.website_url,
  p.instagram_url,
  p.tiktok_url,
  p.youtube_url,
  p.x_url,
  p.donation_provider,
  p.donation_url,
  p.donation_custom_name
FROM public.profiles p;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;