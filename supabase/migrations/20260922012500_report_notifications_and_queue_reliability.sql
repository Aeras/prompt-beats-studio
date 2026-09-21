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
    AND public.can_use_feature(ur.user_id,'notifications')
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

COMMIT;
