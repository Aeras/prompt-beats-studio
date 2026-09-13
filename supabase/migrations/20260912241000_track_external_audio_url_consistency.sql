-- Require provider tracks to use the same canonical URL for playback and source metadata.
BEGIN;

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
    OR NEW.audio_url IS DISTINCT FROM NEW.source_url
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

DROP TRIGGER IF EXISTS validate_track_source ON public.tracks;
CREATE TRIGGER validate_track_source
  BEFORE INSERT OR UPDATE OF audio_url, audio_type, audio_key, cover_url, source_type, source_url, source_id
  ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.validate_track_source();

COMMIT;
