BEGIN;

ALTER TABLE public.private_review_sessions
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'project_version',
  ADD COLUMN IF NOT EXISTS source_track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS include_prompt boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_lyrics boolean NOT NULL DEFAULT true;

ALTER TABLE public.private_review_sessions
  DROP CONSTRAINT IF EXISTS private_review_source_shape;
ALTER TABLE public.private_review_sessions
  ADD CONSTRAINT private_review_source_shape CHECK (
    (source_type = 'project_version' AND project_id IS NOT NULL AND version_prompt_id IS NOT NULL AND source_track_id IS NULL)
    OR
    (source_type = 'track' AND project_id IS NULL AND version_prompt_id IS NULL AND source_track_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS private_review_sessions_source_track_idx
  ON public.private_review_sessions(source_track_id, created_at DESC)
  WHERE source_track_id IS NOT NULL;

UPDATE public.private_review_sessions
SET snapshot = jsonb_set(snapshot, '{sourceType}', '"project_version"'::jsonb, true)
WHERE NOT (snapshot ? 'sourceType');

CREATE OR REPLACE FUNCTION public.create_private_track_review_session(
  _track_id uuid,
  _creator_message text DEFAULT '',
  _comment_visibility text DEFAULT 'shared',
  _expires_at timestamptz DEFAULT now() + interval '7 days',
  _pin text DEFAULT NULL,
  _include_prompt boolean DEFAULT false,
  _include_lyrics boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_track public.tracks%ROWTYPE;
  v_raw_token text;
  v_session public.private_review_sessions%ROWTYPE;
  v_snapshot jsonb;
  v_audio_snapshot jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT public.current_user_can_use_feature('private_review_links') THEN RAISE EXCEPTION 'feature not available'; END IF;

  IF _comment_visibility NOT IN ('shared','private') THEN RAISE EXCEPTION 'invalid comment visibility'; END IF;
  IF COALESCE(char_length(trim(_creator_message)),0) > 1000 THEN RAISE EXCEPTION 'creator message too long'; END IF;
  IF _expires_at <= now() OR _expires_at > now() + interval '7 days' THEN RAISE EXCEPTION 'invalid expiration'; END IF;
  IF _pin IS NOT NULL AND (char_length(_pin) < 4 OR char_length(_pin) > 20) THEN RAISE EXCEPTION 'invalid pin'; END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id = _track_id
    AND user_id = v_actor
    AND source_type = 'upload'
    AND moderation_status = 'active'
    AND audio_url IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'track not found or unavailable'; END IF;

  v_snapshot := jsonb_build_object(
    'sourceType', 'track',
    'projectId', NULL,
    'projectName', '',
    'versionId', NULL,
    'versionNumber', NULL,
    'versionLabel', NULL,
    'trackId', v_track.id,
    'title', COALESCE(v_track.title,''),
    'customName', NULL,
    'theme', '',
    'genre', COALESCE(v_track.genre,''),
    'mood', '',
    'language', '',
    'tags', '',
    'prompt', CASE WHEN COALESCE(_include_prompt,false) THEN COALESCE(v_track.prompt,'') ELSE '' END,
    'lyrics', CASE WHEN COALESCE(_include_lyrics,false) THEN COALESCE(v_track.lyrics,'') ELSE '' END,
    'note', ''
  );

  v_audio_snapshot := jsonb_build_object(
    'trackId', v_track.id,
    'title', v_track.title,
    'durationSeconds', v_track.duration_seconds,
    'coverUrl', COALESCE(v_track.cover_url, v_track.art_url)
  );

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.private_review_sessions(
    owner_id, project_id, version_prompt_id, source_type, source_track_id,
    token_hash, project_name, version_number, version_label, snapshot,
    creator_message, comment_visibility, pin_hash,
    include_audio, shared_track_id, audio_snapshot,
    include_prompt, include_lyrics, expires_at
  ) VALUES (
    v_actor, NULL, NULL, 'track', v_track.id,
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    v_track.title, NULL, NULL, v_snapshot,
    COALESCE(trim(_creator_message),''), _comment_visibility,
    CASE WHEN _pin IS NULL THEN NULL ELSE extensions.crypt(_pin, extensions.gen_salt('bf',10)) END,
    true, v_track.id, v_audio_snapshot,
    COALESCE(_include_prompt,false), COALESCE(_include_lyrics,false), _expires_at
  ) RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'token', v_raw_token,
    'source_type', v_session.source_type,
    'source_track_id', v_session.source_track_id,
    'comment_visibility', v_session.comment_visibility,
    'include_audio', v_session.include_audio,
    'include_prompt', v_session.include_prompt,
    'include_lyrics', v_session.include_lyrics,
    'created_at', v_session.created_at,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.private_review_link_info(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_state text;
BEGIN
  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF NOT FOUND THEN RETURN jsonb_build_object('state','unavailable'); END IF;

  v_state := CASE
    WHEN v_session.closed_at IS NOT NULL THEN 'closed'
    WHEN v_session.expires_at <= now() THEN 'expired'
    ELSE 'active'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'requires_pin', v_session.pin_hash IS NOT NULL,
    'project_name', v_session.project_name,
    'source_type', v_session.source_type,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_private_review_session(
  _token text,
  _reviewer_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_reviewer public.private_review_reviewers%ROWTYPE;
  v_state text;
  v_comments jsonb;
  v_audio jsonb := NULL;
  v_track public.tracks%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF NOT FOUND THEN RETURN jsonb_build_object('state','unavailable'); END IF;

  SELECT * INTO v_reviewer FROM public.private_review_reviewers
  WHERE session_id = v_session.id
    AND access_key_hash = encode(extensions.digest(_reviewer_key, 'sha256'), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'reviewer session unavailable'; END IF;

  UPDATE public.private_review_reviewers SET last_seen_at = now() WHERE id = v_reviewer.id;

  v_state := CASE
    WHEN v_session.closed_at IS NOT NULL THEN 'closed'
    WHEN v_session.expires_at <= now() THEN 'expired'
    ELSE 'active'
  END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'threadReviewerId', c.thread_reviewer_id,
    'authorType', c.author_type,
    'authorReviewerId', c.author_reviewer_id,
    'authorName', CASE WHEN c.author_type='creator' THEN 'Creator' ELSE ar.display_name END,
    'parentCommentId', c.parent_comment_id,
    'body', c.body,
    'createdAt', c.created_at
  ) ORDER BY c.created_at, c.id), '[]'::jsonb)
  INTO v_comments
  FROM public.private_review_comments c
  LEFT JOIN public.private_review_reviewers ar ON ar.id = c.author_reviewer_id
  WHERE c.session_id = v_session.id
    AND (v_session.comment_visibility = 'shared' OR c.thread_reviewer_id = v_reviewer.id);

  IF v_session.include_audio AND v_session.shared_track_id IS NOT NULL THEN
    SELECT * INTO v_track FROM public.tracks
    WHERE id = v_session.shared_track_id
      AND user_id = v_session.owner_id
      AND source_type = 'upload'
      AND moderation_status = 'active'
      AND audio_url IS NOT NULL;
    IF FOUND THEN
      v_audio := jsonb_build_object(
        'trackId', v_track.id,
        'title', v_track.title,
        'durationSeconds', v_track.duration_seconds,
        'coverUrl', COALESCE(v_track.cover_url, v_track.art_url),
        'audioUrl', v_track.audio_url
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'state', v_state,
    'sessionId', v_session.id,
    'sourceType', v_session.source_type,
    'sourceTrackId', v_session.source_track_id,
    'snapshot', v_session.snapshot,
    'creatorMessage', v_session.creator_message,
    'commentVisibility', v_session.comment_visibility,
    'includePrompt', v_session.include_prompt,
    'includeLyrics', v_session.include_lyrics,
    'expiresAt', v_session.expires_at,
    'reviewer', jsonb_build_object('id',v_reviewer.id,'displayName',v_reviewer.display_name),
    'audio', v_audio,
    'comments', v_comments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_private_review_sessions(_project_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'sourceType', s.source_type,
    'sourceTrackId', s.source_track_id,
    'projectId', s.project_id,
    'versionPromptId', s.version_prompt_id,
    'projectName', s.project_name,
    'versionNumber', s.version_number,
    'versionLabel', s.version_label,
    'creatorMessage', s.creator_message,
    'commentVisibility', s.comment_visibility,
    'includeAudio', s.include_audio,
    'includePrompt', s.include_prompt,
    'includeLyrics', s.include_lyrics,
    'audioSnapshot', s.audio_snapshot,
    'createdAt', s.created_at,
    'expiresAt', s.expires_at,
    'closedAt', s.closed_at,
    'state', CASE WHEN s.closed_at IS NOT NULL THEN 'closed' WHEN s.expires_at <= now() THEN 'expired' ELSE 'active' END,
    'reviewerCount', (SELECT count(*) FROM public.private_review_reviewers r WHERE r.session_id=s.id),
    'commentCount', (SELECT count(*) FROM public.private_review_comments c WHERE c.session_id=s.id)
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public.private_review_sessions s
  WHERE s.owner_id = auth.uid()
    AND (_project_id IS NULL OR s.project_id = _project_id)
    AND NOT public.current_user_is_banned();
$$;

CREATE OR REPLACE FUNCTION public.get_my_private_review_session(
  _session_id uuid,
  _reviewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_reviewers jsonb;
  v_comments jsonb;
BEGIN
  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE id = _session_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'review session not found'; END IF;

  IF _reviewer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.private_review_reviewers r WHERE r.id=_reviewer_id AND r.session_id=v_session.id
  ) THEN RAISE EXCEPTION 'reviewer not found'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'displayName', r.display_name,
    'createdAt', r.created_at,
    'lastSeenAt', r.last_seen_at,
    'commentCount', (SELECT count(*) FROM public.private_review_comments c WHERE c.session_id=v_session.id AND c.thread_reviewer_id=r.id)
  ) ORDER BY r.created_at, r.id), '[]'::jsonb)
  INTO v_reviewers
  FROM public.private_review_reviewers r WHERE r.session_id=v_session.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'threadReviewerId', c.thread_reviewer_id,
    'threadReviewerName', tr.display_name,
    'authorType', c.author_type,
    'authorReviewerId', c.author_reviewer_id,
    'authorName', CASE WHEN c.author_type='creator' THEN 'Creator' ELSE ar.display_name END,
    'parentCommentId', c.parent_comment_id,
    'body', c.body,
    'createdAt', c.created_at
  ) ORDER BY c.created_at, c.id), '[]'::jsonb)
  INTO v_comments
  FROM public.private_review_comments c
  JOIN public.private_review_reviewers tr ON tr.id=c.thread_reviewer_id
  LEFT JOIN public.private_review_reviewers ar ON ar.id=c.author_reviewer_id
  WHERE c.session_id=v_session.id
    AND (_reviewer_id IS NULL OR c.thread_reviewer_id=_reviewer_id);

  RETURN jsonb_build_object(
    'id', v_session.id,
    'sourceType', v_session.source_type,
    'sourceTrackId', v_session.source_track_id,
    'projectId', v_session.project_id,
    'versionPromptId', v_session.version_prompt_id,
    'projectName', v_session.project_name,
    'versionNumber', v_session.version_number,
    'versionLabel', v_session.version_label,
    'snapshot', v_session.snapshot,
    'creatorMessage', v_session.creator_message,
    'commentVisibility', v_session.comment_visibility,
    'includeAudio', v_session.include_audio,
    'includePrompt', v_session.include_prompt,
    'includeLyrics', v_session.include_lyrics,
    'audioSnapshot', v_session.audio_snapshot,
    'createdAt', v_session.created_at,
    'expiresAt', v_session.expires_at,
    'closedAt', v_session.closed_at,
    'state', CASE WHEN v_session.closed_at IS NOT NULL THEN 'closed' WHEN v_session.expires_at <= now() THEN 'expired' ELSE 'active' END,
    'reviewers', v_reviewers,
    'comments', v_comments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_private_track_review_session(uuid,text,text,timestamptz,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_private_track_review_session(uuid,text,text,timestamptz,text,boolean,boolean) TO authenticated, service_role;

COMMIT;
