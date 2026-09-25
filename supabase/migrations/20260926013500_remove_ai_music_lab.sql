-- Remove the retired AI Music Lab experiment and its provider-specific metadata.
BEGIN;

-- Remove the retired feature from Feature Access. User grants cascade from the policy row.
DELETE FROM public.feature_access_policies WHERE feature_key = 'ai_music_lab';

-- Remove experiment-only admission/idempotency history before tightening constraints.
DELETE FROM public.ai_auxiliary_requests WHERE operation = 'ai_music_lab';
DELETE FROM public.ai_auxiliary_admissions WHERE operation = 'ai_music_lab';

ALTER TABLE public.ai_auxiliary_requests
  DROP CONSTRAINT IF EXISTS ai_auxiliary_requests_operation_check;
ALTER TABLE public.ai_auxiliary_requests
  ADD CONSTRAINT ai_auxiliary_requests_operation_check
  CHECK (operation IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe'));

ALTER TABLE public.ai_auxiliary_admissions
  DROP CONSTRAINT IF EXISTS ai_auxiliary_admissions_operation_check;
ALTER TABLE public.ai_auxiliary_admissions
  ADD CONSTRAINT ai_auxiliary_admissions_operation_check
  CHECK (operation IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe'));

-- Remove experiment-only usage rows/outbox entries so retired provider operations do not remain in analytics.
DELETE FROM public.ai_usage_outbox
WHERE payload ->> 'operation' = 'ai_music_lab_generation';
DELETE FROM public.ai_usage_logs
WHERE operation = 'ai_music_lab_generation';

-- Remove retired provider labels from track provenance. Existing test records are normalized to Other.
UPDATE public.tracks
SET created_with = 'Other'
WHERE created_with IN ('Google Lyria 3.5','ElevenLabs Music');

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_created_with_check;
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_created_with_check
  CHECK (
    created_with IS NULL OR (
      source_type = 'upload' AND created_with IN (
        'Suno','Udio','TopMediai','Stable Audio','Mureka','Riffusion','MusicFX',
        'Boomy','Soundraw','AIVA','Loudly','Other'
      )
    )
  );

-- Keep server-side admission aligned with the retired operation set.
CREATE OR REPLACE FUNCTION public.admit_auxiliary_ai_request(
  _operation text,
  _limit_per_hour integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe') THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;
  IF _limit_per_hour < 1 OR _limit_per_hour > 100 THEN RAISE EXCEPTION 'invalid AI rate limit'; END IF;

  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai:' || v_user::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.ai_auxiliary_admissions
    WHERE user_id = v_user AND operation = _operation
      AND created_at > now() - interval '15 seconds'
  ) THEN
    RETURN false;
  END IF;

  IF public._is_admin_level_internal(v_user) THEN
    INSERT INTO public.ai_auxiliary_admissions(user_id, operation) VALUES (v_user, _operation);
    DELETE FROM public.ai_auxiliary_admissions
      WHERE user_id = v_user AND created_at < now() - interval '7 days';
    RETURN true;
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.ai_auxiliary_admissions
  WHERE user_id = v_user AND operation = _operation
    AND created_at > now() - interval '1 hour';

  IF v_used >= _limit_per_hour THEN RETURN false; END IF;

  INSERT INTO public.ai_auxiliary_admissions(user_id, operation) VALUES (v_user, _operation);
  DELETE FROM public.ai_auxiliary_admissions
    WHERE user_id = v_user AND created_at < now() - interval '7 days';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_auxiliary_ai_request(_operation text, _request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_request public.ai_auxiliary_requests;
  v_used integer;
  v_token uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN ('song_setup_assistant','song_analyzer','inspiration_wall','story_map','song_universe') THEN
    RAISE EXCEPTION 'invalid AI operation';
  END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai-request:' || v_user::text || ':' || _operation || ':' || _request_key::text, 0));

  SELECT * INTO v_request FROM public.ai_auxiliary_requests
  WHERE user_id = v_user AND operation = _operation AND request_key = _request_key FOR UPDATE;
  IF FOUND THEN
    IF v_request.status = 'completed' THEN
      RETURN jsonb_build_object('status','completed','result',v_request.result);
    END IF;
    IF v_request.status = 'processing' AND (v_request.provider_started_at IS NOT NULL OR v_request.updated_at > now() - interval '15 minutes') THEN
      RETURN jsonb_build_object('status','processing');
    END IF;
    IF v_request.status = 'failed' AND v_request.provider_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('status','failed','error',COALESCE(v_request.error,'AI request failed'));
    END IF;
    v_token := gen_random_uuid();
    UPDATE public.ai_auxiliary_requests
    SET status='processing', execution_token=v_token, error=NULL, updated_at=now()
    WHERE id=v_request.id;
    RETURN jsonb_build_object('status','claimed','executionToken',v_token);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai-hour:' || v_user::text || ':' || _operation, 0));
  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_auxiliary_admissions
    WHERE user_id=v_user AND operation=_operation AND created_at > now()-interval '1 hour';
    IF v_used >= 10 THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
  END IF;
  INSERT INTO public.ai_auxiliary_admissions(user_id,operation) VALUES(v_user,_operation);
  DELETE FROM public.ai_auxiliary_admissions WHERE user_id=v_user AND created_at < now()-interval '7 days';

  v_token := gen_random_uuid();
  INSERT INTO public.ai_auxiliary_requests(user_id,operation,request_key,status,execution_token)
  VALUES(v_user,_operation,_request_key,'processing',v_token);
  RETURN jsonb_build_object('status','claimed','executionToken',v_token);
END;
$$;

-- Replace the current edit RPC so retired provider labels cannot be reintroduced by a direct call.
DROP FUNCTION IF EXISTS public.edit_track_with_cleanup(uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, boolean);

CREATE FUNCTION public.edit_track_with_cleanup(
  _track_id uuid,
  _title text,
  _genre text,
  _prompt text,
  _lyrics text,
  _is_published boolean,
  _source_type text,
  _created_with text DEFAULT NULL::text,
  _source_url text DEFAULT NULL::text,
  _source_id text DEFAULT NULL::text,
  _new_audio_url text DEFAULT NULL::text,
  _new_audio_key text DEFAULT NULL::text,
  _new_cover_url text DEFAULT NULL::text,
  _allow_download boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_old_audio text;
  v_old_cover text;
  v_cleanup jsonb := '{}'::jsonb;
  v_cleanup_id uuid;
  v_cover_path text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _is_published IS NULL THEN RAISE EXCEPTION 'invalid track visibility'; END IF;

  SELECT * INTO v_track FROM public.tracks
  WHERE id = _track_id AND user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND OR v_track.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'track not found or you do not have permission to edit it';
  END IF;
  IF length(trim(_title)) NOT BETWEEN 1 AND 120
    OR length(trim(_genre)) NOT BETWEEN 1 AND 60
    OR length(trim(COALESCE(_prompt, ''))) > 4000
    OR length(trim(COALESCE(_lyrics, ''))) > 8000 THEN
    RAISE EXCEPTION 'invalid track metadata';
  END IF;

  IF v_track.source_type = 'upload' THEN
    IF _source_type <> 'upload' OR _source_url IS NOT NULL OR _source_id IS NOT NULL THEN
      RAISE EXCEPTION 'track source cannot be changed';
    END IF;
    IF _created_with IS NOT NULL AND _created_with NOT IN (
      'Suno', 'Udio', 'TopMediai', 'Stable Audio', 'Mureka', 'Riffusion',
      'MusicFX', 'Boomy', 'Soundraw', 'AIVA', 'Loudly', 'Other'
    ) THEN
      RAISE EXCEPTION 'invalid created with value';
    END IF;
    IF (_new_audio_url IS NULL) <> (_new_audio_key IS NULL) THEN
      RAISE EXCEPTION 'incomplete uploaded audio replacement';
    END IF;
    IF _new_audio_key IS NOT NULL AND NOT public.is_safe_track_storage_path(_new_audio_key, 'tracks/' || v_actor::text || '/') THEN
      RAISE EXCEPTION 'invalid uploaded audio reference';
    END IF;
    IF _new_cover_url IS NOT NULL THEN
      v_cover_path := public.track_cover_path(_new_cover_url);
      IF v_cover_path IS NULL OR NOT public.is_safe_track_storage_path(v_cover_path, v_actor::text || '/') THEN
        RAISE EXCEPTION 'invalid uploaded cover reference';
      END IF;
    END IF;
    v_old_audio := CASE WHEN _new_audio_key IS NOT NULL AND _new_audio_key IS DISTINCT FROM v_track.audio_key THEN v_track.audio_key END;
    v_old_cover := CASE WHEN _new_cover_url IS NOT NULL AND _new_cover_url IS DISTINCT FROM v_track.cover_url THEN v_track.cover_url END;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')), is_published = _is_published,
      created_with = _created_with,
      allow_download = COALESCE(_allow_download, false),
      audio_url = COALESCE(_new_audio_url, v_track.audio_url),
      audio_key = COALESCE(_new_audio_key, v_track.audio_key), cover_url = COALESCE(_new_cover_url, v_track.cover_url)
    WHERE id = _track_id;
  ELSIF v_track.source_type IN ('suno', 'udio') THEN
    IF _source_type <> v_track.source_type OR _created_with IS NOT NULL OR _source_url IS NULL OR _source_id IS NULL
      OR _new_audio_url IS NOT NULL OR _new_audio_key IS NOT NULL OR _new_cover_url IS NOT NULL THEN
      RAISE EXCEPTION 'track source cannot be changed';
    END IF;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')), is_published = _is_published,
      source_url = _source_url, source_id = _source_id,
      audio_url = _source_url, audio_type = 'link', audio_key = NULL, cover_url = NULL, created_with = NULL,
      allow_download = false
    WHERE id = _track_id;
  ELSE
    IF _source_type <> v_track.source_type OR _created_with IS NOT NULL OR _source_url IS NOT NULL OR _source_id IS NOT NULL
      OR _new_audio_url IS NOT NULL OR _new_audio_key IS NOT NULL OR _new_cover_url IS NOT NULL THEN
      RAISE EXCEPTION 'legacy track source is metadata-only';
    END IF;
    UPDATE public.tracks SET title = trim(_title), genre = trim(_genre), prompt = trim(COALESCE(_prompt, '')),
      lyrics = trim(COALESCE(_lyrics, '')), is_published = _is_published, created_with = NULL,
      allow_download = false
    WHERE id = _track_id;
  END IF;

  IF v_old_audio IS NOT NULL OR v_old_cover IS NOT NULL THEN
    v_cleanup := public.capture_track_storage_cleanup(_track_id, v_actor, v_actor, v_old_audio, v_old_cover);
    v_cleanup_id := NULLIF(v_cleanup ->> 'cleanup_id', '')::uuid;
    IF v_cleanup_id IS NOT NULL THEN
      UPDATE public.track_storage_cleanup SET cleanup_type = 'audio_replace' WHERE id = v_cleanup_id;
    END IF;
  END IF;
  SELECT to_jsonb(t) INTO v_result FROM public.tracks t WHERE t.id = _track_id;
  RETURN jsonb_build_object('track', v_result) || v_cleanup;
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_track_with_cleanup(uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_track_with_cleanup(uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

COMMIT;
