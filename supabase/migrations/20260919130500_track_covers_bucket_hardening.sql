-- Canonical PromptBeats track/playlist cover contract.
-- Keep the bucket public for existing cover URLs and enforce upload constraints
-- at the storage boundary so browser-side validation cannot be bypassed.
UPDATE storage.buckets
SET
  file_size_limit = 8 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'track-covers';
