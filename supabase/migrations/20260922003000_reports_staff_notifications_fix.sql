-- Fix Reports admin loading path and add staff notifications for new reports.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_track','new_follower','new_report'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_track_shape;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_track_shape
  CHECK (
    type IN ('new_track','new_report')
    OR (type='new_follower' AND track_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS notifications_report_idx
  ON public.notifications(report_id)
  WHERE report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_staff_on_new_content_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
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
    NEW.reporter_user_id,
    'new_report',
    NEW.target_id,
    NEW.id,
    'new_report:'||NEW.id::text||':'||ur.user_id::text
  FROM public.user_roles ur
  WHERE ur.moderation_status::text='active'
    AND public.app_role_rank(ur.role::text)>=2
    AND public.can_use_feature(ur.user_id,'notifications')
  ON CONFLICT(event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_reports_notify_staff ON public.content_reports;
CREATE TRIGGER content_reports_notify_staff
AFTER INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_new_content_report();

-- Backfill currently-open reports so the existing reports that exposed this bug
-- appear as staff notifications after the fix is deployed.
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
  r.reporter_user_id,
  'new_report',
  r.target_id,
  r.id,
  'new_report:'||r.id::text||':'||ur.user_id::text,
  r.created_at
FROM public.content_reports r
JOIN public.user_roles ur
  ON ur.moderation_status::text='active'
 AND public.app_role_rank(ur.role::text)>=2
WHERE r.status IN ('open','under_review')
  AND public.can_use_feature(ur.user_id,'notifications')
ON CONFLICT(event_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._report_staff_role(_actor uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT ur.role::text
    FROM public.user_roles ur
    WHERE ur.user_id=_actor
      AND ur.moderation_status::text='active'
    ORDER BY public.app_role_rank(ur.role::text) DESC
    LIMIT 1
  ),'user');
$$;

CREATE OR REPLACE FUNCTION public.list_content_reports_for_staff(
  _actor uuid,
  _scope text DEFAULT 'open'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_actor_role:=public._report_staff_role(_actor);
  IF public.app_role_rank(v_actor_role)<2 THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _scope NOT IN ('open','under_review','resolved','all') THEN RAISE EXCEPTION 'invalid report scope'; END IF;
  v_admin_level:=public.app_role_rank(v_actor_role)>=4;

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
      'case_id',c.id,'case_status',c.status,'case_assigned_to',c.assigned_to,
      'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END),
      'case_unread_count',CASE WHEN c.id IS NULL THEN 0 ELSE (
        SELECT count(*)::integer
        FROM public.moderation_case_messages m
        LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=_actor
        WHERE m.case_id=c.id AND m.sender_side='creator'
          AND m.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
      ) END
    )) AS row_data
    FROM public.content_reports r
    LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
    LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
    LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
    LEFT JOIN public.moderation_cases c ON c.report_id=r.id
    LEFT JOIN public.profiles handler ON handler.id=c.assigned_to
    WHERE
      _scope='all'
      OR (_scope='open' AND r.status='open')
      OR (_scope='under_review' AND r.status='under_review')
      OR (_scope='resolved' AND r.status IN ('resolved_action_taken','resolved_no_violation','dismissed_abuse'))
  ) q;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_content_report_for_staff(
  _actor uuid,
  _report_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_admin_level boolean;
  v_result jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_actor_role:=public._report_staff_role(_actor);
  IF public.app_role_rank(v_actor_role)<2 THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_admin_level:=public.app_role_rank(v_actor_role)>=4;

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
    'case_id',c.id,'case_status',c.status,'case_assigned_to',c.assigned_to,
    'case_assigned_label',COALESCE(handler.artist_alias,handler.display_name,CASE WHEN handler.handle IS NOT NULL THEN '@'||handler.handle END)
  )) INTO v_result
  FROM public.content_reports r
  LEFT JOIN public.tracks t ON t.id=r.target_id AND r.target_type='track'
  LEFT JOIN public.profiles owner_profile ON owner_profile.id=r.target_owner_id
  LEFT JOIN auth.users reporter ON reporter.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.profiles reporter_profile ON reporter_profile.id=r.reporter_user_id AND v_admin_level
  LEFT JOIN public.moderation_cases c ON c.report_id=r.id
  LEFT JOIN public.profiles handler ON handler.id=c.assigned_to
  WHERE r.id=_report_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._report_staff_role(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_content_reports_for_staff(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_content_report_for_staff(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._report_staff_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_content_reports_for_staff(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_content_report_for_staff(uuid,uuid) TO service_role;

COMMIT;
