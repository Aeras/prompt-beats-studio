-- Replace the public-executable SECURITY DEFINER badge helper with a tiny
-- public projection table maintained internally by triggers. The public view
-- remains SECURITY INVOKER and no anonymous caller executes elevated code.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_staff_badges (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge text NULL CHECK (badge IN ('PromptBeats Team', 'Moderator')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_staff_badges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.public_staff_badges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_staff_badges TO anon, authenticated;
GRANT ALL ON public.public_staff_badges TO service_role;

DROP POLICY IF EXISTS "Public can read staff badges" ON public.public_staff_badges;
CREATE POLICY "Public can read staff badges"
  ON public.public_staff_badges
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.refresh_public_staff_badge(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_badge text;
BEGIN
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
  END
  INTO v_badge;

  IF v_badge IS NULL THEN
    DELETE FROM public.public_staff_badges WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.public_staff_badges(user_id, badge, updated_at)
    VALUES (_user_id, v_badge, now())
    ON CONFLICT (user_id) DO UPDATE
      SET badge = EXCLUDED.badge,
          updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_public_staff_badge(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_public_staff_badge(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_public_staff_badge_from_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_public_staff_badge(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_public_staff_badge_from_profile_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_public_staff_badge(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_public_staff_badge_from_user_roles()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_public_staff_badge_from_profile_private()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refresh_public_staff_badge_user_roles ON public.user_roles;
CREATE TRIGGER refresh_public_staff_badge_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.refresh_public_staff_badge_from_user_roles();

DROP TRIGGER IF EXISTS refresh_public_staff_badge_profile_private ON public.profile_private;
CREATE TRIGGER refresh_public_staff_badge_profile_private
AFTER INSERT OR UPDATE OF is_banned OR DELETE ON public.profile_private
FOR EACH ROW
EXECUTE FUNCTION public.refresh_public_staff_badge_from_profile_private();

-- Initial projection backfill.
INSERT INTO public.public_staff_badges(user_id, badge, updated_at)
SELECT p.id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id = ur.user_id
      WHERE ur.user_id = p.id
        AND ur.role::text = 'admin'
        AND pp.is_banned = false
    ) THEN 'PromptBeats Team'
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profile_private pp ON pp.user_id = ur.user_id
      WHERE ur.user_id = p.id
        AND ur.role::text IN ('moderator', 'senior_moderator')
        AND ur.moderation_status = 'active'
        AND pp.is_banned = false
    ) THEN 'Moderator'
    ELSE NULL
  END AS badge,
  now()
FROM public.profiles p
WHERE EXISTS (
  SELECT 1
  FROM public.user_roles ur
  JOIN public.profile_private pp ON pp.user_id = ur.user_id
  WHERE ur.user_id = p.id
    AND pp.is_banned = false
    AND (
      ur.role::text = 'admin'
      OR (ur.role::text IN ('moderator', 'senior_moderator') AND ur.moderation_status = 'active')
    )
)
ON CONFLICT (user_id) DO UPDATE
SET badge = EXCLUDED.badge,
    updated_at = EXCLUDED.updated_at;

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
  b.badge AS staff_badge
FROM public.profiles p
LEFT JOIN public.public_staff_badges b ON b.user_id = p.id;

ALTER VIEW public.public_profiles OWNER TO postgres;
REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

DROP FUNCTION IF EXISTS public.public_staff_badge(uuid);

COMMIT;
