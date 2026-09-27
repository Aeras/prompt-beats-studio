-- Keep track deletion atomic when Private Review sessions reference the track.
-- A track-based review session cannot survive without its source track, so remove it.
-- A project-version review session may survive without the selected audio track; detach audio first.

CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_track public.tracks%ROWTYPE;
  v_cleanup jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.has_valid_account_state(v_actor) THEN
    RAISE EXCEPTION 'track not found or you do not have permission to delete it';
  END IF;

  SELECT user_id INTO v_owner
  FROM public.tracks
  WHERE id = _track_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'track not found or you do not have permission to delete it';
  END IF;

  PERFORM public._lock_user_security_pair(v_actor, v_owner);

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'track not found or you do not have permission to delete it';
  END IF;

  IF v_track.user_id <> v_actor AND NOT public.current_user_is_admin_level() THEN
    RAISE EXCEPTION 'track not found or you do not have permission to delete it';
  END IF;

  IF v_track.user_id = v_actor AND v_track.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'locked tracks cannot be deleted by their owner';
  END IF;

  v_cleanup := public.capture_track_storage_cleanup(
    _track_id,
    v_track.user_id,
    v_actor,
    v_track.audio_key,
    v_track.cover_url
  );

  -- A review whose source is this track has no meaningful source after deletion.
  -- Child reviewer/comment/admission rows are already ON DELETE CASCADE from the session.
  DELETE FROM public.private_review_sessions
  WHERE source_type = 'track'
    AND source_track_id = _track_id;

  -- A project-version review can remain valid without audio. Detach the deleted track
  -- while preserving the review session, comments, and reviewers.
  UPDATE public.private_review_sessions
  SET include_audio = false,
      shared_track_id = NULL
  WHERE source_type = 'project_version'
    AND shared_track_id = _track_id;

  DELETE FROM public.tracks
  WHERE id = _track_id;

  INSERT INTO public.admin_audit_log(admin_user_id, target_user_id, action, details)
  VALUES(
    v_actor,
    v_track.user_id,
    'DELETE_TRACK',
    v_cleanup || jsonb_build_object('track_id', _track_id)
  );

  RETURN jsonb_build_object('ok', true) || v_cleanup;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_track_with_cleanup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_track_with_cleanup(uuid) TO authenticated, service_role;
