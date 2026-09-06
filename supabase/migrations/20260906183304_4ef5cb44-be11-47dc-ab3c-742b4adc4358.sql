-- Corrective migration: single canonical ban state = public.profile_private.is_banned
-- 1) Guard: the public profiles table must NOT carry a duplicate ban column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_banned'
  ) THEN
    RAISE EXCEPTION 'Duplicate ban column public.profiles.is_banned found; manual review required';
  END IF;
END $$;

-- 2) Canonical column shape (no-op if already correct)
ALTER TABLE public.profile_private ALTER COLUMN is_banned SET DEFAULT false;
UPDATE public.profile_private SET is_banned = false WHERE is_banned IS NULL;
ALTER TABLE public.profile_private ALTER COLUMN is_banned SET NOT NULL;

-- 3) Lock down direct table privileges (RLS alone did not prevent self-unban:
--    the own-row UPDATE policy is column-agnostic while authenticated held table-wide UPDATE).
REVOKE ALL ON public.profile_private FROM anon;
REVOKE ALL ON public.profile_private FROM authenticated;

GRANT SELECT ON public.profile_private TO authenticated;
GRANT UPDATE (welcome_email_sent_at) ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;

-- 4) Canonical helper reads only the canonical source.
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profile_private WHERE user_id = _user_id), false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

-- 5) Canonical, admin-gated mutation writes only the canonical field.
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO public.profile_private (user_id, is_banned)
  VALUES (_user_id, _banned)
  ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) TO authenticated, service_role;
