-- Staff-only track moderation state. This is independent from creator-owned
-- is_published visibility.
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS moderation_reason_code text,
  ADD COLUMN IF NOT EXISTS moderation_reason_text text,
  ADD COLUMN IF NOT EXISTS moderation_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_moderation_status_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_moderation_status_check
  CHECK (moderation_status IN ('active', 'locked'));

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_moderation_reason_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_moderation_reason_check
  CHECK (moderation_reason_code IS NULL OR moderation_reason_code IN (
    'reported_third_party_rights',
    'suspected_copyright_rights',
    'policy_violation',
    'harassment_abusive_content',
    'spam_deceptive_content',
    'other'
  ));

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_moderation_state_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_moderation_state_check
  CHECK (
    (moderation_status = 'active'
      AND moderation_reason_code IS NULL
      AND moderation_reason_text IS NULL
      AND moderation_locked_at IS NULL
      AND moderation_locked_by IS NULL)
    OR
    (moderation_status = 'locked'
      AND moderation_reason_code IS NOT NULL
      AND (moderation_reason_code <> 'other' OR length(trim(COALESCE(moderation_reason_text, ''))) > 0)
      AND moderation_locked_at IS NOT NULL
      AND moderation_locked_by IS NOT NULL)
  );

-- Keep creator writes working while making staff moderation columns server-only.
REVOKE INSERT, UPDATE ON public.tracks FROM authenticated;
GRANT INSERT (
  user_id, title, genre, prompt, lyrics, audio_url, audio_key, audio_type,
  art_url, cover_url, duration_seconds, is_published
) ON public.tracks TO authenticated;
GRANT UPDATE (
  title, genre, prompt, lyrics, audio_url, audio_key, audio_type,
  art_url, cover_url, duration_seconds, is_published
) ON public.tracks TO authenticated;

DROP POLICY IF EXISTS "Users can view their own tracks" ON public.tracks;
CREATE POLICY "Users can view their own active tracks" ON public.tracks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND moderation_status = 'active');

CREATE INDEX IF NOT EXISTS tracks_moderation_status_idx
  ON public.tracks (moderation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.track_storage_cleanup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audio_key text,
  cover_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS track_storage_cleanup_pending_idx
  ON public.track_storage_cleanup (status, created_at DESC);

ALTER TABLE public.track_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.track_storage_cleanup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.track_storage_cleanup TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_moderation_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := 'user';
  v_status text := 'active';
  v_is_banned boolean := true;
  v_can_moderate boolean := false;
BEGIN
  SELECT ur.role::text, ur.moderation_status, COALESCE(pp.is_banned, true)
    INTO v_role, v_status, v_is_banned
  FROM public.user_roles ur
  LEFT JOIN public.profile_private pp ON pp.user_id = ur.user_id
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role::text
    WHEN 'admin' THEN 4
    WHEN 'senior_moderator' THEN 3
    WHEN 'moderator' THEN 2
    ELSE 1
  END DESC
  LIMIT 1;

  v_can_moderate := NOT v_is_banned AND (v_role = 'admin' OR (v_role IN ('moderator', 'senior_moderator') AND v_status = 'active'));

  RETURN jsonb_build_object(
    'role', v_role,
    'status', v_status,
    'can_view_users', v_can_moderate,
    'can_block_users', v_can_moderate,
    'can_unblock_users', v_can_moderate,
    'can_suspend_moderator', NOT v_is_banned AND v_role IN ('admin', 'senior_moderator') AND (v_role = 'admin' OR v_status = 'active'),
    'can_manage_roles', NOT v_is_banned AND v_role = 'admin',
    'can_delete_users', NOT v_is_banned AND v_role = 'admin',
    'can_manage_registration_blocks', NOT v_is_banned AND v_role = 'admin',
    'can_manage_model_access', NOT v_is_banned AND v_role = 'admin',
    'can_access_admin_settings', NOT v_is_banned AND v_role = 'admin',
    'can_lock_tracks', v_can_moderate,
    'can_delete_tracks', NOT v_is_banned AND v_role IN ('admin', 'senior_moderator') AND (v_role = 'admin' OR v_status = 'active'),
    'can_review_reported_message', v_can_moderate,
    'can_review_reported_conversation', NOT v_is_banned AND v_role IN ('admin', 'senior_moderator')
  );
END;
$$;

DROP POLICY IF EXISTS "Published tracks are viewable by everyone" ON public.tracks;
CREATE POLICY "Published active tracks are viewable by everyone" ON public.tracks
  FOR SELECT USING (is_published = true AND moderation_status = 'active');

CREATE OR REPLACE FUNCTION public.staff_lock_track(
  _track_id uuid, _reason_code text, _reason_text text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_status text;
BEGIN
  IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _reason_code NOT IN (
    'reported_third_party_rights', 'suspected_copyright_rights', 'policy_violation',
    'harassment_abusive_content', 'spam_deceptive_content', 'other'
  ) THEN RAISE EXCEPTION 'a valid track moderation reason is required'; END IF;
  IF _reason_code = 'other' AND length(trim(COALESCE(_reason_text, ''))) = 0 THEN
    RAISE EXCEPTION 'a custom track moderation reason is required';
  END IF;

  SELECT user_id, moderation_status INTO v_owner, v_status
  FROM public.tracks WHERE id = _track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  UPDATE public.tracks
  SET moderation_status = 'locked',
      moderation_reason_code = _reason_code,
      moderation_reason_text = CASE WHEN _reason_code = 'other' THEN trim(_reason_text) ELSE NULL END,
      moderation_locked_at = now(),
      moderation_locked_by = v_actor
  WHERE id = _track_id;

  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_actor, v_owner, 'LOCK_TRACK', jsonb_build_object(
    'track_id', _track_id, 'reason_code', _reason_code, 'has_custom_reason', _reason_code = 'other'
  ));
  RETURN jsonb_build_object('ok', true, 'track_id', _track_id, 'moderation_status', 'locked');
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_unlock_track(_track_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT user_id INTO v_owner FROM public.tracks WHERE id = _track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  UPDATE public.tracks
  SET moderation_status = 'active',
      moderation_reason_code = NULL,
      moderation_reason_text = NULL,
      moderation_locked_at = NULL,
      moderation_locked_by = NULL
  WHERE id = _track_id;

  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_actor, v_owner, 'UNLOCK_TRACK', jsonb_build_object('track_id', _track_id));
  RETURN jsonb_build_object('ok', true, 'track_id', _track_id, 'moderation_status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_track(_track_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_track jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_lock_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'id', t.id, 'user_id', t.user_id, 'title', t.title, 'genre', t.genre,
    'prompt', t.prompt, 'lyrics', t.lyrics, 'audio_url', t.audio_url,
    'audio_type', t.audio_type, 'art_url', t.art_url, 'cover_url', t.cover_url,
    'duration_seconds', t.duration_seconds, 'plays', t.plays,
    'is_published', t.is_published, 'created_at', t.created_at,
    'moderation_status', t.moderation_status,
    'moderation_reason_code', t.moderation_reason_code,
    'moderation_reason_text', t.moderation_reason_text,
    'moderation_locked_at', t.moderation_locked_at
  ) INTO v_track FROM public.tracks t WHERE t.id = _track_id;
  IF v_track IS NULL THEN RETURN NULL; END IF;
  RETURN v_track;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_delete_track(_track_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup_id uuid;
  v_audio_key text;
  v_cover_path text;
  v_unsafe_audio_reference boolean := false;
  v_unsafe_cover_reference boolean := false;
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO v_track FROM public.tracks WHERE id = _track_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found'; END IF;

  IF v_track.audio_key IS NOT NULL THEN
    IF left(v_track.audio_key, length('tracks/' || v_track.user_id::text || '/')) = 'tracks/' || v_track.user_id::text || '/'
      AND length(v_track.audio_key) > length('tracks/' || v_track.user_id::text || '/') THEN
      v_audio_key := v_track.audio_key;
    ELSE
      v_unsafe_audio_reference := true;
    END IF;
  END IF;

  -- The application stores a Supabase public URL. Accept that exact format,
  -- or a legacy raw path, then require the first path segment to be the owner.
  IF v_track.cover_url IS NOT NULL THEN
    IF v_track.cover_url ~ '^https?://[^/]+/storage/v1/object/public/track-covers/.+$' THEN
      v_cover_path := substring(v_track.cover_url FROM '^https?://[^/]+/storage/v1/object/public/track-covers/(.+)$');
    ELSIF v_track.cover_url ~ '^[0-9a-fA-F-]{36}/.+$' THEN
      v_cover_path := v_track.cover_url;
    END IF;

    IF v_cover_path IS NULL
      OR left(v_cover_path, length(v_track.user_id::text || '/')) <> v_track.user_id::text || '/'
      OR length(v_cover_path) <= length(v_track.user_id::text || '/') THEN
      v_cover_path := NULL;
      v_unsafe_cover_reference := true;
    END IF;
  END IF;

  IF v_audio_key IS NOT NULL OR v_cover_path IS NOT NULL THEN
    INSERT INTO public.track_storage_cleanup (track_id, owner_id, audio_key, cover_path, created_by)
    VALUES (_track_id, v_track.user_id, v_audio_key, v_cover_path, v_actor)
    RETURNING id INTO v_cleanup_id;
  END IF;

  DELETE FROM public.tracks WHERE id = _track_id;
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (v_actor, v_track.user_id, 'DELETE_TRACK', jsonb_build_object(
    'track_id', _track_id, 'had_audio_file', v_audio_key IS NOT NULL,
    'had_cover_file', v_cover_path IS NOT NULL, 'storage_cleanup_id', v_cleanup_id,
    'audio_cleanup_skipped', v_unsafe_audio_reference,
    'cover_cleanup_skipped', v_unsafe_cover_reference
  ));
  RETURN jsonb_build_object('ok', true, 'cleanup_id', v_cleanup_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_track_storage_cleanup(_cleanup_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_cleanup jsonb;
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT jsonb_build_object(
    'id', id, 'audio_key', audio_key, 'cover_path', cover_path,
    'status', status, 'attempt_count', attempt_count
  ) INTO v_cleanup
  FROM public.track_storage_cleanup
  WHERE id = _cleanup_id;
  IF v_cleanup IS NULL THEN RAISE EXCEPTION 'storage cleanup not found'; END IF;
  RETURN v_cleanup;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_complete_track_storage_cleanup(_cleanup_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.track_storage_cleanup
  SET status = 'complete', completed_at = now(), last_error = NULL, attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_fail_track_storage_cleanup(_cleanup_id uuid, _error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_moderation_capability('can_delete_tracks') THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.track_storage_cleanup
  SET last_error = left(COALESCE(_error, 'storage cleanup failed'), 1000), attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK'
));

REVOKE ALL ON FUNCTION public.staff_lock_track(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_unlock_track(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_get_track(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_delete_track(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_get_track_storage_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_fail_track_storage_cleanup(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_lock_track(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_unlock_track(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_track(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_delete_track(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_track_storage_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_fail_track_storage_cleanup(uuid,text) TO authenticated, service_role;
