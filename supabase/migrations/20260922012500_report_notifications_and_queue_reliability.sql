-- Report queue reliability + moderation notifications
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_track', 'new_follower', 'new_report'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_track_shape;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_track_shape CHECK (
    (type = 'new_track' AND report_id IS NULL)
    OR (type = 'new_follower' AND track_id IS NULL AND report_id IS NULL)
    OR (type = 'new_report' AND report_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS notifications_report_idx
  ON public.notifications(report_id)
  WHERE report_id IS NOT NULL;

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

  INSERT INTO public.notifications(
    recipient_user_id,
    actor_user_id,
    type,
    track_id,
    report_id,
    event_key
  )
  SELECT DISTINCT
    ur.user_id,
    NULL,
    'new_report',
    _track_id,
    v_report_id,
    'new_report:' || v_report_id::text || ':' || ur.user_id::text
  FROM public.user_roles ur
  WHERE ur.moderation_status::text='active'
    AND public.app_role_rank(ur.role::text) >= 2
  ON CONFLICT (event_key) DO NOTHING;

  RETURN v_report_id;
END;
$$;


-- Backfill currently actionable reports so the moderation bell reflects the
-- queue immediately after this migration, without duplicating future events.
INSERT INTO public.notifications(
  recipient_user_id,
  actor_user_id,
  type,
  track_id,
  report_id,
  event_key,
  created_at
)
SELECT DISTINCT
  ur.user_id,
  NULL,
  'new_report',
  r.target_id,
  r.id,
  'new_report:' || r.id::text || ':' || ur.user_id::text,
  r.created_at
FROM public.content_reports r
JOIN public.user_roles ur
  ON ur.moderation_status::text='active'
 AND public.app_role_rank(ur.role::text) >= 2
WHERE r.status IN ('open','under_review')
  AND public.can_use_feature(ur.user_id,'notifications')
ON CONFLICT (event_key) DO NOTHING;

-- Report notifications are operational moderation events. Active moderation
-- staff may read/mark them even when the end-user Notifications feature is
-- disabled, while ordinary notification rows remain Feature Access-gated.
DROP POLICY IF EXISTS "Recipients can read own notifications" ON public.notifications;
CREATE POLICY "Recipients can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR (
        type = 'new_report'
        AND public.has_moderation_capability('can_view_users')
      )
    )
  );

DROP POLICY IF EXISTS "Recipients can mark own notifications read" ON public.notifications;
CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR (
        type = 'new_report'
        AND public.has_moderation_capability('can_view_users')
      )
    )
  )
  WITH CHECK (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR (
        type = 'new_report'
        AND public.has_moderation_capability('can_view_users')
      )
    )
  );

-- Service-role report projections use the already authenticated server actor ID.
-- This avoids making the management queue depend on forwarding a browser JWT
-- through another PostgREST RPC hop.
CREATE OR REPLACE FUNCTION public.list_content_reports_for_actor(
  _actor uuid,
  _scope text DEFAULT 'open'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $
DECLARE
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF _actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id=_actor
      AND ur.moderation_status::text='active'
      AND public.app_role_rank(ur.role::text)>=2
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _scope NOT IN ('open','under_review','resolved','all') THEN
    RAISE EXCEPTION 'invalid report scope';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id=_actor
      AND ur.moderation_status::text='active'
      AND public.app_role_rank(ur.role::text)>=4
  ) INTO v_admin_level;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id',r.id,'target_type',r.target_type,'target_id',r.target_id,'target_owner_id',r.target_owner_id,
      'category',r.category,'details',r.details,'supporting_url',r.supporting_url,'status',r.status,
      'created_at',r.created_at,'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by,
      'resolution',r.resolution,'moderator_notes',r.moderator_notes,
      'track_title',COALESCE(t.title,r.target_title),
      'track_is_published',COALESCE(t.is_published,false),
      'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
      'creator_handle',owner_profile.handle,'creator_display_name',owner_profile.display_name,
      'creator_artist_alias',owner_profile.artist_alias,
      'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
      'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
      'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
      'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END,
      'case_id',mc.id,'case_status',mc.status,'case_assigned_to',mc.assigned_to,
      'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END),
      'case_unread_count',CASE WHEN mc.id IS NULL THEN 0 ELSE (
        SELECT count(*)::integer
        FROM public.moderation_case_messages m
        LEFT JOIN public.moderation_case_reads rd ON rd.case_id=mc.id AND rd.user_id=_actor
        WHERE m.case_id=mc.id AND m.sender_side='creator'
          AND m.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
      ) END
    )) AS row_data
    FROM public.content_reports r
    LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
    LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
    LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.moderation_cases mc ON mc.report_id=r.id
    LEFT JOIN public.profiles handler ON handler.id=mc.assigned_to
    WHERE
      _scope='all'
      OR (_scope='open' AND r.status='open')
      OR (_scope='under_review' AND r.status='under_review')
      OR (_scope='resolved' AND r.status IN ('resolved_action_taken','resolved_no_violation','dismissed_abuse'))
  ) q;

  RETURN v_result;
END;
$;

CREATE OR REPLACE FUNCTION public.get_content_report_for_actor(
  _actor uuid,
  _report_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $
DECLARE
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF _actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id=_actor
      AND ur.moderation_status::text='active'
      AND public.app_role_rank(ur.role::text)>=2
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id=_actor
      AND ur.moderation_status::text='active'
      AND public.app_role_rank(ur.role::text)>=4
  ) INTO v_admin_level;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id',r.id,'target_type',r.target_type,'target_id',r.target_id,'target_owner_id',r.target_owner_id,
    'category',r.category,'details',r.details,'supporting_url',r.supporting_url,'status',r.status,
    'created_at',r.created_at,'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by,
    'resolution',r.resolution,'moderator_notes',r.moderator_notes,
    'track_title',COALESCE(t.title,r.target_title),'track_is_published',COALESCE(t.is_published,false),
    'track_moderation_status',COALESCE(t.moderation_status,'deleted'),
    'creator_handle',owner_profile.handle,'creator_display_name',owner_profile.display_name,
    'creator_artist_alias',owner_profile.artist_alias,
    'reporter_user_id',CASE WHEN v_admin_level THEN r.reporter_user_id ELSE NULL END,
    'reporter_email',CASE WHEN v_admin_level THEN reporter.email ELSE NULL END,
    'reporter_handle',CASE WHEN v_admin_level THEN reporter_profile.handle ELSE NULL END,
    'reporter_display_name',CASE WHEN v_admin_level THEN reporter_profile.display_name ELSE NULL END,
    'case_id',mc.id,'case_status',mc.status,'case_assigned_to',mc.assigned_to,
    'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END)
  )) INTO v_result
  FROM public.content_reports r
  LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
  LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
  LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.moderation_cases mc ON mc.report_id=r.id
  LEFT JOIN public.profiles handler ON handler.id=mc.assigned_to
  WHERE r.id=_report_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  RETURN v_result;
END;
$;

REVOKE ALL ON FUNCTION public.list_content_reports_for_actor(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_content_report_for_actor(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_content_reports_for_actor(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_content_report_for_actor(uuid,uuid) TO service_role;

COMMIT;
