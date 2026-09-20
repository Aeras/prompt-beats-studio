-- Better Share / Public Song Pages + per-content visibility.
BEGIN;

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS prompt_is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lyrics_is_public boolean NOT NULL DEFAULT true;

GRANT SELECT (prompt_is_public, lyrics_is_public) ON public.tracks TO anon, authenticated;
GRANT INSERT (prompt_is_public, lyrics_is_public) ON public.tracks TO authenticated;

-- Prompt and lyrics may contain creator-private material. Public/application reads
-- must go through server projections after this migration.
REVOKE SELECT (prompt, lyrics) ON public.tracks FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.track_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  include_prompt boolean NOT NULL DEFAULT false,
  include_lyrics boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS track_share_links_owner_created_idx
  ON public.track_share_links(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS track_share_links_track_idx
  ON public.track_share_links(track_id, created_at DESC);

ALTER TABLE public.track_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_share_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.track_share_links TO service_role;

CREATE POLICY "Owners can view their share links"
  ON public.track_share_links FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND NOT public.current_user_is_banned());

CREATE TABLE IF NOT EXISTS public.track_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS track_share_events_track_created_idx
  ON public.track_share_events(track_id, created_at DESC);

ALTER TABLE public.track_share_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_share_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.track_share_events TO service_role;

CREATE POLICY "Owners can view share activity for their tracks"
  ON public.track_share_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.id = track_id AND t.user_id = auth.uid()
    )
    AND NOT public.current_user_is_banned()
  );

CREATE OR REPLACE FUNCTION public.create_track_share_link(
  _track_id uuid,
  _include_prompt boolean DEFAULT false,
  _include_lyrics boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_link public.track_share_links%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id AND user_id = v_actor AND moderation_status = 'active';

  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  INSERT INTO public.track_share_links(track_id, owner_id, include_prompt, include_lyrics)
  VALUES (_track_id, v_actor, COALESCE(_include_prompt, false), COALESCE(_include_lyrics, false))
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'id', v_link.id,
    'token', v_link.token,
    'track_id', v_link.track_id,
    'include_prompt', v_link.include_prompt,
    'include_lyrics', v_link.include_lyrics,
    'created_at', v_link.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_track_share_link(
  _share_id uuid,
  _include_prompt boolean,
  _include_lyrics boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.track_share_links
  SET include_prompt = COALESCE(_include_prompt, false),
      include_lyrics = COALESCE(_include_lyrics, false)
  WHERE id = _share_id
    AND owner_id = auth.uid()
    AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'active share link not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_track_share_link(_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.track_share_links
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE id = _share_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'share link not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_track_public_share(_track_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tracks
    WHERE id = _track_id
      AND is_published = true
      AND moderation_status = 'active'
      AND user_id <> auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.track_share_events(track_id, shared_by)
  VALUES (_track_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_track_share_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.track_share_links%ROWTYPE;
  v_track public.tracks%ROWTYPE;
  v_artist jsonb;
BEGIN
  SELECT * INTO v_link
  FROM public.track_share_links
  WHERE token = _token AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = v_link.track_id;

  IF NOT FOUND OR v_track.moderation_status <> 'active' THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  -- Global track visibility is the ceiling for every existing share link.
  IF v_track.is_published IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'state', 'private',
      'track_id', v_track.id,
      'title', v_track.title
    );
  END IF;

  UPDATE public.track_share_links
  SET open_count = open_count + 1, last_opened_at = now()
  WHERE id = v_link.id;

  SELECT jsonb_build_object(
    'id', p.id,
    'handle', p.handle,
    'display_name', p.display_name,
    'artist_alias', p.artist_alias,
    'avatar_url', p.avatar_url,
    'staff_badge', p.staff_badge
  )
  INTO v_artist
  FROM public.public_profiles p
  WHERE p.id = v_track.user_id;

  RETURN jsonb_build_object(
    'state', 'active',
    'share_id', v_link.id,
    'track', jsonb_build_object(
      'id', v_track.id,
      'user_id', v_track.user_id,
      'title', v_track.title,
      'genre', v_track.genre,
      'prompt', CASE WHEN v_track.prompt_is_public AND v_link.include_prompt THEN v_track.prompt ELSE '' END,
      'lyrics', CASE WHEN v_track.lyrics_is_public AND v_link.include_lyrics THEN v_track.lyrics ELSE '' END,
      'prompt_is_public', v_track.prompt_is_public,
      'lyrics_is_public', v_track.lyrics_is_public,
      'audio_url', v_track.audio_url,
      'audio_type', v_track.audio_type,
      'source_type', v_track.source_type,
      'source_url', v_track.source_url,
      'source_id', v_track.source_id,
      'created_with', v_track.created_with,
      'allow_download', v_track.allow_download,
      'art_url', v_track.art_url,
      'cover_url', v_track.cover_url,
      'duration_seconds', v_track.duration_seconds,
      'plays', v_track.plays,
      'is_published', v_track.is_published,
      'created_at', v_track.created_at
    ),
    'artist', v_artist
  );
END;
$$;

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
        WHERE l.track_id = t.id AND l.owner_id = auth.uid()
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.tracks t
    WHERE t.user_id = auth.uid()
      AND t.moderation_status = 'active'
      AND (
        EXISTS (SELECT 1 FROM public.track_share_links l WHERE l.track_id = t.id)
        OR EXISTS (SELECT 1 FROM public.track_share_events e WHERE e.track_id = t.id)
      )
  ) q;
$$;

REVOKE ALL ON FUNCTION public.create_track_share_link(uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_track_share_link(uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_track_share_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_track_public_share(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_track_share_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_share_management() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_track_share_link(uuid, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_track_share_link(uuid, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_track_share_link(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_track_public_share(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_track_share_by_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_share_management() TO authenticated, service_role;

-- Trending remains public but prompt/lyrics are projected according to creator settings.
DROP FUNCTION IF EXISTS public.list_trending_tracks();
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
  created_with text,
  allow_download boolean,
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT t.id, t.user_id, t.title, t.genre,
           CASE WHEN t.prompt_is_public THEN t.prompt ELSE '' END AS prompt,
           CASE WHEN t.lyrics_is_public THEN t.lyrics ELSE '' END AS lyrics,
           t.audio_url, t.audio_type, t.source_type, t.source_url, t.source_id,
           t.created_with, t.allow_download, t.art_url, t.cover_url,
           t.duration_seconds, t.plays, t.is_published, t.created_at
    FROM public.tracks AS t
    WHERE t.is_published = true AND t.moderation_status = 'active'
    ORDER BY t.created_at DESC, t.id ASC
    LIMIT 100
  )
  SELECT c.id, c.user_id, c.title, c.genre, c.prompt, c.lyrics,
         c.audio_url, c.audio_type, c.source_type, c.source_url, c.source_id,
         c.created_with, c.allow_download, c.art_url, c.cover_url,
         c.duration_seconds, c.plays, c.is_published, c.created_at,
         counts.likes
  FROM candidates AS c
  CROSS JOIN LATERAL (
    SELECT count(*) AS likes FROM public.likes AS l WHERE l.track_id = c.id
  ) counts
  ORDER BY (counts.likes * 3 + c.plays) DESC, c.created_at DESC, c.id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.list_trending_tracks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trending_tracks() TO service_role;

COMMIT;
