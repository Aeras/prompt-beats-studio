-- Song Universe 2.0: project memory, planning controls and durable next-song briefs.

ALTER TABLE public.song_universes
  ADD COLUMN IF NOT EXISTS planned_track_count integer,
  ADD COLUMN IF NOT EXISTS arc_direction text,
  ADD COLUMN IF NOT EXISTS story_bible jsonb NOT NULL DEFAULT '{"canonFacts":[],"characters":[],"relationships":[],"locations":[],"worldRules":[],"recurringSymbols":[],"desiredEnding":null,"tone":null,"audience":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS planner_contrast text NOT NULL DEFAULT 'balanced';

ALTER TABLE public.song_universes
  DROP CONSTRAINT IF EXISTS song_universes_planned_track_count_check,
  ADD CONSTRAINT song_universes_planned_track_count_check
    CHECK (planned_track_count IS NULL OR planned_track_count BETWEEN 1 AND 200),
  DROP CONSTRAINT IF EXISTS song_universes_planner_contrast_check,
  ADD CONSTRAINT song_universes_planner_contrast_check
    CHECK (planner_contrast IN ('low','balanced','high'));

ALTER TABLE public.song_universe_projects
  ADD COLUMN IF NOT EXISTS outlier_purpose text;

CREATE TABLE IF NOT EXISTS public.song_universe_planner_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL REFERENCES public.song_universes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','discarded')),
  history_fingerprint text NOT NULL,
  strategy_version text NOT NULL,
  planner_schema_version text NOT NULL DEFAULT 'next-song-brief:v1',
  universe_type text NOT NULL
    CHECK (universe_type IN ('album','ep','song_series','creative_era','other')),
  model text,
  provider text,
  current_song_intent text,
  target_role text,
  target_position integer CHECK (target_position IS NULL OR target_position BETWEEN 0 AND 199),
  planned_track_count integer CHECK (planned_track_count IS NULL OR planned_track_count BETWEEN 1 AND 200),
  contrast_level text NOT NULL DEFAULT 'balanced'
    CHECK (contrast_level IN ('low','balanced','high')),
  source_completeness text,
  brief jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS song_universe_planner_briefs_universe_created_idx
  ON public.song_universe_planner_briefs(universe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS song_universe_planner_briefs_owner_created_idx
  ON public.song_universe_planner_briefs(owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.song_universe_validate_planner_brief_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = NEW.universe_id AND u.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Song Universe does not belong to this user.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_universe_validate_planner_brief_owner_trigger
  ON public.song_universe_planner_briefs;
CREATE TRIGGER song_universe_validate_planner_brief_owner_trigger
BEFORE INSERT OR UPDATE OF universe_id, owner_id
ON public.song_universe_planner_briefs
FOR EACH ROW EXECUTE FUNCTION public.song_universe_validate_planner_brief_owner();

ALTER TABLE public.song_universe_planner_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS song_universe_planner_briefs_owner_select
  ON public.song_universe_planner_briefs;
CREATE POLICY song_universe_planner_briefs_owner_select
ON public.song_universe_planner_briefs
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('song_universe')
);

DROP POLICY IF EXISTS song_universe_planner_briefs_owner_insert
  ON public.song_universe_planner_briefs;
CREATE POLICY song_universe_planner_briefs_owner_insert
ON public.song_universe_planner_briefs
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('song_universe')
);

DROP POLICY IF EXISTS song_universe_planner_briefs_owner_update
  ON public.song_universe_planner_briefs;
CREATE POLICY song_universe_planner_briefs_owner_update
ON public.song_universe_planner_briefs
FOR UPDATE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('song_universe')
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('song_universe')
);

DROP POLICY IF EXISTS song_universe_planner_briefs_owner_delete
  ON public.song_universe_planner_briefs;
CREATE POLICY song_universe_planner_briefs_owner_delete
ON public.song_universe_planner_briefs
FOR DELETE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.current_user_can_use_feature('song_universe')
);

REVOKE ALL ON public.song_universe_planner_briefs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_universe_planner_briefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_universe_planner_briefs TO service_role;

COMMENT ON COLUMN public.song_universes.planned_track_count IS
  'Optional planning target. Advisory and editable; not a hard project limit.';
COMMENT ON COLUMN public.song_universes.story_bible IS
  'Song Series / concept-project narrative canon and world context. Never mutated automatically by AI.';
COMMENT ON TABLE public.song_universe_planner_briefs IS
  'Durable history of proposed/approved Song Universe 2 next-song directions and their provenance.';
