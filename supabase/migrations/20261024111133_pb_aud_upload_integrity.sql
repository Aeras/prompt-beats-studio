BEGIN;

-- No backfill: legacy tracks retain their existing references. Only new audio
-- attachments need proof of a successful server-observed upload.
CREATE TABLE public.audio_upload_receipts (
  key text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  size integer NOT NULL CHECK (size BETWEEN 1 AND 52428800),
  mime text NOT NULL CHECK (mime IN ('audio/mpeg','audio/wav')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  canonical_url text NOT NULL CHECK (canonical_url ~ '^https://'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','finalized','discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  etag text,
  consumed_at timestamptz,
  consumed_track_id uuid,
  CHECK (public.is_safe_track_storage_path(key,'tracks/' || owner_id::text || '/')),
  CHECK (status <> 'finalized' OR (finalized_at IS NOT NULL AND etag IS NOT NULL)),
  CHECK ((consumed_at IS NULL) = (consumed_track_id IS NULL))
);
ALTER TABLE public.audio_upload_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audio_upload_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.audio_upload_receipts TO service_role;
CREATE INDEX audio_upload_receipts_expiry ON public.audio_upload_receipts(expires_at)
  WHERE consumed_at IS NULL;

CREATE FUNCTION public.enforce_finalized_audio_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r public.audio_upload_receipts;
BEGIN
  IF NEW.source_type <> 'upload' THEN RETURN NEW; END IF;
  -- Metadata-only edits of historical tracks must remain supported.
  IF TG_OP='UPDATE' AND OLD.source_type='upload' AND NEW.audio_key IS NOT DISTINCT FROM OLD.audio_key THEN
    NEW.audio_url := OLD.audio_url;
    RETURN NEW;
  END IF;
  IF NEW.audio_key IS NULL OR NOT public.is_safe_track_storage_path(NEW.audio_key,'tracks/' || NEW.user_id::text || '/')
    THEN RAISE EXCEPTION 'invalid owned upload reference'; END IF;
  -- Same lock as the existing cleanup reservation/reference barriers.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.audio_key,0));
  SELECT * INTO r FROM public.audio_upload_receipts WHERE key=NEW.audio_key FOR UPDATE;
  IF NOT FOUND OR r.owner_id<>NEW.user_id OR r.status<>'finalized'
    OR r.consumed_at IS NOT NULL OR r.expires_at<=now()
    THEN RAISE EXCEPTION 'finalized upload receipt unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.track_audio_cleanup_locks WHERE audio_key=NEW.audio_key)
    THEN RAISE EXCEPTION 'uploaded audio is pending cleanup'; END IF;
  NEW.audio_url := r.canonical_url;
  NEW.audio_type := 'upload';
  -- Bind duplicate-detection identity to actual uploaded bytes where present.
  IF TG_OP='INSERT' AND NEW.audio_content_hash IS NOT NULL AND NEW.audio_content_hash<>r.sha256
    THEN RAISE EXCEPTION 'uploaded audio checksum mismatch'; END IF;
  NEW.audio_content_hash := r.sha256;
  IF TG_OP='UPDATE' THEN NEW.audio_fingerprint := NULL; END IF;
  UPDATE public.audio_upload_receipts SET consumed_at=now(),consumed_track_id=NEW.id WHERE key=r.key;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_finalized_audio_receipt() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER enforce_finalized_audio_receipt BEFORE INSERT OR UPDATE ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finalized_audio_receipt();

-- Discard and creation serialize on the same key. A cleanup accepted first
-- invalidates the receipt; a committed track is protected by existing cleanup checks.
CREATE FUNCTION public.invalidate_abandoned_audio_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.status='pending' AND NEW.audio_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.audio_key,0));
    IF NOT EXISTS (SELECT 1 FROM public.tracks WHERE audio_key=NEW.audio_key) THEN
      UPDATE public.audio_upload_receipts SET status='discarded'
        WHERE key=NEW.audio_key AND owner_id=NEW.owner_id AND consumed_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_abandoned_audio_receipt() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER invalidate_abandoned_audio_receipt BEFORE INSERT ON public.track_storage_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_abandoned_audio_receipt();
COMMIT;
