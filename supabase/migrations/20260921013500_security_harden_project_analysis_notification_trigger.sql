BEGIN;

-- Harden Prompt Projects: anonymous users do not need any table privileges,
-- and the owner-management policy is explicitly scoped to authenticated users.
REVOKE ALL ON public.prompt_projects FROM anon;

DROP POLICY IF EXISTS "Users manage their own prompt projects" ON public.prompt_projects;
CREATE POLICY "Users manage their own prompt projects"
ON public.prompt_projects
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());

-- Harden Song Analyses the same way: keep access limited to authenticated
-- owners and remove unnecessary anonymous table privileges.
REVOKE ALL ON public.song_analyses FROM anon;

DROP POLICY IF EXISTS "Users manage their own song analyses" ON public.song_analyses;
CREATE POLICY "Users manage their own song analyses"
ON public.song_analyses
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND NOT public.current_user_is_banned())
WITH CHECK (auth.uid() = user_id AND NOT public.current_user_is_banned());

-- Trigger functions do not need to be callable from client API roles.
-- Keep the first-publication notification producer internal-only.
REVOKE ALL ON FUNCTION public.notify_followers_on_first_publication() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_followers_on_first_publication() TO service_role;

COMMIT;
