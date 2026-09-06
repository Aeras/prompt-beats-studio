GRANT UPDATE (welcome_email_sent_at) ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;
REVOKE ALL ON public.profile_private FROM anon;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS welcome_email_sent_at;