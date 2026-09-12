-- Security Batch 1: close direct track deletion, storage cleanup, upload, and
-- canonical-account enforcement gaps without changing unrelated behavior.

-- A missing canonical private profile is not a valid active account. Keep the
-- legacy helper fail-closed and expose a caller-bound predicate for RLS.
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE((SELECT pp.is_banned FROM public.profile_private pp WHERE pp.user_id = _user_id), true);
$$;

CREATE OR REPLACE FUNCTION public.has_valid_account_state(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() = _user_id
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.profile_private pp ON pp.user_id = u.id
      WHERE u.id = _user_id
        AND pp.is_banned = false
    );
$$;

REVOKE ALL ON FUNCTION public.has_valid_account_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_valid_account_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

-- Track deletion must be performed through the cleanup/audit RPCs. The
-- SECURITY DEFINER functions retain their internal ability to delete rows.
REVOKE DELETE ON TABLE public.tracks FROM authenticated;
DROP POLICY IF EXISTS "Users can delete their own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Admins can delete any track" ON public.tracks;

-- Owner deletion is allowed only for an active track. Staff/admin deletion
-- remains governed by staff_delete_track and its existing role rules.
CREATE OR REPLACE FUNCTION public.delete_track_with_cleanup(_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_cleanup jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id
    AND (user_id = v_actor OR public.has_role(v_actor, 'admin'::public.app_role))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or you do not have permission to delete it'; END IF;

  IF v_track.user_id = v_actor AND v_track.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'locked tracks cannot be deleted by their owner';
  END IF;

  v_cleanup := public.capture_track_storage_cleanup(
    _track_id, v_track.user_id, v_actor, v_track.audio_key, v_track.cover_url
  );

  DELETE FROM public.tracks
  WHERE id = _track_id
    AND (user_id = v_actor OR public.has_role(v_actor, 'admin'::public.app_role));
  IF NOT FOUND THEN RAISE EXCEPTION 'track could not be deleted'; END IF;

  RETURN jsonb_build_object('ok', true) || v_cleanup;
END;
$$;

-- Only the trusted server-role cleanup executor may inspect/finalize a
-- cleanup. Browser-authenticated staff still reach this path through the
-- server functions, which use the server-only service-role client.
CREATE OR REPLACE FUNCTION public.can_manage_track_storage_cleanup(_cleanup_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.role() = 'service_role';
$$;

-- Include owner_id in the server-only cleanup projection so the application
-- can repeat the exact namespace check before touching R2.
CREATE OR REPLACE FUNCTION public.staff_get_track_storage_cleanup(_cleanup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cleanup jsonb;
  v_owner_id uuid;
  v_audio_key text;
  v_cover_path text;
  v_status text;
  v_attempt_count integer;
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT owner_id, audio_key, cover_path, status, attempt_count
    INTO v_owner_id, v_audio_key, v_cover_path, v_status, v_attempt_count
  FROM public.track_storage_cleanup
  WHERE id = _cleanup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup not found'; END IF;

  IF v_audio_key IS NULL OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_audio_key, 'tracks/' || v_owner_id::text || '/')
  THEN v_audio_key := NULL; END IF;

  IF v_cover_path IS NULL OR v_owner_id IS NULL
    OR NOT public.is_safe_track_storage_path(v_cover_path, v_owner_id::text || '/')
  THEN v_cover_path := NULL; END IF;

  v_cleanup := jsonb_build_object(
    'id', _cleanup_id, 'owner_id', v_owner_id,
    'audio_key', v_audio_key, 'cover_path', v_cover_path,
    'status', v_status, 'attempt_count', v_attempt_count
  );

  IF v_cover_path IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cover_path, 0));
    IF EXISTS (SELECT 1 FROM public.tracks t WHERE public.track_cover_path(t.cover_url) = v_cover_path) THEN
      v_cleanup := jsonb_set(v_cleanup, '{cover_path}', 'null'::jsonb);
    END IF;
  END IF;

  RETURN v_cleanup;
END;
$$;

-- Recreate the completion/failure checks with the hardened capability helper.
CREATE OR REPLACE FUNCTION public.staff_complete_track_storage_cleanup(_cleanup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM public.track_cover_cleanup_locks WHERE cleanup_id = _cleanup_id;
  UPDATE public.track_storage_cleanup
  SET status = 'complete', completed_at = now(), last_error = NULL, attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_fail_track_storage_cleanup(_cleanup_id uuid, _error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_manage_track_storage_cleanup(_cleanup_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.track_storage_cleanup
  SET last_error = left(COALESCE(_error, 'storage cleanup failed'), 1000), attempt_count = attempt_count + 1
  WHERE id = _cleanup_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'storage cleanup is not pending'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_track_with_cleanup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_get_track_storage_cleanup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_fail_track_storage_cleanup(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_track_with_cleanup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_get_track_storage_cleanup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_complete_track_storage_cleanup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_fail_track_storage_cleanup(uuid, text) TO service_role;

-- Rebind sensitive direct mutations to a live, non-banned canonical account.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = id)
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = id);
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can mark their own welcome email sent" ON public.profile_private;
CREATE POLICY "Users can mark their own welcome email sent" ON public.profile_private FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id)
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own tracks" ON public.tracks;
CREATE POLICY "Users can create their own tracks" ON public.tracks FOR INSERT TO authenticated
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own tracks" ON public.tracks;
CREATE POLICY "Users can update their own tracks" ON public.tracks FOR UPDATE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id)
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own saved prompts" ON public.saved_prompts;
CREATE POLICY "Users manage their own saved prompts" ON public.saved_prompts FOR ALL TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id)
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can like as themselves" ON public.likes;
CREATE POLICY "Users can like as themselves" ON public.likes FOR INSERT TO authenticated
  WITH CHECK (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.likes;
CREATE POLICY "Users can remove their own likes" ON public.likes FOR DELETE TO authenticated
  USING (public.has_valid_account_state(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()))
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
CREATE POLICY "Users can delete own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users manage their own avatar files" ON storage.objects;
CREATE POLICY "Users manage their own avatar files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()))
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users can upload their own track covers" ON storage.objects;
CREATE POLICY "Users can upload their own track covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users can update their own track covers" ON storage.objects;
CREATE POLICY "Users can update their own track covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()))
  WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own track covers" ON storage.objects;
CREATE POLICY "Users can delete their own track covers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_valid_account_state(auth.uid()));
