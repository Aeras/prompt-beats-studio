-- Keep moderation case inbox visibility and unread counts aligned for creators and staff.
-- Moderators/senior moderators see assigned cases; admins/super admins see all cases.
-- These functions call has_moderation_capability(), so they must remain VOLATILE.

CREATE OR REPLACE FUNCTION public.get_moderation_case_unread_count()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_is_staff boolean;
  v_is_admin boolean;
  v_count integer;
BEGIN
  IF v_actor IS NULL THEN RETURN 0; END IF;

  v_is_staff:=public.has_moderation_capability('can_view_users');
  v_is_admin:=public.current_user_is_admin_level();

  SELECT count(*)::integer INTO v_count
  FROM public.moderation_cases c
  LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=v_actor
  WHERE
    (
      (NOT v_is_staff AND c.target_owner_id=v_actor)
      OR (v_is_staff AND (c.assigned_to=v_actor OR v_is_admin))
    )
    AND EXISTS(
      SELECT 1
      FROM (
        SELECT m.created_at
        FROM public.moderation_case_messages m
        WHERE m.case_id=c.id
          AND (
            (v_is_staff AND m.sender_side='creator')
            OR (NOT v_is_staff AND m.sender_side='staff')
          )
        UNION ALL
        SELECT e.created_at
        FROM public.moderation_case_events e
        WHERE e.case_id=c.id
          AND (
            (NOT v_is_staff AND e.creator_visible)
            OR (v_is_staff AND e.event_type IN ('creator_reply','appeal_submitted'))
          )
      ) incoming
      WHERE incoming.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
    );

  RETURN COALESCE(v_count,0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_moderation_cases()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_is_staff boolean;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  v_is_staff:=public.has_moderation_capability('can_view_users');
  v_is_admin:=public.current_user_is_admin_level();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'updated_at')::timestamptz DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id',c.id,
      'report_id',c.report_id,
      'status',c.status,
      'updated_at',c.updated_at,
      'track_title',r.target_title,
      'category',r.category,
      'assigned_label',COALESCE(ap.artist_alias,ap.display_name,CASE WHEN ap.handle IS NOT NULL THEN '@'||ap.handle END,'PromptBeats Moderation'),
      'unread_count',
        CASE
          WHEN v_is_staff THEN (
            SELECT count(*)::integer
            FROM (
              SELECT m.created_at
              FROM public.moderation_case_messages m
              WHERE m.case_id=c.id AND m.sender_side='creator'
              UNION ALL
              SELECT e.created_at
              FROM public.moderation_case_events e
              WHERE e.case_id=c.id AND e.event_type='appeal_submitted'
            ) incoming
            WHERE incoming.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
          )
          ELSE (
            SELECT count(*)::integer
            FROM (
              SELECT m.created_at
              FROM public.moderation_case_messages m
              WHERE m.case_id=c.id AND m.sender_side='staff'
              UNION ALL
              SELECT e.created_at
              FROM public.moderation_case_events e
              WHERE e.case_id=c.id
                AND e.creator_visible
                AND e.event_type NOT IN ('creator_contacted','staff_message_sent','creator_reply')
            ) incoming
            WHERE incoming.created_at>COALESCE(rd.last_read_at,'epoch'::timestamptz)
          )
        END
    ) AS row_data
    FROM public.moderation_cases c
    JOIN public.content_reports r ON r.id=c.report_id
    LEFT JOIN public.profiles ap ON ap.id=c.assigned_to
    LEFT JOIN public.moderation_case_reads rd ON rd.case_id=c.id AND rd.user_id=v_actor
    WHERE
      (NOT v_is_staff AND c.target_owner_id=v_actor)
      OR (v_is_staff AND (c.assigned_to=v_actor OR v_is_admin))
  ) q;

  RETURN v_result;
END;
$$;
