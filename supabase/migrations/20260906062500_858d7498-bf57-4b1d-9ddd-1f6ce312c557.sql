-- Allow counting likes without exposing who liked (track_id only, never user_id)
GRANT SELECT (track_id) ON public.likes TO anon;
GRANT SELECT (track_id) ON public.likes TO authenticated;

CREATE POLICY "Anyone can read like counts"
ON public.likes FOR SELECT TO anon, authenticated
USING (true);

-- like_count no longer needs elevated privileges; it only counts rows visible under the column-limited grant
CREATE OR REPLACE FUNCTION public.like_count(_track_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT count(*) FROM public.likes WHERE track_id = _track_id $$;

-- Remove anonymous direct access to moderation/internal helper functions
REVOKE EXECUTE ON FUNCTION public.set_user_banned(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM anon;