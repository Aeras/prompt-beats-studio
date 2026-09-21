-- Notify active moderation staff about new reports.
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_staff_on_content_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
  SELECT
    ur.user_id,
    NULL,
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
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_content_report();

INSERT INTO public.notifications(
  recipient_user_id,
  actor_user_id,
  type,
  track_id,
  report_id,
  event_key,
  created_at
)
SELECT
  ur.user_id,
  NULL,
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

REVOKE ALL ON FUNCTION public.notify_staff_on_content_report() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notify_staff_on_content_report() TO service_role;

COMMIT;
