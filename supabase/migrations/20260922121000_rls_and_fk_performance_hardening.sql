-- Scale-oriented hardening for the busiest relational paths plus RLS auth
-- initplan optimization. This intentionally leaves low-value/unused-index
-- advisor items alone rather than indexing every foreign key mechanically.

CREATE INDEX IF NOT EXISTS ai_quality_check_actions_consumed_generation_idx
  ON public.ai_quality_check_actions(consumed_generation_id)
  WHERE consumed_generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_reports_target_owner_idx
  ON public.content_reports(target_owner_id)
  WHERE target_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS favorites_track_idx
  ON public.favorites(track_id);
CREATE INDEX IF NOT EXISTS playlist_tracks_track_idx
  ON public.playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS notifications_actor_idx
  ON public.notifications(actor_user_id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_report_idx
  ON public.notifications(report_id)
  WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_track_idx
  ON public.notifications(track_id)
  WHERE track_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderation_case_appeals_appellant_idx
  ON public.moderation_case_appeals(appellant_user_id);
CREATE INDEX IF NOT EXISTS moderation_case_events_actor_idx
  ON public.moderation_case_events(actor_user_id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderation_case_messages_sender_idx
  ON public.moderation_case_messages(sender_user_id)
  WHERE sender_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderation_case_notes_author_idx
  ON public.moderation_case_notes(author_user_id)
  WHERE author_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderation_case_reads_user_idx
  ON public.moderation_case_reads(user_id);
CREATE INDEX IF NOT EXISTS song_analyses_project_idx
  ON public.song_analyses(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS track_share_events_shared_by_idx
  ON public.track_share_events(shared_by)
  WHERE shared_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS track_storage_cleanup_owner_idx
  ON public.track_storage_cleanup(owner_id);
CREATE INDEX IF NOT EXISTS track_audio_cleanup_locks_cleanup_idx
  ON public.track_audio_cleanup_locks(cleanup_id);
CREATE INDEX IF NOT EXISTS track_cover_cleanup_locks_cleanup_idx
  ON public.track_cover_cleanup_locks(cleanup_id);
CREATE INDEX IF NOT EXISTS track_play_throttles_listener_idx
  ON public.track_play_throttles(listener_user_id)
  WHERE listener_user_id IS NOT NULL;

-- Supabase recommends evaluating auth.uid() once per statement in RLS policies.
-- Rewrite only direct auth.uid() calls while preserving every existing policy
-- predicate, role, command and feature/account-state check verbatim.
DO $$
DECLARE
  r record;
  v_using text;
  v_check text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    v_using := CASE
      WHEN r.qual IS NULL THEN NULL
      ELSE replace(r.qual, 'auth.uid()', '(SELECT auth.uid())')
    END;
    v_check := CASE
      WHEN r.with_check IS NULL THEN NULL
      ELSE replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())')
    END;

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;
