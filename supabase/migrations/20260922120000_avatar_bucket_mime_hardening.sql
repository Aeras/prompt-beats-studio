-- Canonical private avatar contract: JPEG / PNG / WebP, max 5 MB.
UPDATE storage.buckets
SET
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
WHERE id = 'avatars';
