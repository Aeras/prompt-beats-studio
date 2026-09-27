-- Track duplicate detection metadata.
-- Existing rows remain NULL; new uploads can be checked without re-reading stored audio.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS audio_content_hash text,
  ADD COLUMN IF NOT EXISTS audio_fingerprint text;

ALTER TABLE public.tracks
  DROP CONSTRAINT IF EXISTS tracks_audio_content_hash_format;
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_audio_content_hash_format
  CHECK (audio_content_hash IS NULL OR audio_content_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.tracks
  DROP CONSTRAINT IF EXISTS tracks_audio_fingerprint_length;
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_audio_fingerprint_length
  CHECK (audio_fingerprint IS NULL OR length(audio_fingerprint) <= 1024);

-- Exact uploaded-file duplicates are prevented atomically for all newly fingerprinted uploads.
-- Historical uploads remain NULL until they are reprocessed and therefore do not make this migration fail.
CREATE UNIQUE INDEX IF NOT EXISTS tracks_user_audio_content_hash_unique
  ON public.tracks(user_id, audio_content_hash)
  WHERE source_type = 'upload' AND audio_content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracks_user_upload_duration_duplicate_lookup
  ON public.tracks(user_id, duration_seconds)
  WHERE source_type = 'upload' AND audio_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracks_user_external_source_duplicate_lookup
  ON public.tracks(user_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
