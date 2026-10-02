-- PB-007 FOLLOW-UP: semantic creative recency for cross-feature Home Resume.
-- Pre-migration semantic recency is best-effort. Qualifying post-migration writes are exact.

BEGIN;

-- Add nullable first so historical rows can be initialized from existing durable timestamps.
ALTER TABLE public.song_universes
  ADD COLUMN IF NOT EXISTS creative_updated_at timestamptz;
ALTER TABLE public.story_maps
  ADD COLUMN IF NOT EXISTS creative_updated_at timestamptz;
ALTER TABLE public.inspiration_walls
  ADD COLUMN IF NOT EXISTS creative_updated_at timestamptz;

-- Best-effort deterministic historical initialization. Do not use migration now().
UPDATE public.song_universes u
SET creative_updated_at = GREATEST(
  u.updated_at,
  COALESCE(
    (SELECT max(p.updated_at) FROM public.song_universe_projects p WHERE p.universe_id = u.id),
    u.updated_at
  )
)
WHERE u.creative_updated_at IS NULL;

UPDATE public.story_maps m
SET creative_updated_at = GREATEST(
  m.updated_at,
  COALESCE(
    (SELECT max(b.updated_at) FROM public.story_map_beats b WHERE b.story_map_id = m.id),
    m.updated_at
  )
)
WHERE m.creative_updated_at IS NULL;

UPDATE public.inspiration_walls w
SET creative_updated_at = GREATEST(
  w.updated_at,
  COALESCE(
    (SELECT max(c.updated_at) FROM public.inspiration_wall_cards c WHERE c.wall_id = w.id),
    w.updated_at
  )
)
WHERE w.creative_updated_at IS NULL;

ALTER TABLE public.song_universes
  ALTER COLUMN creative_updated_at SET DEFAULT now(),
  ALTER COLUMN creative_updated_at SET NOT NULL;
ALTER TABLE public.story_maps
  ALTER COLUMN creative_updated_at SET DEFAULT now(),
  ALTER COLUMN creative_updated_at SET NOT NULL;
ALTER TABLE public.inspiration_walls
  ALTER COLUMN creative_updated_at SET DEFAULT now(),
  ALTER COLUMN creative_updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS song_universes_owner_creative_recency_idx
  ON public.song_universes(owner_id, creative_updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS story_maps_user_creative_recency_idx
  ON public.story_maps(user_id, creative_updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS inspiration_walls_owner_creative_recency_idx
  ON public.inspiration_walls(owner_id, creative_updated_at DESC, id DESC);

-- Parent semantic triggers only react to the approved authored creative fields.
CREATE OR REPLACE FUNCTION public.song_universe_set_creative_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(
    OLD.description,
    OLD.universe_type,
    OLD.creative_bible,
    OLD.initial_direction,
    OLD.planned_track_count,
    OLD.arc_direction,
    OLD.story_bible,
    OLD.planner_contrast
  ) IS DISTINCT FROM ROW(
    NEW.description,
    NEW.universe_type,
    NEW.creative_bible,
    NEW.initial_direction,
    NEW.planned_track_count,
    NEW.arc_direction,
    NEW.story_bible,
    NEW.planner_contrast
  ) THEN
    NEW.creative_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_universes_set_creative_updated_at ON public.song_universes;
CREATE TRIGGER song_universes_set_creative_updated_at
BEFORE UPDATE ON public.song_universes
FOR EACH ROW EXECUTE FUNCTION public.song_universe_set_creative_updated_at();

CREATE OR REPLACE FUNCTION public.story_map_set_creative_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(
    OLD.concept,
    OLD.theme,
    OLD.emotional_direction,
    OLD.narrator,
    OLD.point_of_view,
    OLD.desired_ending,
    OLD.progression_type,
    OLD.summary,
    OLD.starting_state,
    OLD.central_change,
    OLD.turning_point,
    OLD.resolution
  ) IS DISTINCT FROM ROW(
    NEW.concept,
    NEW.theme,
    NEW.emotional_direction,
    NEW.narrator,
    NEW.point_of_view,
    NEW.desired_ending,
    NEW.progression_type,
    NEW.summary,
    NEW.starting_state,
    NEW.central_change,
    NEW.turning_point,
    NEW.resolution
  ) THEN
    NEW.creative_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_maps_set_creative_updated_at ON public.story_maps;
CREATE TRIGGER story_maps_set_creative_updated_at
BEFORE UPDATE ON public.story_maps
FOR EACH ROW EXECUTE FUNCTION public.story_map_set_creative_updated_at();

CREATE OR REPLACE FUNCTION public.inspiration_wall_set_creative_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(
    OLD.description,
    OLD.selected_theme,
    OLD.creative_direction
  ) IS DISTINCT FROM ROW(
    NEW.description,
    NEW.selected_theme,
    NEW.creative_direction
  ) THEN
    NEW.creative_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_walls_set_creative_updated_at ON public.inspiration_walls;
CREATE TRIGGER inspiration_walls_set_creative_updated_at
BEFORE UPDATE ON public.inspiration_walls
FOR EACH ROW EXECUTE FUNCTION public.inspiration_wall_set_creative_updated_at();

-- Song Universe membership propagation. Statement-level transition tables keep reorders bounded.
CREATE OR REPLACE FUNCTION public.song_universe_projects_semantic_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.song_universes u
  SET creative_updated_at = now()
  WHERE u.id IN (SELECT DISTINCT universe_id FROM new_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.song_universe_projects_semantic_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.song_universes u
  SET creative_updated_at = now()
  WHERE u.id IN (SELECT DISTINCT universe_id FROM old_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.song_universe_projects_semantic_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.song_universes u
  SET creative_updated_at = now()
  WHERE u.id IN (
    SELECT DISTINCT old_row.universe_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.universe_id IS DISTINCT FROM new_row.universe_id
       OR ROW(
         old_row.position,
         old_row.universe_role,
         old_row.intentional_outlier,
         old_row.outlier_purpose,
         old_row.inherited_traits,
         old_row.context_snapshot
       ) IS DISTINCT FROM ROW(
         new_row.position,
         new_row.universe_role,
         new_row.intentional_outlier,
         new_row.outlier_purpose,
         new_row.inherited_traits,
         new_row.context_snapshot
       )
    UNION
    SELECT DISTINCT new_row.universe_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.universe_id IS DISTINCT FROM new_row.universe_id
       OR ROW(
         old_row.position,
         old_row.universe_role,
         old_row.intentional_outlier,
         old_row.outlier_purpose,
         old_row.inherited_traits,
         old_row.context_snapshot
       ) IS DISTINCT FROM ROW(
         new_row.position,
         new_row.universe_role,
         new_row.intentional_outlier,
         new_row.outlier_purpose,
         new_row.inherited_traits,
         new_row.context_snapshot
       )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS song_universe_projects_semantic_insert_trigger ON public.song_universe_projects;
CREATE TRIGGER song_universe_projects_semantic_insert_trigger
AFTER INSERT ON public.song_universe_projects
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.song_universe_projects_semantic_insert();

DROP TRIGGER IF EXISTS song_universe_projects_semantic_delete_trigger ON public.song_universe_projects;
CREATE TRIGGER song_universe_projects_semantic_delete_trigger
AFTER DELETE ON public.song_universe_projects
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.song_universe_projects_semantic_delete();

DROP TRIGGER IF EXISTS song_universe_projects_semantic_update_trigger ON public.song_universe_projects;
CREATE TRIGGER song_universe_projects_semantic_update_trigger
AFTER UPDATE ON public.song_universe_projects
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.song_universe_projects_semantic_update();

-- Story Beat propagation. One UPDATE/reorder statement produces at most one parent bump.
CREATE OR REPLACE FUNCTION public.story_map_beats_semantic_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.story_maps m
  SET creative_updated_at = now()
  WHERE m.id IN (SELECT DISTINCT story_map_id FROM new_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.story_map_beats_semantic_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.story_maps m
  SET creative_updated_at = now()
  WHERE m.id IN (SELECT DISTINCT story_map_id FROM old_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.story_map_beats_semantic_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.story_maps m
  SET creative_updated_at = now()
  WHERE m.id IN (
    SELECT DISTINCT old_row.story_map_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.story_map_id IS DISTINCT FROM new_row.story_map_id
       OR ROW(
         old_row.position,
         old_row.title,
         old_row.what_happens,
         old_row.emotion,
         old_row.purpose,
         old_row.narrator_state,
         old_row.key_image,
         old_row.reveal,
         old_row.change_after_beat,
         old_row.lyric_anchor,
         old_row.suggested_sections,
         old_row.is_key_beat
       ) IS DISTINCT FROM ROW(
         new_row.position,
         new_row.title,
         new_row.what_happens,
         new_row.emotion,
         new_row.purpose,
         new_row.narrator_state,
         new_row.key_image,
         new_row.reveal,
         new_row.change_after_beat,
         new_row.lyric_anchor,
         new_row.suggested_sections,
         new_row.is_key_beat
       )
    UNION
    SELECT DISTINCT new_row.story_map_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.story_map_id IS DISTINCT FROM new_row.story_map_id
       OR ROW(
         old_row.position,
         old_row.title,
         old_row.what_happens,
         old_row.emotion,
         old_row.purpose,
         old_row.narrator_state,
         old_row.key_image,
         old_row.reveal,
         old_row.change_after_beat,
         old_row.lyric_anchor,
         old_row.suggested_sections,
         old_row.is_key_beat
       ) IS DISTINCT FROM ROW(
         new_row.position,
         new_row.title,
         new_row.what_happens,
         new_row.emotion,
         new_row.purpose,
         new_row.narrator_state,
         new_row.key_image,
         new_row.reveal,
         new_row.change_after_beat,
         new_row.lyric_anchor,
         new_row.suggested_sections,
         new_row.is_key_beat
       )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS story_map_beats_semantic_insert_trigger ON public.story_map_beats;
CREATE TRIGGER story_map_beats_semantic_insert_trigger
AFTER INSERT ON public.story_map_beats
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.story_map_beats_semantic_insert();

DROP TRIGGER IF EXISTS story_map_beats_semantic_delete_trigger ON public.story_map_beats;
CREATE TRIGGER story_map_beats_semantic_delete_trigger
AFTER DELETE ON public.story_map_beats
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.story_map_beats_semantic_delete();

DROP TRIGGER IF EXISTS story_map_beats_semantic_update_trigger ON public.story_map_beats;
CREATE TRIGGER story_map_beats_semantic_update_trigger
AFTER UPDATE ON public.story_map_beats
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.story_map_beats_semantic_update();

-- Inspiration Wall card propagation. Track-link relationship changes are intentionally excluded.
CREATE OR REPLACE FUNCTION public.inspiration_wall_cards_semantic_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.inspiration_walls w
  SET creative_updated_at = now()
  WHERE w.id IN (SELECT DISTINCT wall_id FROM new_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inspiration_wall_cards_semantic_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.inspiration_walls w
  SET creative_updated_at = now()
  WHERE w.id IN (SELECT DISTINCT wall_id FROM old_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inspiration_wall_cards_semantic_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.inspiration_walls w
  SET creative_updated_at = now()
  WHERE w.id IN (
    SELECT DISTINCT old_row.wall_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.wall_id IS DISTINCT FROM new_row.wall_id
       OR ROW(
         old_row.type,
         old_row.title,
         old_row.body,
         old_row.color_value,
         old_row.image_object_key,
         old_row.is_pinned,
         old_row.sort_order,
         old_row.artistic_layout,
         old_row.structured_layout
       ) IS DISTINCT FROM ROW(
         new_row.type,
         new_row.title,
         new_row.body,
         new_row.color_value,
         new_row.image_object_key,
         new_row.is_pinned,
         new_row.sort_order,
         new_row.artistic_layout,
         new_row.structured_layout
       )
    UNION
    SELECT DISTINCT new_row.wall_id
    FROM old_rows old_row
    JOIN new_rows new_row USING (id)
    WHERE old_row.wall_id IS DISTINCT FROM new_row.wall_id
       OR ROW(
         old_row.type,
         old_row.title,
         old_row.body,
         old_row.color_value,
         old_row.image_object_key,
         old_row.is_pinned,
         old_row.sort_order,
         old_row.artistic_layout,
         old_row.structured_layout
       ) IS DISTINCT FROM ROW(
         new_row.type,
         new_row.title,
         new_row.body,
         new_row.color_value,
         new_row.image_object_key,
         new_row.is_pinned,
         new_row.sort_order,
         new_row.artistic_layout,
         new_row.structured_layout
       )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS inspiration_wall_cards_semantic_insert_trigger ON public.inspiration_wall_cards;
CREATE TRIGGER inspiration_wall_cards_semantic_insert_trigger
AFTER INSERT ON public.inspiration_wall_cards
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.inspiration_wall_cards_semantic_insert();

DROP TRIGGER IF EXISTS inspiration_wall_cards_semantic_delete_trigger ON public.inspiration_wall_cards;
CREATE TRIGGER inspiration_wall_cards_semantic_delete_trigger
AFTER DELETE ON public.inspiration_wall_cards
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.inspiration_wall_cards_semantic_delete();

DROP TRIGGER IF EXISTS inspiration_wall_cards_semantic_update_trigger ON public.inspiration_wall_cards;
CREATE TRIGGER inspiration_wall_cards_semantic_update_trigger
AFTER UPDATE ON public.inspiration_wall_cards
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.inspiration_wall_cards_semantic_update();

COMMENT ON COLUMN public.song_universes.creative_updated_at IS
  'Semantic creative recency for PB-007 Home Resume. Historical value is best-effort; qualifying post-migration writes are exact.';
COMMENT ON COLUMN public.story_maps.creative_updated_at IS
  'Semantic creative recency for PB-007 Home Resume. Historical value is best-effort; qualifying post-migration writes are exact.';
COMMENT ON COLUMN public.inspiration_walls.creative_updated_at IS
  'Semantic creative recency for PB-007 Home Resume. Historical value is best-effort; qualifying post-migration writes are exact.';

COMMIT;
