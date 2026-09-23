BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES (
  'private_review_links',
  'Private Review Links',
  'Temporary private Project/Version review sessions with optional audio and reviewer comments.',
  'admins_only'
)
ON CONFLICT(feature_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.private_review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.prompt_projects(id) ON DELETE CASCADE,
  version_prompt_id uuid REFERENCES public.saved_prompts(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  project_name text NOT NULL,
  version_number integer,
  version_label text,
  snapshot jsonb NOT NULL,
  creator_message text NOT NULL DEFAULT '' CHECK (char_length(creator_message) <= 1000),
  comment_visibility text NOT NULL CHECK (comment_visibility IN ('shared','private')),
  pin_hash text,
  include_audio boolean NOT NULL DEFAULT false,
  shared_track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL,
  audio_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  last_opened_at timestamptz,
  CONSTRAINT private_review_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '7 days'
  ),
  CONSTRAINT private_review_audio_selection CHECK (
    (include_audio = false AND shared_track_id IS NULL)
    OR (include_audio = true AND shared_track_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS private_review_sessions_owner_created_idx
  ON public.private_review_sessions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS private_review_sessions_project_idx
  ON public.private_review_sessions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS private_review_sessions_version_idx
  ON public.private_review_sessions(version_prompt_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.private_review_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.private_review_sessions(id) ON DELETE CASCADE,
  access_key_hash text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_review_reviewer_key_unique UNIQUE(session_id, access_key_hash)
);

CREATE INDEX IF NOT EXISTS private_review_reviewers_session_idx
  ON public.private_review_reviewers(session_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.private_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.private_review_sessions(id) ON DELETE CASCADE,
  thread_reviewer_id uuid NOT NULL REFERENCES public.private_review_reviewers(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('reviewer','creator')),
  author_reviewer_id uuid REFERENCES public.private_review_reviewers(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.private_review_comments(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_review_comment_author_shape CHECK (
    (author_type = 'reviewer' AND author_reviewer_id IS NOT NULL)
    OR (author_type = 'creator' AND author_reviewer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS private_review_comments_session_created_idx
  ON public.private_review_comments(session_id, created_at, id);
CREATE INDEX IF NOT EXISTS private_review_comments_thread_idx
  ON public.private_review_comments(session_id, thread_reviewer_id, created_at, id);

ALTER TABLE public.private_review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_review_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_review_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.private_review_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.private_review_reviewers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.private_review_comments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.private_review_sessions TO service_role;
GRANT ALL ON public.private_review_reviewers TO service_role;
GRANT ALL ON public.private_review_comments TO service_role;

CREATE POLICY "Owners can read private review sessions"
ON public.private_review_sessions FOR SELECT TO authenticated
USING (owner_id = (select auth.uid()) AND NOT public.current_user_is_banned());

CREATE POLICY "Owners can read private review reviewers"
ON public.private_review_reviewers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.private_review_sessions s
    WHERE s.id = session_id AND s.owner_id = (select auth.uid())
  )
  AND NOT public.current_user_is_banned()
);

CREATE POLICY "Owners can read private review comments"
ON public.private_review_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.private_review_sessions s
    WHERE s.id = session_id AND s.owner_id = (select auth.uid())
  )
  AND NOT public.current_user_is_banned()
);

CREATE OR REPLACE FUNCTION public.create_private_review_session(
  _project_id uuid,
  _version_prompt_id uuid,
  _creator_message text DEFAULT '',
  _comment_visibility text DEFAULT 'shared',
  _expires_at timestamptz DEFAULT now() + interval '7 days',
  _pin text DEFAULT NULL,
  _shared_track_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.prompt_projects%ROWTYPE;
  v_version public.saved_prompts%ROWTYPE;
  v_track public.tracks%ROWTYPE;
  v_raw_token text;
  v_session public.private_review_sessions%ROWTYPE;
  v_snapshot jsonb;
  v_audio_snapshot jsonb := NULL;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT public.current_user_can_use_feature('private_review_links') THEN RAISE EXCEPTION 'feature not available'; END IF;

  IF _comment_visibility NOT IN ('shared','private') THEN RAISE EXCEPTION 'invalid comment visibility'; END IF;
  IF COALESCE(char_length(trim(_creator_message)),0) > 1000 THEN RAISE EXCEPTION 'creator message too long'; END IF;
  IF _expires_at <= now() OR _expires_at > now() + interval '7 days' THEN RAISE EXCEPTION 'invalid expiration'; END IF;
  IF _pin IS NOT NULL AND (char_length(_pin) < 4 OR char_length(_pin) > 20) THEN RAISE EXCEPTION 'invalid pin'; END IF;

  SELECT * INTO v_project FROM public.prompt_projects
  WHERE id = _project_id AND user_id = v_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  SELECT * INTO v_version FROM public.saved_prompts
  WHERE id = _version_prompt_id AND project_id = _project_id AND user_id = v_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'project version not found'; END IF;

  v_snapshot := jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    'versionId', v_version.id,
    'versionNumber', v_version.version_number,
    'versionLabel', v_version.version_label,
    'title', COALESCE(v_version.title,''),
    'customName', v_version.custom_name,
    'theme', COALESCE(v_version.theme,''),
    'genre', COALESCE(v_version.genre,''),
    'mood', COALESCE(v_version.mood,''),
    'language', COALESCE(v_version.language,''),
    'tags', COALESCE(v_version.tags,''),
    'lyrics', COALESCE(v_version.lyrics,''),
    'note', COALESCE(v_version.note,'')
  );

  IF _shared_track_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_version_tracks pvt
      WHERE pvt.user_id = v_actor
        AND pvt.project_id = _project_id
        AND pvt.version_prompt_id = _version_prompt_id
        AND pvt.track_id = _shared_track_id
    ) THEN
      RAISE EXCEPTION 'selected audio is not linked to this version';
    END IF;

    SELECT * INTO v_track FROM public.tracks
    WHERE id = _shared_track_id
      AND user_id = v_actor
      AND source_type = 'upload'
      AND moderation_status = 'active'
      AND audio_url IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'selected audio is unavailable'; END IF;

    v_audio_snapshot := jsonb_build_object(
      'trackId', v_track.id,
      'title', v_track.title,
      'durationSeconds', v_track.duration_seconds,
      'coverUrl', COALESCE(v_track.cover_url, v_track.art_url)
    );
  END IF;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.private_review_sessions(
    owner_id, project_id, version_prompt_id, token_hash,
    project_name, version_number, version_label, snapshot,
    creator_message, comment_visibility, pin_hash,
    include_audio, shared_track_id, audio_snapshot, expires_at
  ) VALUES (
    v_actor, _project_id, _version_prompt_id,
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    v_project.name, v_version.version_number, v_version.version_label, v_snapshot,
    COALESCE(trim(_creator_message),''), _comment_visibility,
    CASE WHEN _pin IS NULL THEN NULL ELSE extensions.crypt(_pin, extensions.gen_salt('bf',10)) END,
    _shared_track_id IS NOT NULL, _shared_track_id, v_audio_snapshot, _expires_at
  ) RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'token', v_raw_token,
    'project_id', v_session.project_id,
    'version_prompt_id', v_session.version_prompt_id,
    'comment_visibility', v_session.comment_visibility,
    'include_audio', v_session.include_audio,
    'shared_track_id', v_session.shared_track_id,
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
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.join_private_review_session(
  _token text,
  _display_name text,
  _pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_reviewer public.private_review_reviewers%ROWTYPE;
  v_raw_key text;
BEGIN
  IF char_length(trim(COALESCE(_display_name,''))) < 1 OR char_length(trim(_display_name)) > 80 THEN
    RAISE EXCEPTION 'invalid display name';
  END IF;

  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'review link unavailable'; END IF;
  IF v_session.closed_at IS NOT NULL OR v_session.expires_at <= now() THEN RAISE EXCEPTION 'review link closed'; END IF;

  IF v_session.pin_hash IS NOT NULL AND (_pin IS NULL OR extensions.crypt(_pin, v_session.pin_hash) <> v_session.pin_hash) THEN
    RAISE EXCEPTION 'invalid pin';
  END IF;

  v_raw_key := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.private_review_reviewers(session_id, access_key_hash, display_name)
  VALUES (
    v_session.id,
    encode(extensions.digest(v_raw_key, 'sha256'), 'hex'),
    trim(_display_name)
  ) RETURNING * INTO v_reviewer;

  UPDATE public.private_review_sessions
  SET open_count = open_count + 1, last_opened_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'reviewer_id', v_reviewer.id,
    'reviewer_key', v_raw_key,
    'display_name', v_reviewer.display_name
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
    'snapshot', v_session.snapshot,
    'creatorMessage', v_session.creator_message,
    'commentVisibility', v_session.comment_visibility,
    'expiresAt', v_session.expires_at,
    'reviewer', jsonb_build_object('id',v_reviewer.id,'displayName',v_reviewer.display_name),
    'audio', v_audio,
    'comments', v_comments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_private_review_comment(
  _token text,
  _reviewer_key text,
  _body text,
  _parent_comment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_reviewer public.private_review_reviewers%ROWTYPE;
  v_parent public.private_review_comments%ROWTYPE;
  v_thread_reviewer_id uuid;
  v_comment public.private_review_comments%ROWTYPE;
  v_recent integer;
BEGIN
  IF char_length(trim(COALESCE(_body,''))) < 1 OR char_length(trim(_body)) > 2000 THEN RAISE EXCEPTION 'invalid comment'; END IF;

  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_session.closed_at IS NOT NULL OR v_session.expires_at <= now() THEN RAISE EXCEPTION 'review link closed'; END IF;

  SELECT * INTO v_reviewer FROM public.private_review_reviewers
  WHERE session_id = v_session.id
    AND access_key_hash = encode(extensions.digest(_reviewer_key, 'sha256'), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'reviewer session unavailable'; END IF;

  SELECT count(*)::integer INTO v_recent FROM public.private_review_comments
  WHERE session_id = v_session.id
    AND author_reviewer_id = v_reviewer.id
    AND created_at > now() - interval '1 minute';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'too many comments'; END IF;

  IF _parent_comment_id IS NULL THEN
    v_thread_reviewer_id := v_reviewer.id;
  ELSE
    SELECT * INTO v_parent FROM public.private_review_comments
    WHERE id = _parent_comment_id AND session_id = v_session.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found'; END IF;
    IF v_session.comment_visibility = 'private' AND v_parent.thread_reviewer_id <> v_reviewer.id THEN
      RAISE EXCEPTION 'comment thread unavailable';
    END IF;
    v_thread_reviewer_id := v_parent.thread_reviewer_id;
  END IF;

  INSERT INTO public.private_review_comments(
    session_id, thread_reviewer_id, author_type, author_reviewer_id, parent_comment_id, body
  ) VALUES (
    v_session.id, v_thread_reviewer_id, 'reviewer', v_reviewer.id, _parent_comment_id, trim(_body)
  ) RETURNING * INTO v_comment;

  RETURN jsonb_build_object('id',v_comment.id,'created_at',v_comment.created_at);
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
    'projectId', s.project_id,
    'versionPromptId', s.version_prompt_id,
    'projectName', s.project_name,
    'versionNumber', s.version_number,
    'versionLabel', s.version_label,
    'creatorMessage', s.creator_message,
    'commentVisibility', s.comment_visibility,
    'includeAudio', s.include_audio,
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
    'projectId', v_session.project_id,
    'versionPromptId', v_session.version_prompt_id,
    'projectName', v_session.project_name,
    'versionNumber', v_session.version_number,
    'versionLabel', v_session.version_label,
    'snapshot', v_session.snapshot,
    'creatorMessage', v_session.creator_message,
    'commentVisibility', v_session.comment_visibility,
    'includeAudio', v_session.include_audio,
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

CREATE OR REPLACE FUNCTION public.close_private_review_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.private_review_sessions
  SET closed_at = COALESCE(closed_at, now())
  WHERE id = _session_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'review session not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_private_review_creator_reply(
  _session_id uuid,
  _parent_comment_id uuid,
  _body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session public.private_review_sessions%ROWTYPE;
  v_parent public.private_review_comments%ROWTYPE;
  v_comment public.private_review_comments%ROWTYPE;
BEGIN
  IF char_length(trim(COALESCE(_body,''))) < 1 OR char_length(trim(_body)) > 2000 THEN RAISE EXCEPTION 'invalid comment'; END IF;
  SELECT * INTO v_session FROM public.private_review_sessions
  WHERE id=_session_id AND owner_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'review session not found'; END IF;
  IF v_session.closed_at IS NOT NULL OR v_session.expires_at <= now() THEN RAISE EXCEPTION 'review link closed'; END IF;

  SELECT * INTO v_parent FROM public.private_review_comments
  WHERE id=_parent_comment_id AND session_id=v_session.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found'; END IF;

  INSERT INTO public.private_review_comments(
    session_id, thread_reviewer_id, author_type, author_reviewer_id, parent_comment_id, body
  ) VALUES (
    v_session.id, v_parent.thread_reviewer_id, 'creator', NULL, v_parent.id, trim(_body)
  ) RETURNING * INTO v_comment;

  RETURN jsonb_build_object('id',v_comment.id,'created_at',v_comment.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.create_private_review_session(uuid,uuid,text,text,timestamptz,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.private_review_link_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_private_review_session(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_private_review_session(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_private_review_comment(text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_private_review_sessions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_private_review_session(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_private_review_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_private_review_creator_reply(uuid,uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_private_review_session(uuid,uuid,text,text,timestamptz,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.private_review_link_info(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_private_review_session(text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_private_review_session(text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_private_review_comment(text,text,text,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_private_review_sessions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_private_review_session(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_private_review_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_private_review_creator_reply(uuid,uuid,text) TO authenticated, service_role;

COMMIT;
