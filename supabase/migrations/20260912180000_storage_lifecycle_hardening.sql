-- Security Batch 4: durable storage lifecycle and upload admission hardening.
-- This migration does not alter creator visibility, play counting, AI, or billing.

ALTER TABLE public.track_storage_cleanup
  ALTER COLUMN track_id DROP NOT NULL;

ALTER TABLE public.track_storage_cleanup
  ADD COLUMN IF NOT EXISTS cleanup_type text NOT NULL DEFAULT 'track_delete';

ALTER TABLE public.track_storage_cleanup
  DROP CONSTRAINT IF EXISTS track_storage_cleanup_type_check;
ALTER TABLE public.track_storage_cleanup
  ADD CONSTRAINT track_storage_cleanup_type_check
  CHECK (cleanup_type IN ('track_delete', 'audio_replace', 'abandoned_upload'));

CREATE INDEX IF NOT EXISTS track_storage_cleanup_type_status_idx
  ON public.track_storage_cleanup (cleanup_type, status, created_at DESC);
-- Audio replacement must use the atomic cleanup RPC; browser-authenticated
-- updates retain only creator-editable metadata columns and cannot replace the
-- stored audio reference directly.
REVOKE UPDATE ON TABLE public.tracks FROM authenticated;
GRANT UPDATE (title, genre, prompt, lyrics, audio_url, audio_type, art_url, cover_url, duration_seconds, is_published)
  ON TABLE public.tracks TO authenticated;

-- Durable account-deletion work survives Auth row deletion and records only
-- server-derived, owner-scoped storage references.
CREATE TABLE IF NOT EXISTS public.account_storage_cleanup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  storage_kind text NOT NULL CHECK (storage_kind IN ('r2', 'supabase')),
  bucket text,
  object_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (storage_kind, bucket, object_path)
);

CREATE INDEX IF NOT EXISTS account_storage_cleanup_pending_idx
  ON public.account_storage_cleanup (status, created_at DESC);

ALTER TABLE public.account_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_storage_cleanup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_storage_cleanup TO service_role;

-- Atomic fixed-window admission for track audio uploads. A rejected request
-- still consumes the current window's attempt so parallel callers cannot race
-- a read-then-write check. The application limit is 20 accepted attempts per
-- user per hour; failed uploads do not create a storage object.
CREATE TABLE IF NOT EXISTS public.track_upload_admission (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.track_upload_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_upload_admission FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.track_upload_admission TO service_role;

CREATE OR REPLACE FUNCTION public.admit_track_upload()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_started timestamptz;
  v_count integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_valid_account_state(v_user_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.track_upload_admission (user_id, window_started_at, request_count)
  VALUES (v_user_id, v_now, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET window_started_at = CASE
        WHEN public.track_upload_admission.window_started_at <= v_now - interval '1 hour' THEN v_now
        ELSE public.track_upload_admission.window_started_at
      END,
      request_count = CASE
        WHEN public.track_upload_admission.window_started_at <= v_now - interval '1 hour' THEN 1
        ELSE public.track_upload_admission.request_count + 1
      END
  RETURNING window_started_at, request_count INTO v_started, v_count;

  RETURN v_started > v_now - interval '1 hour' AND v_count <= 20;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_track_upload() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_track_upload() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admit_track_upload() TO service_role;

-- Account cleanup reservations must also prevent a concurrent track from
-- adopting a cover while the object is pending physical deletion.
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
    SELECT 1 FROM public.track_cover_cleanup_locks WHERE cover_path = v_cover_path
  ) OR EXISTS (
    SELECT 1
    FROM public.account_storage_cleanup
    WHERE storage_kind = 'supabase'
      AND bucket = 'track-covers'
      AND object_path = v_cover_path
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'track cover is pending deletion';
  END IF;

  RETURN NEW;
END;
$$;

-- Atomic owner audio replacement: the old reference is captured in the
-- existing cleanup ledger in the same transaction as the track update.
CREATE OR REPLACE FUNCTION public.replace_track_with_audio_cleanup(
  _track_id uuid,
  _title text,
  _genre text,
  _prompt text,
  _lyrics text,
  _audio_url text,
  _audio_type text,
  _audio_key text,
  _is_published boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup_id uuid;
  v_old_cleanup_skipped boolean := false;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_valid_account_state(v_actor) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF (_audio_key IS NOT NULL AND NOT public.is_safe_track_storage_path(_audio_key, 'tracks/' || v_actor::text || '/'))
    OR (_audio_key IS NOT NULL AND _audio_type <> 'upload')
    OR (_audio_key IS NULL AND _audio_type <> 'link')
  THEN
    RAISE EXCEPTION 'invalid audio reference';
  END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id AND user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to edit it'; END IF;

  IF v_track.audio_key IS NOT NULL AND v_track.audio_key <> _audio_key THEN
    IF public.is_safe_track_storage_path(v_track.audio_key, 'tracks/' || v_actor::text || '/')
      AND NOT EXISTS (
        SELECT 1 FROM public.tracks t
        WHERE t.id <> _track_id AND t.audio_key = v_track.audio_key
      )
    THEN
      INSERT INTO public.track_storage_cleanup (track_id, owner_id, audio_key, created_by, cleanup_type)
      VALUES (_track_id, v_actor, v_track.audio_key, v_actor, 'audio_replace')
      RETURNING id INTO v_cleanup_id;
    ELSE
      v_old_cleanup_skipped := true;
    END IF;
  END IF;

  UPDATE public.tracks
  SET title = _title,
      genre = _genre,
      prompt = _prompt,
      lyrics = _lyrics,
      audio_url = _audio_url,
      audio_type = _audio_type,
      audio_key = _audio_key,
      is_published = _is_published
  WHERE id = _track_id AND user_id = v_actor;

  SELECT to_jsonb(t) INTO v_result FROM public.tracks t WHERE t.id = _track_id;
  RETURN jsonb_build_object(
    'track', v_result,
    'cleanup_id', v_cleanup_id,
    'old_cleanup_skipped', v_old_cleanup_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_track_with_audio_cleanup(uuid,text,text,text,text,text,text,text,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_track_with_audio_cleanup(uuid,text,text,text,text,text,text,text,boolean)
  TO authenticated, service_role;

COMMENT ON TABLE public.account_storage_cleanup IS
  'Service-only durable account storage cleanup ledger; object paths are server-validated before insertion.';
-- Reserve pending internally-managed audio keys so no track can adopt an
-- object after it has been scheduled for physical cleanup. The reservation
-- is database-enforced and is released only after cleanup is complete.
CREATE TABLE IF NOT EXISTS public.track_audio_cleanup_locks (
  audio_key text PRIMARY KEY,
  cleanup_id uuid NOT NULL REFERENCES public.track_storage_cleanup(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.track_audio_cleanup_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.track_audio_cleanup_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.track_audio_cleanup_locks TO service_role;

INSERT INTO public.track_audio_cleanup_locks (audio_key, cleanup_id)
SELECT DISTINCT ON (c.audio_key) c.audio_key, c.id
FROM public.track_storage_cleanup c
WHERE c.status = 'pending'
  AND c.owner_id IS NOT NULL
  AND c.audio_key IS NOT NULL
  AND public.is_safe_track_storage_path(c.audio_key, 'tracks/' || c.owner_id::text || '/')
ORDER BY c.audio_key, c.created_at, c.id
ON CONFLICT (audio_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reserve_pending_track_audio_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.status = 'pending'
    AND NEW.audio_key IS NOT NULL
    AND NEW.owner_id IS NOT NULL
    AND public.is_safe_track_storage_path(NEW.audio_key, 'tracks/' || NEW.owner_id::text || '/')
  THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.audio_key, 0));
    IF NOT EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.audio_key = NEW.audio_key
        AND (NEW.track_id IS NULL OR t.id <> NEW.track_id)
    ) THEN
      INSERT INTO public.track_audio_cleanup_locks (audio_key, cleanup_id)
      VALUES (NEW.audio_key, NEW.id)
      ON CONFLICT (audio_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pending_track_audio_cleanup() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS reserve_pending_track_audio_cleanup ON public.track_storage_cleanup;
CREATE TRIGGER reserve_pending_track_audio_cleanup
  AFTER INSERT ON public.track_storage_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.reserve_pending_track_audio_cleanup();

CREATE OR REPLACE FUNCTION public.prevent_pending_track_audio_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.audio_key IS NOT DISTINCT FROM OLD.audio_key THEN
    RETURN NEW;
  END IF;
  IF NEW.audio_key IS NULL OR NEW.audio_type <> 'upload'
    OR NOT public.is_safe_track_storage_path(NEW.audio_key, 'tracks/' || NEW.user_id::text || '/')
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.audio_key, 0));
  IF EXISTS (
    SELECT 1 FROM public.track_audio_cleanup_locks l
    WHERE l.audio_key = NEW.audio_key
  ) OR EXISTS (
    SELECT 1
    FROM public.track_storage_cleanup c
    WHERE c.status = 'pending' AND c.audio_key = NEW.audio_key
      AND public.is_safe_track_storage_path(c.audio_key, 'tracks/' || c.owner_id::text || '/')
  ) THEN
    RAISE EXCEPTION 'track audio is pending deletion';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_pending_track_audio_reference() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS prevent_pending_track_audio_reference ON public.tracks;
CREATE TRIGGER prevent_pending_track_audio_reference
  BEFORE INSERT OR UPDATE OF audio_key ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pending_track_audio_reference();

-- Recheck audio references while holding the same key lock immediately before
-- physical cleanup. Existing references preserve the object; completion then
-- releases any reservation without deleting the live object.
CREATE OR REPLACE FUNCTION public.staff_get_track_storage_cleanup(_cleanup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_owner_id uuid;
  v_track_id uuid;
  v_audio_key text;
  v_cover_path text;
  v_status text;
  v_attempt_count integer;
  v_cleanup jsonb;
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT owner_id, track_id, audio_key, cover_path, status, attempt_count
    INTO v_owner_id, v_track_id, v_audio_key, v_cover_path, v_status, v_attempt_count
  FROM public.track_storage_cleanup
  WHERE id = _cleanup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup not found'; END IF;

  IF v_audio_key IS NULL OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_audio_key, 'tracks/' || v_owner_id::text || '/')
  THEN
    v_audio_key := NULL;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_audio_key, 0));
    IF EXISTS (SELECT 1 FROM public.tracks t WHERE t.audio_key = v_audio_key) THEN
      v_audio_key := NULL;
    END IF;
  END IF;

  IF v_cover_path IS NULL OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_cover_path, v_owner_id::text || '/')
  THEN
    v_cover_path := NULL;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cover_path, 0));
    IF EXISTS (SELECT 1 FROM public.tracks t WHERE public.track_cover_path(t.cover_url) = v_cover_path) THEN
      v_cover_path := NULL;
    END IF;
  END IF;

  v_cleanup := jsonb_build_object(
    'id', _cleanup_id, 'owner_id', v_owner_id,
    'audio_key', v_audio_key, 'cover_path', v_cover_path,
    'status', v_status, 'attempt_count', v_attempt_count
  );
  RETURN v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_complete_track_storage_cleanup(_cleanup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_audio_key text;
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT audio_key INTO v_audio_key FROM public.track_storage_cleanup WHERE id = _cleanup_id;
  DELETE FROM public.track_cover_cleanup_locks WHERE cleanup_id = _cleanup_id;
  DELETE FROM public.track_audio_cleanup_locks l
  WHERE l.cleanup_id = _cleanup_id
    AND NOT EXISTS (
      SELECT 1 FROM public.track_storage_cleanup c
      WHERE c.status = 'pending' AND c.audio_key = v_audio_key AND c.id <> _cleanup_id
    );
  UPDATE public.track_storage_cleanup
  SET status = 'complete', completed_at = now(), last_error = NULL, attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_get_track_storage_cleanup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_track_storage_cleanup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) TO service_role;