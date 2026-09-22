BEGIN;

DROP POLICY IF EXISTS "Users can read their own project version tracks" ON public.project_version_tracks;
CREATE POLICY "Users can read their own project version tracks"
ON public.project_version_tracks
FOR SELECT
USING ((select auth.uid()) = user_id AND NOT public.current_user_is_banned());

COMMIT;
