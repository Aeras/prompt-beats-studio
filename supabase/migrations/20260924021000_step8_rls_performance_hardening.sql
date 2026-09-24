-- Step 8 / Batch 2: preserve owner semantics while avoiding per-row auth.uid() re-evaluation.
BEGIN;

ALTER POLICY "story_maps_owner_select" ON public.story_maps
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY "story_maps_owner_insert" ON public.story_maps
  WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY "story_maps_owner_update" ON public.story_maps
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY "story_maps_owner_delete" ON public.story_maps
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "story_map_beats_owner_select" ON public.story_map_beats
  USING (EXISTS (
    SELECT 1 FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  ));
ALTER POLICY "story_map_beats_owner_insert" ON public.story_map_beats
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  ));
ALTER POLICY "story_map_beats_owner_update" ON public.story_map_beats
  USING (EXISTS (
    SELECT 1 FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  ));
ALTER POLICY "story_map_beats_owner_delete" ON public.story_map_beats
  USING (EXISTS (
    SELECT 1 FROM public.story_maps m
    WHERE m.id = story_map_beats.story_map_id
      AND m.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "song_universes_owner_all" ON public.song_universes
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

ALTER POLICY "song_universe_projects_owner_select" ON public.song_universe_projects
  USING (EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  ));
ALTER POLICY "song_universe_projects_owner_insert" ON public.song_universe_projects
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  ));
ALTER POLICY "song_universe_projects_owner_update" ON public.song_universe_projects
  USING (EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  ));
ALTER POLICY "song_universe_projects_owner_delete" ON public.song_universe_projects
  USING (EXISTS (
    SELECT 1 FROM public.song_universes u
    WHERE u.id = song_universe_projects.universe_id
      AND u.owner_id = (SELECT auth.uid())
  ));

ALTER POLICY "song_universe_ai_analyses_owner_all" ON public.song_universe_ai_analyses
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

ALTER POLICY "Owners manage inspiration walls" ON public.inspiration_walls
  USING ((SELECT auth.uid()) = owner_id AND NOT public.current_user_is_banned())
  WITH CHECK ((SELECT auth.uid()) = owner_id AND NOT public.current_user_is_banned());

ALTER POLICY "Owners manage inspiration wall track links" ON public.inspiration_wall_track_links
  USING ((SELECT auth.uid()) = owner_id AND NOT public.current_user_is_banned())
  WITH CHECK ((SELECT auth.uid()) = owner_id AND NOT public.current_user_is_banned());

ALTER POLICY "Owners manage inspiration wall cards" ON public.inspiration_wall_cards
  USING (
    EXISTS (
      SELECT 1 FROM public.inspiration_walls w
      WHERE w.id = inspiration_wall_cards.wall_id
        AND w.owner_id = (SELECT auth.uid())
    )
    AND NOT public.current_user_is_banned()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspiration_walls w
      WHERE w.id = inspiration_wall_cards.wall_id
        AND w.owner_id = (SELECT auth.uid())
    )
    AND NOT public.current_user_is_banned()
  );

COMMIT;
