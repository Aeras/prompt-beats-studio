-- Keep staff track inspection capability-gated while exposing only the
-- server-derived delete decision needed by the moderation UI.
CREATE OR REPLACE FUNCTION public.staff_get_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_track jsonb;
  v_owner_is_admin boolean := false;
  v_can_delete boolean;
BEGIN
  IF NOT public.has_moderation_capability('can_lock_tracks') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tracks t
    JOIN public.user_roles ur ON ur.user_id = t.user_id
    WHERE t.id = _track_id AND ur.role::text = 'admin'
  ) INTO v_owner_is_admin;

  v_can_delete := public.has_moderation_capability('can_delete_tracks')
    AND (NOT v_owner_is_admin
      OR public.has_role(auth.uid(), 'admin'::public.app_role));

  SELECT jsonb_build_object(
    'id', t.id, 'user_id', t.user_id, 'title', t.title, 'genre', t.genre,
    'prompt', t.prompt, 'lyrics', t.lyrics, 'audio_url', t.audio_url,
    'audio_type', t.audio_type, 'art_url', t.art_url, 'cover_url', t.cover_url,
    'duration_seconds', t.duration_seconds, 'plays', t.plays,
    'is_published', t.is_published, 'created_at', t.created_at,
    'moderation_status', t.moderation_status,
    'moderation_reason_code', t.moderation_reason_code,
    'moderation_reason_text', t.moderation_reason_text,
    'moderation_locked_at', t.moderation_locked_at,
    'can_delete_track', v_can_delete
  ) INTO v_track
  FROM public.tracks t
  WHERE t.id = _track_id;

  IF v_track IS NULL THEN RETURN NULL; END IF;
  RETURN v_track;
END;
$$;

-- Preserve the existing cleanup/audit flow and add a server-derived owner-role
-- check before any cleanup reference is persisted or the row is deleted.
CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup_id uuid;
  v_audio_key text;
  v_cover_path text;
  v_unsafe_audio_reference boolean := false;
  v_unsafe_cover_reference boolean := false;
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_track.user_id AND role::text = 'admin'
  ) AND NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_track.audio_key IS NOT NULL THEN
    IF left(v_track.audio_key, length('tracks/' || v_track.user_id::text || '/')) = 'tracks/' || v_track.user_id::text || '/'
      AND length(v_track.audio_key) > length('tracks/' || v_track.user_id::text || '/') THEN
      v_audio_key := v_track.audio_key;
    ELSE
      v_unsafe_audio_reference := true;
    END IF;
  END IF;

  IF v_track.cover_url IS NOT NULL THEN
    IF v_track.cover_url ~ '^https?://[^/]+/storage/v1/object/public/track-covers/.+$' THEN
      v_cover_path := substring(v_track.cover_url FROM '^https?://[^/]+/storage/v1/object/public/track-covers/(.+)$');
    ELSIF v_track.cover_url ~ '^[0-9a-fA-F-]{36}/.+$' THEN
      v_cover_path := v_track.cover_url;
    END IF;

    IF v_cover_path IS NULL
      OR left(v_cover_path, length(v_track.user_id::text || '/')) <> v_track.user_id::text || '/'
      OR length(v_cover_path) <= length(v_track.user_id::text || '/') THEN
      v_cover_path := NULL;
      v_unsafe_cover_reference := true;
    END IF;
  END IF;

  IF v_audio_key IS NOT NULL OR v_cover_path IS NOT NULL THEN
    INSERT INTO public.track_storage_cleanup (track_id, owner_id, audio_key, cover_path, created_by)
    VALUES (_track_id, v_track.user_id, v_audio_key, v_cover_path, v_actor)
    RETURNING id INTO v_cleanup_id;
  END IF;

  DELETE FROM public.tracks WHERE id = _track_id;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_actor, v_track.user_id, 'DELETE_TRACK', jsonb_build_object(
    'track_id', _track_id, 'had_audio_file', v_audio_key IS NOT NULL,
    'had_cover_file', v_cover_path IS NOT NULL, 'storage_cleanup_id', v_cleanup_id,
    'audio_cleanup_skipped', v_unsafe_audio_reference,
    'cover_cleanup_skipped', v_unsafe_cover_reference
  ));
  RETURN jsonb_build_object('ok', true, 'cleanup_id', v_cleanup_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_get_track(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_track(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_track(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_delete_track(uuid) TO authenticated, service_role;
