-- Phase B enforcement for Follow Creators and Notifications.
BEGIN;

DROP POLICY IF EXISTS "Recipients can read own notifications" ON public.notifications;
CREATE POLICY "Recipients can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  );

DROP POLICY IF EXISTS "Recipients can mark own notifications read" ON public.notifications;
CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  )
  WITH CHECK (
    recipient_user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  );

DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can read own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  );

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  );

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_can_use_feature('notifications')
  );

CREATE OR REPLACE FUNCTION public.notify_followers_on_first_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.first_published_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.first_published_at IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications(recipient_user_id,actor_user_id,type,track_id,event_key)
  SELECT
    f.follower_user_id,
    NEW.user_id,
    'new_track',
    NEW.id,
    'new_track:'||NEW.id::text||':'||f.follower_user_id::text
  FROM public.user_follows f
  LEFT JOIN public.notification_preferences pref ON pref.user_id=f.follower_user_id
  WHERE f.followed_user_id=NEW.user_id
    AND COALESCE(pref.new_track_enabled,true) IS TRUE
    AND public.can_use_feature(f.follower_user_id,'notifications')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.follow_creator(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_follow_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor)
     OR NOT public.current_user_can_use_feature('follow_creators')
  THEN RAISE EXCEPTION 'not allowed'; END IF;

  IF _target_user_id IS NULL OR _target_user_id=v_actor THEN RAISE EXCEPTION 'invalid follow target'; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.profile_private pp ON pp.user_id=p.id
    WHERE p.id=_target_user_id AND COALESCE(pp.is_banned,false)=false
  ) THEN RAISE EXCEPTION 'creator not available'; END IF;

  INSERT INTO public.user_follows(follower_user_id,followed_user_id)
  VALUES(v_actor,_target_user_id)
  ON CONFLICT(follower_user_id,followed_user_id) DO NOTHING
  RETURNING id INTO v_follow_id;

  IF v_follow_id IS NOT NULL
     AND public.can_use_feature(_target_user_id,'notifications')
     AND COALESCE((
       SELECT pref.new_follower_enabled
       FROM public.notification_preferences pref
       WHERE pref.user_id=_target_user_id
     ),true) IS TRUE
  THEN
    INSERT INTO public.notifications(recipient_user_id,actor_user_id,type,event_key)
    VALUES(_target_user_id,v_actor,'new_follower','new_follower:'||v_follow_id::text)
    ON CONFLICT(event_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('following',true,'created',v_follow_id IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_creator(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_deleted integer:=0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor)
     OR NOT public.current_user_can_use_feature('follow_creators')
  THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _target_user_id IS NULL OR _target_user_id=v_actor THEN RAISE EXCEPTION 'invalid follow target'; END IF;

  DELETE FROM public.user_follows
  WHERE follower_user_id=v_actor AND followed_user_id=_target_user_id;
  GET DIAGNOSTICS v_deleted=ROW_COUNT;

  RETURN jsonb_build_object('following',false,'removed',v_deleted>0);
END;
$$;

COMMIT;
