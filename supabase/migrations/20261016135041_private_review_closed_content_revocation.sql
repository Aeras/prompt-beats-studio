-- Revoke private review content immediately when a review is closed or expired.
-- The reviewer token/key may still identify the terminal state, but no snapshot,
-- comments or audio metadata are returned once the review is no longer active.

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

  v_state := CASE
    WHEN v_session.closed_at IS NOT NULL THEN 'closed'
    WHEN v_session.expires_at <= now() THEN 'expired'
    ELSE 'active'
  END;

  IF v_state <> 'active' THEN
    RETURN jsonb_build_object(
      'state', v_state,
      'expiresAt', v_session.expires_at
    );
  END IF;

  UPDATE public.private_review_reviewers
  SET last_seen_at = now()
  WHERE id = v_reviewer.id;

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

REVOKE ALL ON FUNCTION public.get_private_review_session(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_review_session(text, text) TO service_role;
