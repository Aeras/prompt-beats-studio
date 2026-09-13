-- Batch 8: enforce canonical account state for counted plays and ensure every
-- successful track deletion through the owner/admin cleanup RPC is audited.

CREATE OR REPLACE FUNCTION public.increment_track_play(_track_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_listener uuid := auth.uid();
  v_duration integer;
  v_min_interval interval;
  v_plays integer;
BEGIN
  -- Keep the existing no-op contract for anonymous callers, and fail closed
  -- for banned, deleted, or otherwise non-canonical accounts before touching
  -- eligibility or the durable listener throttle.
  IF v_listener IS NULL OR NOT public.has_valid_account_state(v_listener) THEN
    RETURN NULL;
  END IF;

  SELECT duration_seconds INTO v_duration
  FROM public.tracks
  WHERE id = _track_id AND is_published = true AND moderation_status = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A listener cannot register another play sooner than the server-side
  -- meaningful-listen threshold for this track. Unknown durations use a
  -- conservative 30-second fallback; very short tracks retain a 5-second
  -- lower bound to prevent rapid direct-call inflation.
  v_min_interval := make_interval(secs => GREATEST(
    5,
    CEIL(COALESCE(v_duration, 30)::numeric * 0.7)::integer
  ));

  INSERT INTO public.track_play_throttles (track_id, listener_user_id, last_counted_at)
  VALUES (_track_id, v_listener, now())
  ON CONFLICT (track_id, listener_user_id) DO UPDATE
  SET last_counted_at = now()
  WHERE public.track_play_throttles.last_counted_at <= now() - v_min_interval;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.tracks
  SET plays = plays + 1
  WHERE id = _track_id
    AND is_published = true
    AND moderation_status = 'active'
  RETURNING plays INTO v_plays;

  RETURN v_plays;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_track_play(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_track_play(uuid) TO authenticated, service_role;

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

  IF v_track.user_id <> v_actor AND NOT public.current_user_has_role('admin') THEN
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

  DELETE FROM public.tracks WHERE id = _track_id;

  -- This shares the staff-delete action contract but records no content or
  -- provider data: only the actor, owner, track identity, and existing cleanup
  -- summary. A logging failure rolls back the deletion and cleanup intent.
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (
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
