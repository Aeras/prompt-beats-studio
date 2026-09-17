-- Per-track download permission for uploaded audio.
BEGIN;

ALTER TABLE public.tracks
  ADD COLUMN allow_download boolean NOT NULL DEFAULT false;

ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_allow_download_check
  CHECK (source_type = 'upload' OR allow_download = false);

GRANT SELECT (allow_download) ON public.tracks TO anon, authenticated;
GRANT INSERT (allow_download), UPDATE (allow_download) ON public.tracks TO authenticated;

DROP FUNCTION public.list_trending_tracks();
CREATE FUNCTION public.list_trending_tracks()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  genre text,
  prompt text,
  lyrics text,
  audio_url text,
  audio_type text,
  source_type text,
  source_url text,
  source_id text,
  created_with text,
  allow_download boolean,
  art_url text,
  cover_url text,
  duration_seconds integer,
  plays integer,
  is_published boolean,
  created_at timestamptz,
  likes bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT t.id, t.user_id, t.title, t.genre, t.prompt, t.lyrics,
           t.audio_url, t.audio_type, t.source_type, t.source_url, t.source_id, t.created_with, t.allow_download,
           t.art_url, t.cover_url, t.duration_seconds, t.plays, t.is_published, t.created_at
    FROM public.tracks AS t
    WHERE t.is_published = true AND t.moderation_status = 'active'
    ORDER BY t.created_at DESC, t.id ASC
    LIMIT 100
  )
  SELECT c.id, c.user_id, c.title, c.genre, c.prompt, c.lyrics,
         c.audio_url, c.audio_type, c.source_type, c.source_url, c.source_id, c.created_with, c.allow_download,
         c.art_url, c.cover_url, c.duration_seconds, c.plays, c.is_published, c.created_at,
         counts.likes
  FROM candidates AS c
  CROSS JOIN LATERAL (
    SELECT count(*) AS likes FROM public.likes AS l WHERE l.track_id = c.id
  ) AS counts
  ORDER BY (counts.likes * 3 + c.plays) DESC, c.created_at DESC, c.id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.list_trending_tracks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trending_tracks() TO service_role;

COMMIT;
