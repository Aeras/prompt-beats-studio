-- The existing column INSERT grants are intentional and sufficient. Do not
-- replace them with table grants or expose prompt/lyrics/audio_key/moderation notes.
GRANT SELECT (moderation_status) ON public.tracks TO authenticated;

-- Invoker rights retain caller JWT, column privileges and all existing RLS.
-- Serialize appends on the owned playlist so concurrent inserts receive ordered
-- positions, while the existing primary key remains the duplicate backstop.
CREATE FUNCTION public.add_playlist_track_atomic(_playlist_id uuid, _track_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_user_is_banned()
     OR NOT public.current_user_can_use_feature('playlists') THEN
    RAISE EXCEPTION 'Feature not available.';
  END IF;
  PERFORM p.id FROM public.playlists p
    WHERE p.id = _playlist_id AND p.user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  PERFORM t.id FROM public.tracks t
    WHERE t.id = _track_id AND t.moderation_status = 'active'
      AND t.source_type = 'upload'
      AND (t.is_published IS TRUE OR t.user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Track is unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.playlist_tracks pt
             WHERE pt.playlist_id = _playlist_id AND pt.track_id = _track_id) THEN
    RETURN 'exists';
  END IF;
  INSERT INTO public.playlist_tracks(playlist_id, track_id, position)
    SELECT _playlist_id, _track_id, COALESCE(max(pt.position), -1) + 1
    FROM public.playlist_tracks pt WHERE pt.playlist_id = _playlist_id
    ON CONFLICT (playlist_id, track_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'exists'; END IF;
  RETURN 'added';
END;
$$;
REVOKE ALL ON FUNCTION public.add_playlist_track_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_playlist_track_atomic(uuid, uuid) TO authenticated;

-- One PostgREST transaction: a failed initial track insert cannot leave an empty
-- playlist, unlike client-side insert + best-effort compensating DELETE.
CREATE FUNCTION public.create_playlist_with_track(
  _name text, _track_id uuid DEFAULT NULL, _cover_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_playlist public.playlists%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_is_banned()
     OR NOT public.current_user_can_use_feature('playlists') THEN
    RAISE EXCEPTION 'Feature not available.';
  END IF;
  INSERT INTO public.playlists(user_id, name, cover_url, is_public)
    VALUES (auth.uid(), btrim(_name), _cover_url, false)
    RETURNING * INTO v_playlist;
  IF _track_id IS NOT NULL THEN
    PERFORM public.add_playlist_track_atomic(v_playlist.id, _track_id);
  END IF;
  RETURN jsonb_build_object(
    'id', v_playlist.id, 'name', v_playlist.name, 'cover_url', v_playlist.cover_url,
    'is_public', v_playlist.is_public, 'created_at', v_playlist.created_at,
    'updated_at', v_playlist.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_playlist_with_track(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_playlist_with_track(text, uuid, text) TO authenticated;
