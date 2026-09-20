-- Follow Creator + In-App Notifications v1
-- Notification types are intentionally limited to new_track and new_follower.
BEGIN;

-- Canonical first-publication marker. Existing public tracks are marked as
-- already published before producers are enabled, so this migration never
-- announces historical catalog items.
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz;

UPDATE public.tracks
SET first_published_at = created_at
WHERE is_published IS TRUE
  AND first_published_at IS NULL;

CREATE TABLE public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followed_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_no_self CHECK (follower_user_id <> followed_user_id),
  CONSTRAINT user_follows_unique UNIQUE (follower_user_id, followed_user_id)
);

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  new_track_enabled boolean NOT NULL DEFAULT true,
  new_follower_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('new_track', 'new_follower')),
  track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL,
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_track_shape CHECK (
    type = 'new_track'
    OR (type = 'new_follower' AND track_id IS NULL)
  )
);

CREATE INDEX user_follows_followed_created_idx
  ON public.user_follows (followed_user_id, created_at DESC);
CREATE INDEX user_follows_follower_created_idx
  ON public.user_follows (follower_user_id, created_at DESC);
CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_user_id, created_at DESC);
CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Semantic duplicate protection in addition to event_key: a track may create
-- at most one new_track notification for a given recipient for its lifetime.
CREATE UNIQUE INDEX notifications_new_track_once_idx
  ON public.notifications (recipient_user_id, track_id, type)
  WHERE type = 'new_track' AND track_id IS NOT NULL;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Follow relationships are mutated only by the transactional RPCs below.
REVOKE ALL ON public.user_follows FROM PUBLIC, anon, authenticated;

-- Recipients may read their own notification rows and only change read_at.
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

CREATE POLICY "Recipients can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Preferences belong only to the signed-in user.
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_preferences TO authenticated;
GRANT INSERT (user_id, new_track_enabled, new_follower_enabled, updated_at)
  ON public.notification_preferences TO authenticated;
GRANT UPDATE (new_track_enabled, new_follower_enabled, updated_at)
  ON public.notification_preferences TO authenticated;

CREATE POLICY "Users can read own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- first_published_at is database-owned and write-once. Inserts cannot inject a
-- custom timestamp; the first real public state assigns it. Once non-null, any
-- attempt to clear or rewrite it fails.
CREATE OR REPLACE FUNCTION public.enforce_track_first_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published IS TRUE THEN
      NEW.first_published_at := COALESCE(NEW.created_at, now());
    ELSE
      NEW.first_published_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.first_published_at IS NOT NULL THEN
    IF NEW.first_published_at IS DISTINCT FROM OLD.first_published_at THEN
      RAISE EXCEPTION 'first_published_at is write-once';
    END IF;
    NEW.first_published_at := OLD.first_published_at;
    RETURN NEW;
  END IF;

  IF NEW.is_published IS TRUE THEN
    NEW.first_published_at := now();
  ELSE
    NEW.first_published_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tracks_first_published_write_once ON public.tracks;
CREATE TRIGGER tracks_first_published_write_once
BEFORE INSERT OR UPDATE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.enforce_track_first_published_at();

-- Set-based fan-out. This runs only when first_published_at appears for the
-- first time. ON CONFLICT plus the unique event/index guards make retries and
-- accidental duplicate execution harmless at the database level.
CREATE OR REPLACE FUNCTION public.notify_followers_on_first_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.first_published_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.first_published_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id,
    actor_user_id,
    type,
    track_id,
    event_key
  )
  SELECT
    f.follower_user_id,
    NEW.user_id,
    'new_track',
    NEW.id,
    'new_track:' || NEW.id::text || ':' || f.follower_user_id::text
  FROM public.user_follows f
  LEFT JOIN public.notification_preferences pref
    ON pref.user_id = f.follower_user_id
  WHERE f.followed_user_id = NEW.user_id
    AND COALESCE(pref.new_track_enabled, true) IS TRUE
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tracks_first_publication_notify ON public.tracks;
CREATE TRIGGER tracks_first_publication_notify
AFTER INSERT OR UPDATE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_first_publication();

CREATE OR REPLACE FUNCTION public.follow_creator(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_follow_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _target_user_id IS NULL OR _target_user_id = v_actor THEN
    RAISE EXCEPTION 'invalid follow target';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.profile_private pp ON pp.user_id = p.id
    WHERE p.id = _target_user_id
      AND COALESCE(pp.is_banned, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'creator not available';
  END IF;

  INSERT INTO public.user_follows (follower_user_id, followed_user_id)
  VALUES (v_actor, _target_user_id)
  ON CONFLICT (follower_user_id, followed_user_id) DO NOTHING
  RETURNING id INTO v_follow_id;

  IF v_follow_id IS NOT NULL
    AND COALESCE((
      SELECT pref.new_follower_enabled
      FROM public.notification_preferences pref
      WHERE pref.user_id = _target_user_id
    ), true) IS TRUE
  THEN
    INSERT INTO public.notifications (
      recipient_user_id,
      actor_user_id,
      type,
      event_key
    ) VALUES (
      _target_user_id,
      v_actor,
      'new_follower',
      'new_follower:' || v_follow_id::text
    )
    ON CONFLICT (event_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'following', true,
    'created', v_follow_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_creator(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _target_user_id IS NULL OR _target_user_id = v_actor THEN
    RAISE EXCEPTION 'invalid follow target';
  END IF;

  DELETE FROM public.user_follows
  WHERE follower_user_id = v_actor
    AND followed_user_id = _target_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'following', false,
    'removed', v_deleted > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.follow_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfollow_creator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_creator(uuid) TO authenticated;

COMMIT;
