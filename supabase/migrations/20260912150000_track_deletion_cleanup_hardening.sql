-- Unify owner and staff track deletion around the existing durable cleanup
-- ledger. Track-specific child rows continue to be removed by their existing
-- foreign-key cascades; audit and cleanup evidence intentionally remain.

CREATE OR REPLACE FUNCTION public.track_cover_path(_cover_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _cover_url ~ '^https?://[^/]+/storage/v1/object/public/track-covers/.+$'
      THEN substring(_cover_url FROM '^https?://[^/]+/storage/v1/object/public/track-covers/(.+)$')
    WHEN _cover_url ~ '^[0-9a-fA-F-]{36}/.+$'
      THEN _cover_url
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.track_cover_path(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_safe_track_storage_path(_path text, _prefix text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _path IS NOT NULL
    AND _prefix IS NOT NULL
    AND left(_path, length(_prefix)) = _prefix
    AND length(_path) > length(_prefix)
    AND left(_path, 1) <> '/'
    AND position(chr(92) in _path) = 0
    AND position(':' in _path) = 0
    AND position('%' in _path) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(string_to_array(_path, '/')) AS segment(value)
      WHERE value IN ('', '.', '..')
    );
$$;

REVOKE ALL ON FUNCTION public.is_safe_track_storage_path(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- A pending cover cleanup reserves the normalized object path. The trigger
-- below prevents a concurrent INSERT/UPDATE from adopting that path while
-- physical deletion is in progress.
CREATE TABLE IF NOT EXISTS public.track_cover_cleanup_locks (
  cover_path text PRIMARY KEY,
  cleanup_id uuid NOT NULL REFERENCES public.track_storage_cleanup(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.track_cover_cleanup_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.track_cover_cleanup_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.track_cover_cleanup_locks TO service_role;

-- Protect cleanup records created by earlier versions of the deletion
-- function as well. Unsafe or ownerless legacy paths are deliberately not
-- reserved and are filtered again by the cleanup RPC below.
INSERT INTO public.track_cover_cleanup_locks (cover_path, cleanup_id)
SELECT DISTINCT ON (c.cover_path) c.cover_path, c.id
FROM public.track_storage_cleanup c
WHERE c.status = 'pending'
  AND c.cover_path IS NOT NULL
  AND c.owner_id IS NOT NULL
  AND public.is_safe_track_storage_path(c.cover_path, c.owner_id::text || '/')
ORDER BY c.cover_path, c.created_at, c.id
ON CONFLICT (cover_path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prevent_pending_track_cover_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cover_path text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.cover_url IS NOT DISTINCT FROM OLD.cover_url THEN
    RETURN NEW;
  END IF;

  v_cover_path := public.track_cover_path(NEW.cover_url);
  IF v_cover_path IS NULL
    OR NOT public.is_safe_track_storage_path(v_cover_path, '')
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_cover_path, 0));
  IF EXISTS (
    SELECT 1 FROM public.track_cover_cleanup_locks
    WHERE cover_path = v_cover_path
  ) THEN
    RAISE EXCEPTION 'track cover is pending deletion';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_pending_track_cover_reference() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS prevent_pending_track_cover_reference ON public.tracks;
CREATE TRIGGER prevent_pending_track_cover_reference
  BEFORE INSERT OR UPDATE OF cover_url ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pending_track_cover_reference();

CREATE OR REPLACE FUNCTION public.capture_track_storage_cleanup(
  _track_id uuid,
  _owner_id uuid,
  _created_by uuid,
  _audio_key text,
  _cover_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_audio_key text;
  v_cover_path text;
  v_cleanup_id uuid;
  v_unsafe_audio boolean := false;
  v_unsafe_cover boolean := false;
  v_shared_cover boolean := false;
  v_audio_prefix text := 'tracks/' || _owner_id::text || '/';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tracks
    WHERE id = _track_id AND user_id = _owner_id
  ) THEN
    RAISE EXCEPTION 'track not found';
  END IF;

  IF _audio_key IS NOT NULL THEN
    IF public.is_safe_track_storage_path(_audio_key, v_audio_prefix)
    THEN
      v_audio_key := _audio_key;
    ELSE
      v_unsafe_audio := true;
    END IF;
  END IF;

  v_cover_path := public.track_cover_path(_cover_url);
  IF _cover_url IS NOT NULL AND v_cover_path IS NULL THEN
    v_unsafe_cover := true;
  END IF;

  IF v_cover_path IS NOT NULL THEN
    IF NOT public.is_safe_track_storage_path(v_cover_path, _owner_id::text || '/')
    THEN
      v_cover_path := NULL;
      v_unsafe_cover := true;
    ELSE
      -- Serialize this check with INSERT/UPDATE cover triggers and with
      -- other cleanup attempts for the same normalized object path.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_cover_path, 0));
      IF EXISTS (
        SELECT 1
        FROM public.tracks t
        WHERE t.id <> _track_id
          AND public.track_cover_path(t.cover_url) = v_cover_path
      ) THEN
        -- Shared artwork is not owned exclusively by this track.
        v_cover_path := NULL;
        v_shared_cover := true;
      END IF;
    END IF;
  END IF;

  IF v_audio_key IS NOT NULL OR v_cover_path IS NOT NULL THEN
    INSERT INTO public.track_storage_cleanup (track_id, owner_id, audio_key, cover_path, created_by)
    VALUES (_track_id, _owner_id, v_audio_key, v_cover_path, _created_by)
    RETURNING id INTO v_cleanup_id;

    IF v_cover_path IS NOT NULL THEN
      INSERT INTO public.track_cover_cleanup_locks (cover_path, cleanup_id)
      VALUES (v_cover_path, v_cleanup_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'cleanup_id', v_cleanup_id,
    'audio_cleanup_skipped', v_unsafe_audio,
    'cover_cleanup_skipped', v_unsafe_cover,
    'shared_cover_preserved', v_shared_cover
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_track_storage_cleanup(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Allow the existing cleanup ledger workflow to be used by the owner that
-- created an owner-delete record, while preserving staff capability checks.
CREATE OR REPLACE FUNCTION public.can_manage_track_storage_cleanup(_cleanup_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.has_moderation_capability('can_delete_tracks')
    OR EXISTS (
      SELECT 1 FROM public.track_storage_cleanup
      WHERE id = _cleanup_id AND created_by = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_track_storage_cleanup(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup jsonb;
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

  v_cleanup := public.capture_track_storage_cleanup(
    _track_id, v_track.user_id, v_actor, v_track.audio_key, v_track.cover_url
  );

  DELETE FROM public.tracks WHERE id = _track_id;

  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_actor, v_track.user_id, 'DELETE_TRACK',
    v_cleanup || jsonb_build_object('track_id', _track_id));

  RETURN jsonb_build_object('ok', true) || v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id
    AND (user_id = v_actor OR public.has_role(v_actor, 'admin'::public.app_role))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;

  v_cleanup := public.capture_track_storage_cleanup(
    _track_id, v_track.user_id, v_actor, v_track.audio_key, v_track.cover_url
  );

  DELETE FROM public.tracks
  WHERE id = _track_id
    AND (user_id = v_actor OR public.has_role(v_actor, 'admin'::public.app_role));
  IF NOT FOUND THEN RAISE EXCEPTION 'track could not be deleted'; END IF;

  RETURN jsonb_build_object('ok', true) || v_cleanup;
END;
$$;

-- Cleanup RPCs remain protected from browser table access. Staff may manage
-- any cleanup; an owner may manage only a record they created for their own
-- deleted track.
CREATE OR REPLACE FUNCTION public.staff_get_track_storage_cleanup(_cleanup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cleanup jsonb;
  v_owner_id uuid;
  v_audio_key text;
  v_cover_path text;
  v_status text;
  v_attempt_count integer;
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT owner_id, audio_key, cover_path, status, attempt_count
  INTO v_owner_id, v_audio_key, v_cover_path, v_status, v_attempt_count
  FROM public.track_storage_cleanup
  WHERE id = _cleanup_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup not found'; END IF;

  IF v_audio_key IS NULL
    OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_audio_key, 'tracks/' || v_owner_id::text || '/')
  THEN
    v_audio_key := NULL;
  END IF;

  IF v_cover_path IS NULL
    OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_cover_path, v_owner_id::text || '/')
  THEN
    v_cover_path := NULL;
  END IF;

  v_cleanup := jsonb_build_object(
    'id', _cleanup_id, 'audio_key', v_audio_key, 'cover_path', v_cover_path,
    'status', v_status, 'attempt_count', v_attempt_count
  );

  -- Revalidate immediately before the caller performs physical deletion. The
  -- reservation trigger prevents a new reference after this check.
  IF v_cover_path IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cover_path, 0));
    IF EXISTS (
      SELECT 1
      FROM public.tracks t
      WHERE public.track_cover_path(t.cover_url) = v_cover_path
    ) THEN
      v_cover_path := NULL;
    END IF;
  END IF;

  v_cleanup := jsonb_set(v_cleanup, '{cover_path}', to_jsonb(v_cover_path));
  RETURN v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_complete_track_storage_cleanup(_cleanup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.track_cover_cleanup_locks WHERE cleanup_id = _cleanup_id;
  UPDATE public.track_storage_cleanup
  SET status = 'complete', completed_at = now(), last_error = NULL, attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_fail_track_storage_cleanup(_cleanup_id uuid, _error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.track_storage_cleanup
  SET last_error = left(COALESCE(_error, 'storage cleanup failed'), 1000), attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_track_with_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_get_track_storage_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_fail_track_storage_cleanup(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_track_with_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_track_storage_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_fail_track_storage_cleanup(uuid,text) TO authenticated, service_role;
