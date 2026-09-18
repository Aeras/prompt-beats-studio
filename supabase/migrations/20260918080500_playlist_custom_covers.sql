-- Optional custom artwork for personal playlists.
BEGIN;

ALTER TABLE public.playlists
  ADD COLUMN cover_url text;

GRANT SELECT (cover_url) ON public.playlists TO authenticated;
GRANT INSERT (cover_url), UPDATE (cover_url) ON public.playlists TO authenticated;

COMMIT;
