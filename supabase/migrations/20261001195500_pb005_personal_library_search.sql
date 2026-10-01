BEGIN;

CREATE OR REPLACE FUNCTION public.search_personal_library(
  _query text,
  _types text[] DEFAULT NULL,
  _recency_days integer DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS TABLE (
  item_type text,
  item_id uuid,
  title text,
  subtitle text,
  updated_at timestamptz,
  target_path text,
  target_tab text,
  project_id uuid,
  match_rank integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_query text := btrim(COALESCE(_query, ''));
  v_pattern text;
  v_types text[] := COALESCE(_types, ARRAY[]::text[]);
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  v_allowed_types constant text[] := ARRAY[
    'track', 'project', 'prompt', 'version', 'analysis',
    'inspiration_wall', 'story_map', 'song_universe'
  ];
BEGIN
  IF v_user_id IS NULL OR public.current_user_is_banned() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF char_length(v_query) < 1 OR char_length(v_query) > 120 THEN
    RAISE EXCEPTION 'Search query must be between 1 and 120 characters';
  END IF;

  IF _recency_days IS NOT NULL AND (_recency_days < 1 OR _recency_days > 3650) THEN
    RAISE EXCEPTION 'Invalid recency window';
  END IF;

  IF cardinality(v_types) > 0 AND EXISTS (
    SELECT 1 FROM unnest(v_types) AS requested_type
    WHERE requested_type <> ALL(v_allowed_types)
  ) THEN
    RAISE EXCEPTION 'Invalid search type';
  END IF;

  v_pattern := '%' || v_query || '%';

  RETURN QUERY
  WITH candidates AS (
    SELECT
      'track'::text AS item_type,
      t.id AS item_id,
      t.title::text AS title,
      NULLIF(t.genre, '')::text AS subtitle,
      t.updated_at,
      '/library'::text AS target_path,
      'tracks'::text AS target_tab,
      NULL::uuid AS project_id,
      CASE
        WHEN lower(t.title) = lower(v_query) THEN 0
        WHEN t.title ILIKE v_query || '%' THEN 1
        ELSE 2
      END AS match_rank
    FROM public.tracks t
    WHERE t.user_id = v_user_id
      AND t.moderation_status = 'active'
      AND (cardinality(v_types) = 0 OR 'track' = ANY(v_types))
      AND (_recency_days IS NULL OR t.updated_at >= now() - make_interval(days => _recency_days))
      AND (
        t.title ILIKE v_pattern OR
        t.genre ILIKE v_pattern OR
        t.prompt ILIKE v_pattern OR
        t.lyrics ILIKE v_pattern
      )

    UNION ALL

    SELECT
      'project', p.id, p.name,
      NULLIF(p.creation_notes, ''), p.updated_at,
      '/library', 'prompts', p.id,
      CASE
        WHEN lower(p.name) = lower(v_query) THEN 0
        WHEN p.name ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.prompt_projects p
    WHERE p.user_id = v_user_id
      AND (cardinality(v_types) = 0 OR 'project' = ANY(v_types))
      AND (_recency_days IS NULL OR p.updated_at >= now() - make_interval(days => _recency_days))
      AND (p.name ILIKE v_pattern OR p.creation_notes ILIKE v_pattern)

    UNION ALL

    SELECT
      CASE WHEN sp.project_id IS NULL THEN 'prompt' ELSE 'version' END,
      sp.id,
      COALESCE(NULLIF(sp.custom_name, ''), NULLIF(sp.title, ''), NULLIF(sp.theme, ''), 'Untitled prompt'),
      NULLIF(concat_ws(' · ', NULLIF(sp.version_label, ''), NULLIF(sp.genre, ''), NULLIF(sp.mood, '')), ''),
      sp.updated_at,
      '/library', 'prompts', sp.project_id,
      CASE
        WHEN lower(COALESCE(NULLIF(sp.custom_name, ''), NULLIF(sp.title, ''), NULLIF(sp.theme, ''))) = lower(v_query) THEN 0
        WHEN COALESCE(NULLIF(sp.custom_name, ''), NULLIF(sp.title, ''), NULLIF(sp.theme, '')) ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.saved_prompts sp
    WHERE sp.user_id = v_user_id
      AND (
        cardinality(v_types) = 0 OR
        (sp.project_id IS NULL AND 'prompt' = ANY(v_types)) OR
        (sp.project_id IS NOT NULL AND 'version' = ANY(v_types))
      )
      AND (_recency_days IS NULL OR sp.updated_at >= now() - make_interval(days => _recency_days))
      AND (
        sp.custom_name ILIKE v_pattern OR sp.title ILIKE v_pattern OR sp.theme ILIKE v_pattern OR
        sp.genre ILIKE v_pattern OR sp.mood ILIKE v_pattern OR sp.language ILIKE v_pattern OR
        sp.tags ILIKE v_pattern OR sp.lyrics ILIKE v_pattern OR sp.note ILIKE v_pattern OR
        sp.version_label ILIKE v_pattern OR sp.revision_request ILIKE v_pattern OR
        sp.version_user_note ILIKE v_pattern
      )

    UNION ALL

    SELECT
      'analysis', sa.id, sa.name,
      NULLIF(sa.model, ''), sa.created_at,
      '/library', 'prompts', sa.project_id,
      CASE
        WHEN lower(sa.name) = lower(v_query) THEN 0
        WHEN sa.name ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.song_analyses sa
    WHERE sa.user_id = v_user_id
      AND public.current_user_can_use_feature('song_analyzer')
      AND (cardinality(v_types) = 0 OR 'analysis' = ANY(v_types))
      AND (_recency_days IS NULL OR sa.created_at >= now() - make_interval(days => _recency_days))
      AND (sa.name ILIKE v_pattern OR sa.model ILIKE v_pattern)

    UNION ALL

    SELECT
      'inspiration_wall', iw.id, iw.title,
      NULLIF(concat_ws(' · ', NULLIF(iw.selected_theme, ''), NULLIF(iw.description, '')), ''),
      iw.updated_at,
      '/inspiration-wall', NULL, iw.connected_project_id,
      CASE
        WHEN lower(iw.title) = lower(v_query) THEN 0
        WHEN iw.title ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.inspiration_walls iw
    WHERE iw.owner_id = v_user_id
      AND public.current_user_can_use_feature('inspiration_wall')
      AND (cardinality(v_types) = 0 OR 'inspiration_wall' = ANY(v_types))
      AND (_recency_days IS NULL OR iw.updated_at >= now() - make_interval(days => _recency_days))
      AND (iw.title ILIKE v_pattern OR iw.description ILIKE v_pattern OR iw.selected_theme ILIKE v_pattern)

    UNION ALL

    SELECT
      'story_map', sm.id, sm.title,
      NULLIF(concat_ws(' · ', NULLIF(sm.theme, ''), NULLIF(sm.summary, '')), ''),
      sm.updated_at,
      '/story-map', NULL, sm.project_id,
      CASE
        WHEN lower(sm.title) = lower(v_query) THEN 0
        WHEN sm.title ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.story_maps sm
    WHERE sm.user_id = v_user_id
      AND public.current_user_can_use_feature('story_map')
      AND (cardinality(v_types) = 0 OR 'story_map' = ANY(v_types))
      AND (_recency_days IS NULL OR sm.updated_at >= now() - make_interval(days => _recency_days))
      AND (
        sm.title ILIKE v_pattern OR sm.concept ILIKE v_pattern OR sm.theme ILIKE v_pattern OR
        sm.emotional_direction ILIKE v_pattern OR sm.narrator ILIKE v_pattern OR
        sm.point_of_view ILIKE v_pattern OR sm.desired_ending ILIKE v_pattern OR
        sm.progression_type ILIKE v_pattern OR sm.summary ILIKE v_pattern OR
        sm.starting_state ILIKE v_pattern OR sm.central_change ILIKE v_pattern OR
        sm.turning_point ILIKE v_pattern OR sm.resolution ILIKE v_pattern
      )

    UNION ALL

    SELECT
      'song_universe', su.id, su.title,
      NULLIF(concat_ws(' · ', NULLIF(su.universe_type, ''), NULLIF(su.description, '')), ''),
      su.updated_at,
      '/song-universe', NULL, NULL::uuid,
      CASE
        WHEN lower(su.title) = lower(v_query) THEN 0
        WHEN su.title ILIKE v_query || '%' THEN 1
        ELSE 2
      END
    FROM public.song_universes su
    WHERE su.owner_id = v_user_id
      AND public.current_user_can_use_feature('song_universe')
      AND (cardinality(v_types) = 0 OR 'song_universe' = ANY(v_types))
      AND (_recency_days IS NULL OR su.updated_at >= now() - make_interval(days => _recency_days))
      AND (
        su.title ILIKE v_pattern OR su.description ILIKE v_pattern OR su.universe_type ILIKE v_pattern OR
        su.initial_direction ILIKE v_pattern OR su.arc_direction ILIKE v_pattern OR
        su.planner_contrast ILIKE v_pattern
      )
  )
  SELECT c.item_type, c.item_id, c.title, c.subtitle, c.updated_at,
         c.target_path, c.target_tab, c.project_id, c.match_rank
  FROM candidates c
  ORDER BY c.match_rank ASC, c.updated_at DESC, c.title ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_personal_library(text, text[], integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_personal_library(text, text[], integer, integer)
  TO authenticated, service_role;

COMMIT;
