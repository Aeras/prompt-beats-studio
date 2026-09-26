-- FINAL-006: enforce account state + Feature Access on direct authenticated
-- mutations for Inspiration Wall, Story Map, and Song Universe.
--
-- SELECT remains owner-readable even when feature entitlement is removed so
-- users do not lose access to historical content solely because an admin
-- changes Feature Access. Server functions remain the primary app boundary;
-- these policies close the direct PostgREST mutation bypass.

BEGIN;

-- ---------------------------------------------------------------------------
-- Inspiration Wall
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners manage inspiration walls" ON public.inspiration_walls;

CREATE POLICY "Owners read inspiration walls"
ON public.inspiration_walls
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners insert inspiration walls with feature access"
ON public.inspiration_walls
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
);

CREATE POLICY "Owners update inspiration walls with feature access"
ON public.inspiration_walls
FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
)
WITH CHECK (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
);

CREATE POLICY "Owners delete inspiration walls with feature access"
ON public.inspiration_walls
FOR DELETE TO authenticated
USING (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
);

DROP POLICY IF EXISTS "Owners manage inspiration wall cards" ON public.inspiration_wall_cards;

CREATE POLICY "Owners read inspiration wall cards"
ON public.inspiration_wall_cards
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_cards.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners insert inspiration wall cards with feature access"
ON public.inspiration_wall_cards
FOR INSERT TO authenticated
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_cards.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners update inspiration wall cards with feature access"
ON public.inspiration_wall_cards
FOR UPDATE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_cards.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_cards.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners delete inspiration wall cards with feature access"
ON public.inspiration_wall_cards
FOR DELETE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_cards.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Owners manage inspiration wall track links" ON public.inspiration_wall_track_links;

CREATE POLICY "Owners read inspiration wall track links"
ON public.inspiration_wall_track_links
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners insert inspiration wall track links with feature access"
ON public.inspiration_wall_track_links
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_track_links.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners update inspiration wall track links with feature access"
ON public.inspiration_wall_track_links
FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
)
WITH CHECK (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
  AND EXISTS (
    SELECT 1
    FROM public.inspiration_walls w
    WHERE w.id = inspiration_wall_track_links.wall_id
      AND w.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners delete inspiration wall track links with feature access"
ON public.inspiration_wall_track_links
FOR DELETE TO authenticated
USING (
  (SELECT auth.uid()) = owner_id
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('inspiration_wall')
);

-- ---------------------------------------------------------------------------
-- Story Map: keep existing owner SELECT policies, harden mutations.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "story_maps_owner_insert" ON public.story_maps;
DROP POLICY IF EXISTS "story_maps_owner_update" ON public.story_maps;
DROP POLICY IF EXISTS "story_maps_owner_delete" ON public.story_maps;

CREATE POLICY "story_maps_owner_insert"
ON public.story_maps
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
);

CREATE POLICY "story_maps_owner_update"
ON public.story_maps
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
);

CREATE POLICY "story_maps_owner_delete"
ON public.story_maps
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
);

DROP POLICY IF EXISTS "story_map_beats_owner_insert" ON public.story_map_beats;
DROP POLICY IF EXISTS "story_map_beats_owner_update" ON public.story_map_beats;
DROP POLICY IF EXISTS "story_map_beats_owner_delete" ON public.story_map_beats;

CREATE POLICY "story_map_beats_owner_insert"
ON public.story_map_beats
FOR INSERT TO authenticated
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
  AND EXISTS (
    SELECT 1
    FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "story_map_beats_owner_update"
ON public.story_map_beats
FOR UPDATE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
  AND EXISTS (
    SELECT 1
    FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
  AND EXISTS (
    SELECT 1
    FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "story_map_beats_owner_delete"
ON public.story_map_beats
FOR DELETE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('story_map')
  AND EXISTS (
    SELECT 1
    FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Song Universe
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "song_universes_owner_all" ON public.song_universes;

CREATE POLICY "song_universes_owner_select"
ON public.song_universes
FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "song_universes_owner_insert"
ON public.song_universes
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

CREATE POLICY "song_universes_owner_update"
ON public.song_universes
FOR UPDATE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

CREATE POLICY "song_universes_owner_delete"
ON public.song_universes
FOR DELETE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

DROP POLICY IF EXISTS "song_universe_projects_owner_insert" ON public.song_universe_projects;
DROP POLICY IF EXISTS "song_universe_projects_owner_update" ON public.song_universe_projects;
DROP POLICY IF EXISTS "song_universe_projects_owner_delete" ON public.song_universe_projects;

CREATE POLICY "song_universe_projects_owner_insert"
ON public.song_universe_projects
FOR INSERT TO authenticated
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
  AND EXISTS (
    SELECT 1
    FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "song_universe_projects_owner_update"
ON public.song_universe_projects
FOR UPDATE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
  AND EXISTS (
    SELECT 1
    FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
  AND EXISTS (
    SELECT 1
    FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "song_universe_projects_owner_delete"
ON public.song_universe_projects
FOR DELETE TO authenticated
USING (
  public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
  AND EXISTS (
    SELECT 1
    FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "song_universe_ai_analyses_owner_all" ON public.song_universe_ai_analyses;

CREATE POLICY "song_universe_ai_analyses_owner_select"
ON public.song_universe_ai_analyses
FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "song_universe_ai_analyses_owner_insert"
ON public.song_universe_ai_analyses
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

CREATE POLICY "song_universe_ai_analyses_owner_update"
ON public.song_universe_ai_analyses
FOR UPDATE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

CREATE POLICY "song_universe_ai_analyses_owner_delete"
ON public.song_universe_ai_analyses
FOR DELETE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  AND public.has_valid_account_state((SELECT auth.uid()))
  AND public.current_user_can_use_feature('song_universe')
);

COMMIT;
