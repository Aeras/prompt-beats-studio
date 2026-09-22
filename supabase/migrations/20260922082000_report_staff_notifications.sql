-- Fix report queue delivery and add staff notifications for new reports.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_track','new_follower','new_report'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_track_shape;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_track_shape CHECK (
  (type='new_track' AND track_id IS NOT NULL AND report_id IS NULL)
  OR (type='new_follower' AND track_id IS NULL AND report_id IS NULL)
  OR (type='new_report' AND report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notifications_report_idx
  ON public.notifications(report_id)
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
    track_id,
    report_id,
    event_key
  )
  SELECT
    ur.user_id,
    NULL,
    'new_report',
    CASE WHEN NEW.target_type='track' THEN NEW.target_id ELSE NULL END,
    NEW.id,
    'new_report:'||NEW.id::text||':'||ur.user_id::text
  FROM public.user_roles ur
  WHERE ur.moderation_status='active'
    AND public.app_role_rank(ur.role::text) >= 2
    AND public.can_use_feature(ur.user_id,'notifications')
  ON CONFLICT(event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_reports_staff_notify ON public.content_reports;
CREATE TRIGGER content_reports_staff_notify
AFTER INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_content_report();

REVOKE ALL ON FUNCTION public.notify_staff_on_content_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_on_content_report() TO service_role;

COMMIT;
