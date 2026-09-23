-- Optional Universe-level Inspiration Wall relationship.
-- Project-level Walls remain independent and are never merged automatically.

ALTER TABLE public.inspiration_walls
  ADD COLUMN IF NOT EXISTS universe_id uuid NULL REFERENCES public.song_universes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inspiration_walls_universe_idx
  ON public.inspiration_walls(owner_id, universe_id, updated_at DESC)
  WHERE universe_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_inspiration_wall_universe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.universe_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = NEW.universe_id AND u.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Song Universe does not belong to Inspiration Wall owner.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_walls_validate_universe ON public.inspiration_walls;
CREATE TRIGGER inspiration_walls_validate_universe
BEFORE INSERT OR UPDATE OF owner_id, universe_id ON public.inspiration_walls
FOR EACH ROW EXECUTE FUNCTION public.validate_inspiration_wall_universe();

REVOKE ALL ON FUNCTION public.validate_inspiration_wall_universe() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_inspiration_wall_universe() TO service_role;
