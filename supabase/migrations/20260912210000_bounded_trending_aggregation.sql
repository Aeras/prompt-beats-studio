-- Preserve Trending's newest-100 candidate universe and public field contract.
BEGIN;

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
           t.audio_url, t.audio_type, t.art_url, t.cover_url,
           t.duration_seconds, t.plays, t.is_published, t.created_at
    FROM public.tracks AS t
    -- The trusted server invokes this with service_role. Explicit visibility
    -- reproduces the anonymous track query without exposing moderation fields.
    WHERE t.is_published = true AND t.moderation_status = 'active'
    ORDER BY t.created_at DESC, t.id ASC
    LIMIT 100
  )
  SELECT c.id, c.user_id, c.title, c.genre, c.prompt, c.lyrics,
         c.audio_url, c.audio_type, c.art_url, c.cover_url,
         c.duration_seconds, c.plays, c.is_published, c.created_at,
         counts.likes
  FROM candidates AS c
  CROSS JOIN LATERAL (
    -- Parameterized counts use likes_track_id_idx; no global likes GROUP BY
    -- or raw like rows are returned. Work scales with these candidates' likes.
    SELECT count(*) AS likes
    FROM public.likes AS l
    WHERE l.track_id = c.id
  ) AS counts
  -- Stable JS sorting previously retained newest-first order for equal scores.
  ORDER BY (counts.likes * 3 + c.plays) DESC, c.created_at DESC, c.id ASC
  LIMIT 100;
$$;

-- Only the public server handler calls this RPC. This preserves complete like
-- counts regardless of authenticated users' own-row likes policies, without
-- granting browsers additional table access or using SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.list_trending_tracks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trending_tracks() TO service_role;

COMMIT;
