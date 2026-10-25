-- Private Review deletion: forward-only, no data is deleted by applying this migration.
-- Deletion itself is an explicitly confirmed owner action, not an automatic cleanup.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_finished_private_review_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_session
  FROM public.private_review_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.owner_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'private review not found or access denied';
  END IF;
  IF v_session.closed_at IS NULL AND v_session.expires_at > statement_timestamp() THEN
    RAISE EXCEPTION 'active private reviews cannot be deleted';
  END IF;

  DELETE FROM public.private_review_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'private review was not deleted'; END IF;

  -- Child reviewers, comments and admission rows use ON DELETE CASCADE.
  RETURN jsonb_build_object('deleted', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_finished_private_review_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_count integer;
  v_active integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- The track row lock serializes with FK-backed creation of track sessions.
  SELECT user_id INTO v_owner
  FROM public.tracks WHERE id = _track_id FOR UPDATE;
  IF NOT FOUND OR v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'private review track not found or access denied';
  END IF;

  -- Lock all currently attached sessions before deciding what may be removed.
  PERFORM 1 FROM public.private_review_sessions
  WHERE owner_id = (SELECT auth.uid()) AND source_type = 'track'
    AND source_track_id = _track_id
  ORDER BY id FOR UPDATE;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE closed_at IS NULL AND expires_at > statement_timestamp())::integer
  INTO v_count, v_active
  FROM public.private_review_sessions
  WHERE owner_id = (SELECT auth.uid()) AND source_type = 'track'
    AND source_track_id = _track_id;

  IF v_count = 0 THEN RAISE EXCEPTION 'no private reviews found'; END IF;
  IF v_active <> 0 THEN RAISE EXCEPTION 'active private reviews cannot be deleted'; END IF;

  DELETE FROM public.private_review_sessions
  WHERE owner_id = (SELECT auth.uid()) AND source_type = 'track'
    AND source_track_id = _track_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_finished_private_review_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_finished_private_review_track(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_finished_private_review_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_finished_private_review_track(uuid) TO authenticated, service_role;

COMMIT;
