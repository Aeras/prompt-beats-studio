DO $$
BEGIN
  -- 1/2. Ensure the canonical private column exists (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profile_private'
      AND column_name = 'welcome_email_sent_at'
  ) THEN
    ALTER TABLE public.profile_private ADD COLUMN welcome_email_sent_at TIMESTAMPTZ;
  END IF;

  -- 3. Preserve values from the old public column if it still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'welcome_email_sent_at'
  ) THEN
    EXECUTE '
      UPDATE public.profile_private pp
      SET welcome_email_sent_at = p.welcome_email_sent_at
      FROM public.profiles p
      WHERE p.id = pp.user_id
        AND p.welcome_email_sent_at IS NOT NULL
        AND pp.welcome_email_sent_at IS NULL
    ';
    -- 5. Remove the duplicate public column
    ALTER TABLE public.profiles DROP COLUMN welcome_email_sent_at;
  END IF;
END $$;

-- 6. Keep it private: anon has no access at all; authenticated can only read own row
REVOKE ALL ON public.profile_private FROM anon;
GRANT SELECT ON public.profile_private TO authenticated;
GRANT UPDATE (welcome_email_sent_at) ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;

ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

-- Recreate tight RLS policies (drop any historical variants first)
DROP POLICY IF EXISTS "Users can view their own private profile data" ON public.profile_private;
DROP POLICY IF EXISTS "Admins can view all private profile data" ON public.profile_private;
DROP POLICY IF EXISTS "Users can mark their own welcome email sent" ON public.profile_private;

CREATE POLICY "Users can view their own private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can mark their own welcome email sent"
  ON public.profile_private FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Block column-level escalation: users may only update welcome_email_sent_at,
-- never is_banned. Force via trigger guard instead of relying on grants alone.
CREATE OR REPLACE FUNCTION public.guard_profile_private_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed to modify is_banned';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS guard_profile_private_update ON public.profile_private;
CREATE TRIGGER guard_profile_private_update
  BEFORE UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_private_update();