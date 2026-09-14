-- Owner edits retain the existing track row while safely replacing optional
-- owned media and preserving the immutable provider/source category.
CREATE FUNCTION public.edit_track_with_cleanup(
  _track_id uuid,
  _title text,
  _genre text,
  _prompt text,
  _lyrics text,
  _source_type text,
  _source_url text DEFAULT NULL,
  _source_id text DEFAULT NULL,
  _new_audio_url text DEFAULT NULL,
  _new_audio_key text DEFAULT NULL,
  _new_cover_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_old_audio text;
  v_old_cover text;
  v_cleanup jsonb := '{}'::jsonb;
  v_cleanup_id uuid;
  v_cover_path text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT * INTO v_track FROM public.tracks
  WHERE id = _track_id AND user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND OR v_track.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'track not found or you do not have permission to edit it';
  END IF;
  IF length(trim(_title)) NOT BETWEEN 1 AND 120
    OR length(trim(_genre)) NOT BETWEEN 1 AND 60
    OR length(trim(COALESCE(_prompt, ''))) > 4000
    OR length(trim(COALESCE(_lyrics, ''))) > 8000 THEN
    RAISE EXCEPTION 'invalid track metadata';
  END IF;

  IF v_track.source_type = 'upload' THEN
    IF _source_type <> 'upload' OR _source_url IS NOT NULL OR _source_id IS NOT NULL THEN
      RAISE EXCEPTION 'track source cannot be changed';
    END IF;
    IF (_new_audio_url IS NULL) <> (_new_audio_key IS NULL) THEN
      RAISE EXCEPTION 'incomplete uploaded audio replacement';
    END IF;
    IF _new_audio_key IS NOT NULL AND NOT public.is_safe_track_storage_path(_new_audio_key, 'tracks/' || v_actor::text || '/') THEN
      RAISE EXCEPTION 'invalid uploaded audio reference';
    END IF;
    IF _new_cover_url IS NOT NULL THEN
      v_cover_path := public.track_cover_path(_new_cover_url);
      IF v_cover_path IS NULL OR NOT public.is_safe_track_storage_path(v_cover_path, v_actor::text || '/') THEN
        RAISE EXCEPTION 'invalid uploaded cover reference';
      END IF;
    END IF;
    v_old_audio := CASE WHEN _new_audio_key IS NOT NULL AND _new_audio_key IS DISTINCT FROM v_track.audio_key THEN v_track.audio_key END;
    v_old_cover := CASE WHEN _new_cover_url IS NOT NULL AND _new_cover_url IS DISTINCT FROM v_track.cover_url THEN v_track.cover_url END;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')), audio_url = COALESCE(_new_audio_url, v_track.audio_url),
      audio_key = COALESCE(_new_audio_key, v_track.audio_key), cover_url = COALESCE(_new_cover_url, v_track.cover_url)
    WHERE id = _track_id;
  ELSIF v_track.source_type IN ('suno', 'udio', 'youtube') THEN
    IF _source_type <> v_track.source_type OR _source_url IS NULL OR _source_id IS NULL
      OR _new_audio_url IS NOT NULL OR _new_audio_key IS NOT NULL OR _new_cover_url IS NOT NULL THEN
      RAISE EXCEPTION 'track source cannot be changed';
    END IF;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')), source_url = _source_url, source_id = _source_id,
      audio_url = _source_url, audio_type = 'link', audio_key = NULL, cover_url = NULL
    WHERE id = _track_id;
  ELSE
    IF _source_type <> v_track.source_type OR _source_url IS NOT NULL OR _source_id IS NOT NULL
      OR _new_audio_url IS NOT NULL OR _new_audio_key IS NOT NULL OR _new_cover_url IS NOT NULL THEN
      RAISE EXCEPTION 'legacy track source is metadata-only';
    END IF;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')) WHERE id = _track_id;
  END IF;

  IF v_old_audio IS NOT NULL OR v_old_cover IS NOT NULL THEN
    v_cleanup := public.capture_track_storage_cleanup(_track_id, v_actor, v_actor, v_old_audio, v_old_cover);
    v_cleanup_id := NULLIF(v_cleanup ->> 'cleanup_id', '')::uuid;
    IF v_cleanup_id IS NOT NULL THEN
      UPDATE public.track_storage_cleanup SET cleanup_type = 'audio_replace' WHERE id = v_cleanup_id;
    END IF;
  END IF;
  SELECT to_jsonb(t) INTO v_result FROM public.tracks t WHERE t.id = _track_id;
  RETURN jsonb_build_object('track', v_result) || v_cleanup;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_track_with_cleanup(uuid,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_track_with_cleanup(uuid,text,text,text,text,text,text,text,text,text,text) TO authenticated, service_role;

-- Owner edits, including metadata, must use the owner-authorized RPC above.
-- This prevents direct PostgREST updates from bypassing its account-state and
-- moderation-lock checks. INSERT and service-role privileges are unchanged.
REVOKE UPDATE ON public.tracks FROM authenticated;
