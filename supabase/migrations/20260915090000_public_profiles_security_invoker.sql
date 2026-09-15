-- Remove the SECURITY DEFINER view finding without exposing internal role or
-- moderation tables. The public view runs as the caller; only the derived
-- staff badge is computed through a narrowly scoped SECURITY DEFINER function.

BEGIN;

CREATE OR REPLACE FUNCTION public.public_staff_badge(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role::text = 'admin'
        AND pp.is_banned = false
    ) THEN 'PromptBeats Team'
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role::text IN ('moderator', 'senior_moderator')
        AND ur.moderation_status = 'active'
        AND pp.is_banned = false
    ) THEN 'Moderator'
    ELSE NULL
  END;
$$;

ALTER FUNCTION public.public_staff_badge(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.public_staff_badge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_staff_badge(uuid) TO anon, authenticated, service_role;

-- public.profiles now contains only public-facing profile fields; sensitive
-- moderation/account state lives in public.profile_private. Reassert read
-- policies so an invoker view behaves the same for signed-out and signed-in
-- visitors while direct anonymous access stays column-limited.
DROP POLICY IF EXISTS "Anon can read allow-listed public profile columns" ON public.profiles;
CREATE POLICY "Anon can read allow-listed public profile columns"
  ON public.profiles FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated can read public profiles" ON public.profiles;
CREATE POLICY "Authenticated can read public profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  handle,
  display_name,
  artist_alias,
  avatar_url,
  bio,
  website_url,
  instagram_url,
  tiktok_url,
  youtube_url,
  x_url,
  profile_completed,
  donation_provider,
  donation_url,
  donation_custom_name
) ON public.profiles TO anon;

GRANT SELECT ON public.profiles TO authenticated;

CREATE OR REPLACE VIEW public.public_profiles
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
  p.donation_custom_name,
  public.public_staff_badge(p.id) AS staff_badge
FROM public.profiles p;

ALTER VIEW public.public_profiles OWNER TO postgres;
REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

COMMIT;
