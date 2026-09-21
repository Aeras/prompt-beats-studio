-- PromptBeats Feature Access V2 — mutation/RPC enforcement for uploads,
-- sharing, playlists, favorites, and likes while preserving all read paths.
BEGIN;

CREATE OR REPLACE FUNCTION public.admit_track_upload()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid:=auth.uid();
  v_now timestamptz:=now();
  v_started timestamptz;
  v_count integer;
BEGIN
  IF v_user_id IS NULL
     OR NOT public.has_valid_account_state(v_user_id)
     OR NOT public.can_use_feature(v_user_id,'track_uploads')
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.track_upload_admission(user_id,window_started_at,request_count)
  VALUES(v_user_id,v_now,1)
  ON CONFLICT(user_id) DO UPDATE
  SET window_started_at=CASE
        WHEN public.track_upload_admission.window_started_at<=v_now-interval '1 hour' THEN v_now
        ELSE public.track_upload_admission.window_started_at
      END,
      request_count=CASE
        WHEN public.track_upload_admission.window_started_at<=v_now-interval '1 hour' THEN 1
        ELSE public.track_upload_admission.request_count+1
      END
  RETURNING window_started_at,request_count INTO v_started,v_count;

  RETURN v_started>v_now-interval '1 hour' AND v_count<=20;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_track_share_link(
  _track_id uuid,_include_prompt boolean DEFAULT false,_include_lyrics boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_track public.tracks%ROWTYPE;
  v_link public.track_share_links%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_actor)
     OR NOT public.can_use_feature(v_actor,'sharing_public_links')
  THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id=_track_id AND user_id=v_actor AND moderation_status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  INSERT INTO public.track_share_links(track_id,owner_id,include_prompt,include_lyrics)
  VALUES(_track_id,v_actor,COALESCE(_include_prompt,false),COALESCE(_include_lyrics,false))
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'id',v_link.id,'token',v_link.token,'track_id',v_link.track_id,
    'include_prompt',v_link.include_prompt,'include_lyrics',v_link.include_lyrics,
    'created_at',v_link.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_track_public_share(_track_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.current_user_can_use_feature('sharing_public_links') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tracks
    WHERE id=_track_id
      AND is_published=true
      AND moderation_status='active'
      AND user_id<>auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.track_share_events(track_id,shared_by)
  VALUES(_track_id,auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.update_track_share_link(
  _share_id uuid,_include_prompt boolean,_include_lyrics boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.current_user_can_use_feature('sharing_public_links') THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  UPDATE public.track_share_links
  SET include_prompt=COALESCE(_include_prompt,false),
      include_lyrics=COALESCE(_include_lyrics,false)
  WHERE id=_share_id AND owner_id=auth.uid() AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'active share link not found'; END IF;
END;
$$;

-- Revocation intentionally remains ungated for privacy/safety.
CREATE OR REPLACE FUNCTION public.reorder_playlist_tracks(_playlist_id uuid,_track_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_count integer;
BEGIN
  IF v_actor IS NULL
     OR public.current_user_is_banned()
     OR NOT public.can_use_feature(v_actor,'playlists')
  THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.playlists WHERE id=_playlist_id AND user_id=v_actor) THEN
    RAISE EXCEPTION 'Playlist not found';
  END IF;

  SELECT count(*) INTO v_count FROM public.playlist_tracks WHERE playlist_id=_playlist_id;
  IF cardinality(_track_ids)<>v_count THEN RAISE EXCEPTION 'Playlist order is incomplete'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(_track_ids) AS ids(id))<>v_count THEN
    RAISE EXCEPTION 'Playlist order contains duplicates';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM unnest(_track_ids) AS ids(id)
    LEFT JOIN public.playlist_tracks pt
      ON pt.playlist_id=_playlist_id AND pt.track_id=ids.id
    WHERE pt.track_id IS NULL
  ) THEN RAISE EXCEPTION 'Playlist order contains an invalid track'; END IF;

  UPDATE public.playlist_tracks pt
  SET position=ordered.position
  FROM (
    SELECT id,(ordinality-1)::integer AS position
    FROM unnest(_track_ids) WITH ORDINALITY AS ids(id,ordinality)
  ) ordered
  WHERE pt.playlist_id=_playlist_id AND pt.track_id=ordered.id;
END;
$$;

DROP POLICY IF EXISTS "Users can create their own tracks" ON public.tracks;
CREATE POLICY "Users can create their own tracks"
  ON public.tracks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()=user_id
    AND NOT public.current_user_is_banned()
    AND (source_type<>'upload' OR public.current_user_can_use_feature('track_uploads'))
  );

DROP POLICY IF EXISTS "Owners can create playlists" ON public.playlists;
CREATE POLICY "Owners can create playlists"
  ON public.playlists FOR INSERT TO authenticated
  WITH CHECK (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
  );

DROP POLICY IF EXISTS "Owners can update playlists" ON public.playlists;
CREATE POLICY "Owners can update playlists"
  ON public.playlists FOR UPDATE TO authenticated
  USING (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
  )
  WITH CHECK (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
  );

DROP POLICY IF EXISTS "Owners can delete playlists" ON public.playlists;
CREATE POLICY "Owners can delete playlists"
  ON public.playlists FOR DELETE TO authenticated
  USING (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
  );

DROP POLICY IF EXISTS "Owners can add eligible playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Owners can add eligible playlist tracks"
  ON public.playlist_tracks FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
    AND EXISTS(
      SELECT 1 FROM public.playlists p
      WHERE p.id=playlist_tracks.playlist_id AND p.user_id=auth.uid()
    )
    AND EXISTS(
      SELECT 1 FROM public.tracks t
      WHERE t.id=playlist_tracks.track_id
        AND t.source_type='upload'
        AND (t.is_published=true OR t.user_id=auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can remove playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Owners can remove playlist tracks"
  ON public.playlist_tracks FOR DELETE TO authenticated
  USING (
    NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('playlists')
    AND EXISTS(
      SELECT 1 FROM public.playlists p
      WHERE p.id=playlist_tracks.playlist_id AND p.user_id=auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create their own favorites" ON public.favorites;
CREATE POLICY "Users can create their own favorites"
  ON public.favorites FOR INSERT TO authenticated
  WITH CHECK (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('favorites')
    AND EXISTS(
      SELECT 1 FROM public.tracks t
      WHERE t.id=favorites.track_id AND (t.is_published=true OR t.user_id=auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can remove their own favorites" ON public.favorites;
CREATE POLICY "Users can remove their own favorites"
  ON public.favorites FOR DELETE TO authenticated
  USING (
    user_id=auth.uid()
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('favorites')
  );

DROP POLICY IF EXISTS "Users can like as themselves" ON public.likes;
CREATE POLICY "Users can like as themselves"
  ON public.likes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()=user_id
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('likes')
  );

DROP POLICY IF EXISTS "Users can remove their own likes" ON public.likes;
CREATE POLICY "Users can remove their own likes"
  ON public.likes FOR DELETE TO authenticated
  USING (
    auth.uid()=user_id
    AND NOT public.current_user_is_banned()
    AND public.current_user_can_use_feature('likes')
  );

COMMIT;
