-- Reports notification compatibility schema.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_track','new_follower','new_report'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_track_shape;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_track_shape CHECK (
  (type='new_track' AND report_id IS NULL)
  OR (type='new_follower' AND track_id IS NULL AND report_id IS NULL)
  OR (type='new_report' AND report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notifications_report_id_idx
  ON public.notifications(report_id)
  WHERE report_id IS NOT NULL;

COMMIT;
