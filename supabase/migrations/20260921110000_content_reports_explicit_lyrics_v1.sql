-- PromptBeats Reports System + Explicit Lyrics V1
BEGIN;

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS contains_explicit_lyrics boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('track')),
  target_id uuid NOT NULL,
  target_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_title text NOT NULL CHECK (char_length(target_title) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN (
    'copyright_ip',
    'hate_discrimination',
    'harassment_threats',
    'sexual_inappropriate',
    'impersonation',
    'privacy_personal_info',
    'illegal_content',
    'spam_platform_abuse',
    'other'
  )),
  details text,
  supporting_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'under_review',
    'resolved_action_taken',
    'resolved_no_violation',
    'dismissed_abuse'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  moderator_notes text,
  CHECK (char_length(COALESCE(details,'')) <= 2000),
  CHECK (char_length(COALESCE(supporting_url,'')) <= 1000),
  CHECK (char_length(COALESCE(resolution,'')) <= 1000),
  CHECK (char_length(COALESCE(moderator_notes,'')) <= 2000),
  CHECK (category <> 'other' OR char_length(trim(COALESCE(details,''))) >= 5)
);

CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON public.content_reports(target_type,target_id,created_at DESC);

CREATE INDEX IF NOT EXISTS content_reports_status_idx
  ON public.content_reports(status,created_at DESC);

CREATE INDEX IF NOT EXISTS content_reports_reporter_recent_idx
  ON public.content_reports(reporter_user_id,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS content_reports_active_duplicate_idx
  ON public.content_reports(reporter_user_id,target_type,target_id,category)
  WHERE status IN ('open','under_review');

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_reports TO service_role;

CREATE OR REPLACE FUNCTION public.submit_track_report(
  _track_id uuid,
  _category text,
  _details text DEFAULT NULL,
  _supporting_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_owner uuid;
  v_title text;
  v_report_id uuid;
  v_recent_count integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_actor);
  IF NOT public.has_valid_account_state(v_actor) THEN RAISE EXCEPTION 'account is not available'; END IF;

  IF _category NOT IN (
    'copyright_ip','hate_discrimination','harassment_threats','sexual_inappropriate',
    'impersonation','privacy_personal_info','illegal_content','spam_platform_abuse','other'
  ) THEN RAISE EXCEPTION 'invalid report category'; END IF;

  IF _category='other' AND char_length(trim(COALESCE(_details,''))) < 5 THEN
    RAISE EXCEPTION 'details required';
  END IF;

  IF char_length(COALESCE(_details,'')) > 2000 OR char_length(COALESCE(_supporting_url,'')) > 1000 THEN
    RAISE EXCEPTION 'report content too long';
  END IF;
  IF NULLIF(trim(COALESCE(_supporting_url,'')),'') IS NOT NULL
     AND trim(_supporting_url) !~* '^https?://'
  THEN
    RAISE EXCEPTION 'invalid supporting url';
  END IF;

  SELECT user_id,title INTO v_owner,v_title
  FROM public.tracks
  WHERE id=_track_id
    AND is_published=true
    AND moderation_status='active';

  IF NOT FOUND THEN RAISE EXCEPTION 'track not available'; END IF;
  IF v_owner=v_actor THEN RAISE EXCEPTION 'cannot report own track'; END IF;

  SELECT count(*)::integer INTO v_recent_count
  FROM public.content_reports
  WHERE reporter_user_id=v_actor AND created_at > now()-interval '1 hour';

  IF v_recent_count >= 10 THEN RAISE EXCEPTION 'report rate limit exceeded'; END IF;

  BEGIN
    INSERT INTO public.content_reports(
      reporter_user_id,target_type,target_id,target_owner_id,target_title,category,details,supporting_url
    )
    VALUES(
      v_actor,'track',_track_id,v_owner,v_title,_category,
      NULLIF(trim(COALESCE(_details,'')),''),
      NULLIF(trim(COALESCE(_supporting_url,'')),'')
    )
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate active report';
  END;

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_content_reports(
  _scope text DEFAULT 'open'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _scope NOT IN ('open','under_review','resolved','all') THEN
    RAISE EXCEPTION 'invalid report scope';
  END IF;

  v_admin_level:=public.current_user_is_admin_level();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id',r.id,
      'target_type',r.target_type,
      'target_id',r.target_id,
      'target_owner_id',r.target_owner_id,
      'category',r.category,
      'details',r.details,
      'supporting_url',r.supporting_url,
      'status',r.status,
      'created_at',r.created_at,
      'reviewed_at',r.reviewed_at,
      'reviewed_by',r.reviewed_by,
      'resolution',r.resolution,
      'moderator_notes',r.moderator_notes,
      'track_title',COALESCE(t.title,r.target_title),
      'track_is_published',COALESCE(t.is_published,false),
      'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
      'creator_handle',owner_profile.handle,
      'creator_display_name',owner_profile.display_name,
      'creator_artist_alias',owner_profile.artist_alias,
      'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
      'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
      'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
      'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END
    )) AS row_data
    FROM public.content_reports r
    LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
    LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
    LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
    WHERE
      _scope='all'
      OR (_scope='open' AND r.status='open')
      OR (_scope='under_review' AND r.status='under_review')
      OR (_scope='resolved' AND r.status IN ('resolved_action_taken','resolved_no_violation','dismissed_abuse'))
  ) q;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_content_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_admin_level:=public.current_user_is_admin_level();

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id',r.id,
    'target_type',r.target_type,
    'target_id',r.target_id,
    'target_owner_id',r.target_owner_id,
    'category',r.category,
    'details',r.details,
    'supporting_url',r.supporting_url,
    'status',r.status,
    'created_at',r.created_at,
    'reviewed_at',r.reviewed_at,
    'reviewed_by',r.reviewed_by,
    'resolution',r.resolution,
    'moderator_notes',r.moderator_notes,
    'track_title',COALESCE(t.title,r.target_title),
    'track_is_published',COALESCE(t.is_published,false),
    'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
    'creator_handle',owner_profile.handle,
    'creator_display_name',owner_profile.display_name,
    'creator_artist_alias',owner_profile.artist_alias,
    'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
    'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
    'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
    'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END
  ))
  INTO v_result
  FROM public.content_reports r
  LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
  LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
  LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
  WHERE r.id=_report_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_content_report(
  _report_id uuid,
  _status text,
  _resolution text DEFAULT NULL,
  _moderator_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_old_status text;
  v_target_owner uuid;
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_moderation_capability('can_view_users') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _status NOT IN ('open','under_review','resolved_action_taken','resolved_no_violation','dismissed_abuse') THEN
    RAISE EXCEPTION 'invalid report status';
  END IF;
  IF char_length(COALESCE(_resolution,'')) > 1000 OR char_length(COALESCE(_moderator_notes,'')) > 2000 THEN
    RAISE EXCEPTION 'review content too long';
  END IF;

  SELECT status,target_owner_id,target_id
  INTO v_old_status,v_target_owner,v_target_id
  FROM public.content_reports
  WHERE id=_report_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;

  UPDATE public.content_reports
  SET
    status=_status,
    reviewed_at=now(),
    reviewed_by=v_actor,
    resolution=NULLIF(trim(COALESCE(_resolution,'')),''),
    moderator_notes=NULLIF(trim(COALESCE(_moderator_notes,'')),'')
  WHERE id=_report_id;

  INSERT INTO public.admin_audit_log(admin_user_id,target_user_id,action,details)
  VALUES(
    v_actor,
    v_target_owner,
    'REVIEW_CONTENT_REPORT',
    jsonb_build_object(
      'report_id',_report_id,
      'target_type','track',
      'target_id',v_target_id,
      'previous_status',v_old_status,
      'new_status',_status,
      'resolution',NULLIF(trim(COALESCE(_resolution,'')),'')
    )
  );
END;
$$;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'BLOCK_USER','UNBLOCK_USER','DELETE_USER','UPDATE_MODEL_ACCESS',
  'BLOCK_REGISTRATION','UNBLOCK_REGISTRATION','ASSIGN_MODERATOR_ROLE',
  'ASSIGN_SENIOR_MODERATOR_ROLE','REMOVE_MODERATOR_ROLE','CHANGE_MODERATOR_ROLE',
  'SUSPEND_MODERATOR','REACTIVATE_MODERATOR','LOCK_TRACK','UNLOCK_TRACK','DELETE_TRACK',
  'UPDATE_AI_MODEL','UPDATE_AI_MODEL_DEFAULT','ADD_AI_MODEL',
  'UPDATE_DONATION_GLOBAL','UPDATE_DONATION_ACCESS',
  'ASSIGN_ADMIN_ROLE','REMOVE_ADMIN_ROLE','ASSIGN_SUPER_ADMIN_ROLE','REMOVE_SUPER_ADMIN_ROLE',
  'UPDATE_FEATURE_ACCESS_POLICY','ADD_FEATURE_ACCESS_USER','REMOVE_FEATURE_ACCESS_USER',
  'REVIEW_CONTENT_REPORT'
));

REVOKE ALL ON FUNCTION public.submit_track_report(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_content_reports(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_content_report(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_content_report(uuid,text,text,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.submit_track_report(uuid,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_content_reports(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_content_report(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_content_report(uuid,text,text,text) TO authenticated,service_role;


DROP FUNCTION IF EXISTS public.list_trending_tracks();
CREATE FUNCTION public.list_trending_tracks()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  title text,
  genre text,
  prompt text,
  lyrics text,
  audio_url text,
  audio_type text,
  source_type text,
  source_url text,
  source_id text,
  created_with text,
  allow_download boolean,
  contains_explicit_lyrics boolean,
  art_url text,
  cover_url text,
  duration_seconds integer,
  plays integer,
  is_published boolean,
  created_at timestamptz,
  likes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT
      t.id,t.user_id,t.title,t.genre,
      CASE WHEN t.prompt_is_public THEN t.prompt ELSE '' END AS prompt,
      CASE WHEN t.lyrics_is_public THEN t.lyrics ELSE '' END AS lyrics,
      t.audio_url,t.audio_type,t.source_type,t.source_url,t.source_id,
      t.created_with,t.allow_download,t.contains_explicit_lyrics,t.art_url,t.cover_url,
      t.duration_seconds,t.plays,t.is_published,t.created_at
    FROM public.tracks t
    WHERE t.is_published=true AND t.moderation_status='active'
    ORDER BY t.created_at DESC,t.id ASC
    LIMIT 100
  )
  SELECT
    c.id,c.user_id,c.title,c.genre,c.prompt,c.lyrics,
    c.audio_url,c.audio_type,c.source_type,c.source_url,c.source_id,
    c.created_with,c.allow_download,c.contains_explicit_lyrics,c.art_url,c.cover_url,
    c.duration_seconds,c.plays,c.is_published,c.created_at,counts.likes
  FROM candidates c
  CROSS JOIN LATERAL (
    SELECT count(*) AS likes FROM public.likes l WHERE l.track_id=c.id
  ) counts
  ORDER BY (counts.likes*3+c.plays) DESC,c.created_at DESC,c.id ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.list_trending_tracks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_trending_tracks() TO service_role;

CREATE OR REPLACE FUNCTION public.get_track_share_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.track_share_links%ROWTYPE;
  v_track public.tracks%ROWTYPE;
  v_artist jsonb;
BEGIN
  SELECT * INTO v_link
  FROM public.track_share_links
  WHERE token=_token AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;

  SELECT * INTO v_track
  FROM public.tracks
  WHERE id=v_link.track_id;

  IF NOT FOUND OR v_track.moderation_status<>'active' THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;

  IF v_track.is_published IS NOT TRUE THEN
    RETURN jsonb_build_object('state','private','track_id',v_track.id,'title',v_track.title);
  END IF;

  UPDATE public.track_share_links
  SET open_count=open_count+1,last_opened_at=now()
  WHERE id=v_link.id;

  SELECT jsonb_build_object(
    'id',p.id,
    'handle',p.handle,
    'display_name',p.display_name,
    'artist_alias',p.artist_alias,
    'avatar_url',p.avatar_url,
    'staff_badge',p.staff_badge
  )
  INTO v_artist
  FROM public.public_profiles p
  WHERE p.id=v_track.user_id;

  RETURN jsonb_build_object(
    'state','active',
    'share_id',v_link.id,
    'track',jsonb_build_object(
      'id',v_track.id,
      'user_id',v_track.user_id,
      'title',v_track.title,
      'genre',v_track.genre,
      'prompt',CASE WHEN v_track.prompt_is_public AND v_link.include_prompt THEN v_track.prompt ELSE '' END,
      'lyrics',CASE WHEN v_track.lyrics_is_public AND v_link.include_lyrics THEN v_track.lyrics ELSE '' END,
      'prompt_is_public',v_track.prompt_is_public,
      'lyrics_is_public',v_track.lyrics_is_public,
      'contains_explicit_lyrics',v_track.contains_explicit_lyrics,
      'audio_url',v_track.audio_url,
      'audio_type',v_track.audio_type,
      'source_type',v_track.source_type,
      'source_url',v_track.source_url,
      'source_id',v_track.source_id,
      'created_with',v_track.created_with,
      'allow_download',v_track.allow_download,
      'art_url',v_track.art_url,
      'cover_url',v_track.cover_url,
      'duration_seconds',v_track.duration_seconds,
      'plays',v_track.plays,
      'is_published',v_track.is_published,
      'created_at',v_track.created_at
    ),
    'artist',v_artist
  );
END;
$$;

COMMIT;
