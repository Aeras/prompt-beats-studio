-- Public/share lookups must not reveal private-track titles to non-owners.
CREATE OR REPLACE FUNCTION public.get_track_share_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.track_share_links%ROWTYPE;
  v_track public.tracks%ROWTYPE;
  v_artist jsonb;
BEGIN
  SELECT * INTO v_link
  FROM public.track_share_links
  WHERE token=_token AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id=v_link.track_id;

  IF NOT FOUND OR v_track.moderation_status<>'active' THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;

  IF v_track.is_published IS NOT TRUE THEN
    RETURN jsonb_build_object('state','private');
  END IF;

  UPDATE public.track_share_links
  SET open_count=open_count+1,last_opened_at=now()
  WHERE id=v_link.id;

  SELECT jsonb_build_object(
    'id',p.id,
    'handle',p.handle,
    'display_name',p.display_name,
    'artist_alias',p.artist_alias,
    'avatar_url',p.avatar_url,
    'staff_badge',p.staff_badge
  )
  INTO v_artist
  FROM public.public_profiles p
  WHERE p.id=v_track.user_id;

  RETURN jsonb_build_object(
    'state','active',
    'share_id',v_link.id,
    'track',jsonb_build_object(
      'id',v_track.id,
      'user_id',v_track.user_id,
      'title',v_track.title,
      'genre',v_track.genre,
      'prompt',CASE WHEN v_track.prompt_is_public AND v_link.include_prompt THEN v_track.prompt ELSE '' END,
      'lyrics',CASE WHEN v_track.lyrics_is_public AND v_link.include_lyrics THEN v_track.lyrics ELSE '' END,
      'prompt_is_public',v_track.prompt_is_public,
      'lyrics_is_public',v_track.lyrics_is_public,
      'contains_explicit_lyrics',v_track.contains_explicit_lyrics,
      'audio_url',v_track.audio_url,
      'audio_type',v_track.audio_type,
      'source_type',v_track.source_type,
      'source_url',v_track.source_url,
      'source_id',v_track.source_id,
      'created_with',v_track.created_with,
      'allow_download',v_track.allow_download,
      'art_url',v_track.art_url,
      'cover_url',v_track.cover_url,
      'duration_seconds',v_track.duration_seconds,
      'plays',v_track.plays,
      'is_published',v_track.is_published,
      'created_at',v_track.created_at
    ),
    'artist',v_artist
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_track_share_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_share_by_token(text)
  TO anon, authenticated, service_role;
