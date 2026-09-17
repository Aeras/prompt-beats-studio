-- Personal playlists and favorites for PromptBeats.
BEGIN;

CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playlists_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX playlists_user_updated_idx
  ON public.playlists (user_id, updated_at DESC);

CREATE TABLE public.playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX playlist_tracks_order_idx
  ON public.playlist_tracks (playlist_id, position, added_at);

CREATE TABLE public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX favorites_user_created_idx
  ON public.favorites (user_id, created_at DESC);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;

CREATE POLICY "Owners can view playlists"
  ON public.playlists FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners can create playlists"
  ON public.playlists FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT public.current_user_is_banned());

CREATE POLICY "Owners can update playlists"
  ON public.playlists FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND NOT public.current_user_is_banned())
  WITH CHECK (user_id = auth.uid() AND NOT public.current_user_is_banned());

CREATE POLICY "Owners can delete playlists"
  ON public.playlists FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND NOT public.current_user_is_banned());

CREATE POLICY "Owners can view playlist tracks"
  ON public.playlist_tracks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can add eligible playlist tracks"
  ON public.playlist_tracks FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.current_user_is_banned()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.id = track_id
        AND t.source_type = 'upload'
        AND t.audio_key IS NOT NULL
        AND (t.is_published = true OR t.user_id = auth.uid())
    )
  );

CREATE POLICY "Owners can remove playlist tracks"
  ON public.playlist_tracks FOR DELETE TO authenticated
  USING (
    NOT public.current_user_is_banned()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own favorites"
  ON public.favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own favorites"
  ON public.favorites FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.current_user_is_banned()
    AND EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.id = track_id
        AND (t.is_published = true OR t.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can remove their own favorites"
  ON public.favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND NOT public.current_user_is_banned());

CREATE OR REPLACE FUNCTION public.set_playlist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER playlists_set_updated_at
BEFORE UPDATE ON public.playlists
FOR EACH ROW EXECUTE FUNCTION public.set_playlist_updated_at();

CREATE OR REPLACE FUNCTION public.touch_playlist_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playlist_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_playlist_id := OLD.playlist_id;
  ELSE
    v_playlist_id := NEW.playlist_id;
  END IF;
  UPDATE public.playlists SET updated_at = now() WHERE id = v_playlist_id;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER playlist_tracks_touch_playlist
AFTER INSERT OR UPDATE OR DELETE ON public.playlist_tracks
FOR EACH ROW EXECUTE FUNCTION public.touch_playlist_from_items();

CREATE OR REPLACE FUNCTION public.prune_private_track_library_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_published = true AND NEW.is_published = false THEN
    DELETE FROM public.playlist_tracks pt
    USING public.playlists p
    WHERE pt.playlist_id = p.id
      AND pt.track_id = NEW.id
      AND p.user_id <> NEW.user_id;

    DELETE FROM public.favorites f
    WHERE f.track_id = NEW.id
      AND f.user_id <> NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tracks_prune_private_library_refs
AFTER UPDATE OF is_published ON public.tracks
FOR EACH ROW
WHEN (OLD.is_published IS DISTINCT FROM NEW.is_published)
EXECUTE FUNCTION public.prune_private_track_library_refs();

CREATE OR REPLACE FUNCTION public.reorder_playlist_tracks(
  _playlist_id uuid,
  _track_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_actor IS NULL OR public.current_user_is_banned() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = _playlist_id AND user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Playlist not found';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.playlist_tracks
  WHERE playlist_id = _playlist_id;

  IF cardinality(_track_ids) <> v_count THEN
    RAISE EXCEPTION 'Playlist order is incomplete';
  END IF;

  IF (SELECT count(DISTINCT id) FROM unnest(_track_ids) AS ids(id)) <> v_count THEN
    RAISE EXCEPTION 'Playlist order contains duplicates';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(_track_ids) AS ids(id)
    LEFT JOIN public.playlist_tracks pt
      ON pt.playlist_id = _playlist_id AND pt.track_id = ids.id
    WHERE pt.track_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Playlist order contains an invalid track';
  END IF;

  UPDATE public.playlist_tracks pt
  SET position = ordered.position
  FROM (
    SELECT id, (ordinality - 1)::integer AS position
    FROM unnest(_track_ids) WITH ORDINALITY AS ids(id, ordinality)
  ) AS ordered
  WHERE pt.playlist_id = _playlist_id
    AND pt.track_id = ordered.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_playlist_tracks(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_tracks(uuid, uuid[]) TO authenticated;

COMMIT;
