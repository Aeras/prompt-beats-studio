-- Server-side eligibility state for authenticated completed playback.
-- Anonymous playback remains public, but is not counted until a trustworthy
-- anonymous session identity exists; a shared bucket would undercount users
-- and a client-supplied identity would be spoofable.
CREATE TABLE public.track_play_throttles (
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  listener_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_counted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, listener_user_id)
);

ALTER TABLE public.track_play_throttles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.track_play_throttles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.track_play_throttles TO service_role;

CREATE OR REPLACE FUNCTION public.increment_track_play(_track_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_listener uuid := auth.uid();
  v_duration integer;
  v_min_interval interval;
  v_plays integer;
BEGIN
  IF v_listener IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT duration_seconds INTO v_duration
  FROM public.tracks
  WHERE id = _track_id AND is_published = true AND moderation_status = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A listener cannot register another play sooner than the server-side
  -- meaningful-listen threshold for this track. Unknown durations use a
  -- conservative 30-second fallback; very short tracks retain a 5-second
  -- lower bound to prevent rapid direct-call inflation.
  v_min_interval := make_interval(secs => GREATEST(
    5,
    CEIL(COALESCE(v_duration, 30)::numeric * 0.7)::integer
  ));

  INSERT INTO public.track_play_throttles (track_id, listener_user_id, last_counted_at)
  VALUES (_track_id, v_listener, now())
  ON CONFLICT (track_id, listener_user_id) DO UPDATE
  SET last_counted_at = now()
  WHERE public.track_play_throttles.last_counted_at <= now() - v_min_interval;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.tracks
  SET plays = plays + 1
  WHERE id = _track_id
    AND is_published = true
    AND moderation_status = 'active'
  RETURNING plays INTO v_plays;

  RETURN v_plays;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_track_play(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_track_play(uuid) TO authenticated, service_role;
