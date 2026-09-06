-- Corrective migration: safely migrate away from duplicate public.profiles.is_banned
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_banned'
  ) THEN
    -- Preserve canonical state: carry any existing bans into profile_private
    EXECUTE $mig$
      INSERT INTO public.profile_private (user_id, is_banned)
      SELECT p.id, COALESCE(p.is_banned, false)
      FROM public.profiles p
      ON CONFLICT (user_id) DO UPDATE
        SET is_banned = public.profile_private.is_banned OR EXCLUDED.is_banned
    $mig$;
    EXECUTE 'ALTER TABLE public.profiles DROP COLUMN is_banned';
  END IF;
END $$;

-- Canonical column guarantees
ALTER TABLE public.profile_private ALTER COLUMN is_banned SET DEFAULT false;
UPDATE public.profile_private SET is_banned = false WHERE is_banned IS NULL;
ALTER TABLE public.profile_private ALTER COLUMN is_banned SET NOT NULL;

-- Read path: only from profile_private
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((SELECT is_banned FROM public.profile_private WHERE user_id = _user_id), false);
$fn$;

REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

-- Write path: admin-gated, only profile_private
CREATE OR REPLACE FUNCTION public.set_user_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO public.profile_private (user_id, is_banned)
  VALUES (_user_id, _banned)
  ON CONFLICT (user_id) DO UPDATE SET is_banned = EXCLUDED.is_banned;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) TO authenticated, service_role;