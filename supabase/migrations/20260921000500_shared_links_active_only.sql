CREATE OR REPLACE FUNCTION public.list_my_share_management()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'track_id', t.id,
      'title', t.title,
      'cover_url', t.cover_url,
      'art_url', t.art_url,
      'is_published', t.is_published,
      'prompt_is_public', t.prompt_is_public,
      'lyrics_is_public', t.lyrics_is_public,
      'created_at', t.created_at,
      'public_share_count', (
        SELECT count(*) FROM public.track_share_events e WHERE e.track_id = t.id
      ),
      'last_public_share_at', (
        SELECT max(e.created_at) FROM public.track_share_events e WHERE e.track_id = t.id
      ),
      'owner_links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', l.id,
          'token', l.token,
          'include_prompt', l.include_prompt,
          'include_lyrics', l.include_lyrics,
          'created_at', l.created_at,
          'last_opened_at', l.last_opened_at,
          'open_count', l.open_count,
          'revoked_at', l.revoked_at
        ) ORDER BY l.created_at DESC)
        FROM public.track_share_links l
        WHERE l.track_id = t.id
          AND l.owner_id = auth.uid()
          AND l.revoked_at IS NULL
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.tracks t
    WHERE t.user_id = auth.uid()
      AND t.moderation_status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.track_share_links l
        WHERE l.track_id = t.id
          AND l.owner_id = auth.uid()
          AND l.revoked_at IS NULL
      )
  ) q;
$$;
