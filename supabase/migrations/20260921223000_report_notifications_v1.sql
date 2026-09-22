-- Report queue reliability + moderation staff report notifications
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_track_shape;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_track','new_follower','new_report'));

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_shape_check
  CHECK (
    (type='new_track' AND report_id IS NULL)
    OR (type='new_follower' AND track_id IS NULL AND report_id IS NULL)
    OR (type='new_report' AND track_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS notifications_new_report_once_idx
  ON public.notifications(recipient_user_id, report_id, type)
  WHERE type='new_report' AND report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_staff_on_content_report()
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
    report_id,
    event_key
  )
  SELECT DISTINCT
    ur.user_id,
    NULL::uuid,
    'new_report',
    NEW.id,
    'new_report:' || NEW.id::text || ':' || ur.user_id::text
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id=ur.user_id
  LEFT JOIN public.profile_private pp ON pp.user_id=ur.user_id
  WHERE ur.moderation_status::text='active'
    AND public.app_role_rank(ur.role::text) >= 2
    AND COALESCE(pp.is_banned,false)=false
    AND public.can_use_feature(ur.user_id,'notifications')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_reports_notify_staff ON public.content_reports;
CREATE TRIGGER content_reports_notify_staff
AFTER INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_content_report();

-- Backfill still-open reports so staff do not miss reports created before this trigger existed.
INSERT INTO public.notifications(
  recipient_user_id,
  actor_user_id,
  type,
  report_id,
  event_key,
  created_at
)
SELECT DISTINCT
  ur.user_id,
  NULL::uuid,
  'new_report',
  r.id,
  'new_report:' || r.id::text || ':' || ur.user_id::text,
  r.created_at
FROM public.content_reports r
JOIN public.user_roles ur
  ON ur.moderation_status::text='active'
 AND public.app_role_rank(ur.role::text) >= 2
JOIN public.profiles p ON p.id=ur.user_id
LEFT JOIN public.profile_private pp ON pp.user_id=ur.user_id
WHERE r.status IN ('open','under_review')
  AND COALESCE(pp.is_banned,false)=false
  AND public.can_use_feature(ur.user_id,'notifications')
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.notify_staff_on_content_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_on_content_report() TO service_role;

COMMIT;
