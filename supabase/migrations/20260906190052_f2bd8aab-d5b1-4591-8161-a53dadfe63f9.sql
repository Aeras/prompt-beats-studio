-- Audit #3 corrective: guarantee canonical private location with value preservation, idempotent.

-- 1. Ensure private column exists
ALTER TABLE public.profile_private
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- 2. If the old public column still exists, preserve values then drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='welcome_email_sent_at'
  ) THEN
    UPDATE public.profile_private pp
    SET welcome_email_sent_at = p.welcome_email_sent_at
    FROM public.profiles p
    WHERE p.id = pp.user_id
      AND p.welcome_email_sent_at IS NOT NULL
      AND pp.welcome_email_sent_at IS NULL;

    ALTER TABLE public.profiles DROP COLUMN welcome_email_sent_at;
  END IF;
END $$;

-- 3. Keep it private: no anon access, authenticated sees/marks only their own row
REVOKE ALL ON public.profile_private FROM anon;
GRANT SELECT ON public.profile_private TO authenticated;
GRANT UPDATE (welcome_email_sent_at) ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;