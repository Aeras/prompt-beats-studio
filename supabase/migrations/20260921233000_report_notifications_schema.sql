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

DROP POLICY IF EXISTS "Recipients can read own notifications" ON public.notifications;
CREATE POLICY "Recipients can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR public.has_moderation_capability('can_view_users')
    )
  );

DROP POLICY IF EXISTS "Recipients can mark own notifications read" ON public.notifications;
CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR public.has_moderation_capability('can_view_users')
    )
  )
  WITH CHECK (
    recipient_user_id = auth.uid()
    AND (
      public.current_user_can_use_feature('notifications')
      OR public.has_moderation_capability('can_view_users')
    )
  );

COMMIT;
