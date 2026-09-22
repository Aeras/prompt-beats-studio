BEGIN;

DROP POLICY IF EXISTS "Owners can view playlists" ON public.playlists;
CREATE POLICY "Owners can view playlists"
ON public.playlists
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('playlists')
);

DROP POLICY IF EXISTS "Owners can view playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Owners can view playlist tracks"
ON public.playlist_tracks
FOR SELECT
TO authenticated
USING (
  public.current_user_can_use_feature('playlists')
  AND EXISTS (
    SELECT 1
    FROM public.playlists p
    WHERE p.id = playlist_tracks.playlist_id
      AND p.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view their own favorites" ON public.favorites;
CREATE POLICY "Users can view their own favorites"
ON public.favorites
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('favorites')
);

DROP POLICY IF EXISTS "Users can view their own likes" ON public.likes;
CREATE POLICY "Users can view their own likes"
ON public.likes
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('likes')
);

DROP POLICY IF EXISTS "Owners can view their share links" ON public.track_share_links;
CREATE POLICY "Owners can view their share links"
ON public.track_share_links
FOR SELECT
TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND NOT public.current_user_is_banned()
  AND public.current_user_can_use_feature('sharing_public_links')
);

DROP POLICY IF EXISTS "Users manage their own song analyses" ON public.song_analyses;
CREATE POLICY "Users manage their own song analyses"
ON public.song_analyses
FOR ALL
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND NOT public.current_user_is_banned()
  AND public.current_user_can_use_feature('song_analyzer')
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND NOT public.current_user_is_banned()
  AND public.current_user_can_use_feature('song_analyzer')
);

COMMIT;
