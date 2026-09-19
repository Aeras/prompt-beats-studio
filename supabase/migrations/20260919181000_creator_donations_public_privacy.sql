-- Creator donations Phase 2: legacy donation columns remain stored for
-- rollback, but are no longer part of the public profile contract.
BEGIN;

REVOKE SELECT (
  donation_provider,
  donation_url,
  donation_custom_name
) ON public.profiles FROM anon;

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
  b.badge AS staff_badge
FROM public.profiles p
LEFT JOIN public.public_staff_badges b ON b.user_id = p.id;

ALTER VIEW public.public_profiles OWNER TO postgres;

REVOKE ALL ON public.public_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

COMMIT;
