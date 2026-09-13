-- Phase 1 multi-source tracks. Existing rows remain native/upload-compatible.
BEGIN;

ALTER TABLE public.tracks
  ADD COLUMN source_type text,
  ADD COLUMN source_url text,
  ADD COLUMN source_id text;

-- Generic link tracks existed before provider-specific sources. Classify them
-- before making the new source column non-null/defaulted so they keep their
-- original playback and metadata-edit behavior.
UPDATE public.tracks
SET source_type = CASE
  WHEN audio_type = 'link' THEN 'legacy_link'
  ELSE 'upload'
END
WHERE source_type IS NULL;

ALTER TABLE public.tracks
  ALTER COLUMN source_type SET DEFAULT 'upload',
  ALTER COLUMN source_type SET NOT NULL;

ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_source_type_check
  CHECK (source_type IN ('upload', 'suno', 'udio', 'youtube', 'legacy_link'));

CREATE OR REPLACE FUNCTION public.validate_track_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source_type = 'legacy_link' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'legacy link sources are read-only compatibility records';
    END IF;
    IF OLD.source_type IS DISTINCT FROM 'legacy_link'
      OR NEW.audio_type <> 'link'
      OR NEW.source_url IS NOT NULL
      OR NEW.source_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'legacy link sources are read-only compatibility records';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source_type = 'upload' THEN
    IF NEW.audio_type <> 'upload'
      OR NEW.source_url IS NOT NULL
      OR NEW.source_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'uploaded tracks cannot have an external source';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.audio_type <> 'link'
    OR NEW.audio_key IS NOT NULL
    OR NEW.cover_url IS NOT NULL
    OR NEW.source_id IS NULL
    OR NEW.source_url IS NULL
  THEN
    RAISE EXCEPTION 'invalid external track source';
  END IF;

  IF NEW.source_type = 'suno'
    AND NEW.source_id ~ '^[A-Za-z0-9_-]{6,128}$'
    AND NEW.source_url = 'https://suno.com/song/' || NEW.source_id
  THEN RETURN NEW; END IF;

  IF NEW.source_type = 'udio'
    AND NEW.source_id ~ '^[A-Za-z0-9_-]{6,128}$'
    AND NEW.source_url = 'https://www.udio.com/songs/' || NEW.source_id
  THEN RETURN NEW; END IF;

  IF NEW.source_type = 'youtube'
    AND NEW.source_id ~ '^[A-Za-z0-9_-]{11}$'
    AND NEW.source_url = 'https://www.youtube.com/watch?v=' || NEW.source_id
  THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'invalid external track source';
END;
$$;

REVOKE ALL ON FUNCTION public.validate_track_source() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS validate_track_source ON public.tracks;
CREATE TRIGGER validate_track_source
  BEFORE INSERT OR UPDATE OF audio_type, audio_key, cover_url, source_type, source_url, source_id
  ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.validate_track_source();

-- Preserve audio_key's private status while exposing only safe provider metadata.
REVOKE SELECT ON public.tracks FROM anon, authenticated;
GRANT SELECT (
  id, user_id, title, genre, prompt, lyrics, audio_url, audio_type,
  source_type, source_url, source_id,
  art_url, cover_url, duration_seconds, plays, is_published,
  created_at, updated_at
) ON public.tracks TO anon, authenticated;

REVOKE INSERT, UPDATE ON public.tracks FROM authenticated;
GRANT INSERT (
  user_id, title, genre, prompt, lyrics, audio_url, audio_key, audio_type,
  source_type, source_url, source_id,
  art_url, cover_url, duration_seconds, is_published
) ON public.tracks TO authenticated;
GRANT UPDATE (
  title, genre, prompt, lyrics, audio_url, audio_type,
  art_url, cover_url, duration_seconds, is_published
) ON public.tracks TO authenticated;

-- Update Trending's safe public projection without changing its bounded query.
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
           t.audio_url, t.audio_type, t.source_type, t.source_url, t.source_id,
           t.art_url, t.cover_url, t.duration_seconds, t.plays, t.is_published, t.created_at
    FROM public.tracks AS t
    WHERE t.is_published = true AND t.moderation_status = 'active'
    ORDER BY t.created_at DESC, t.id ASC
    LIMIT 100
  )
  SELECT c.id, c.user_id, c.title, c.genre, c.prompt, c.lyrics,
         c.audio_url, c.audio_type, c.source_type, c.source_url, c.source_id,
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
