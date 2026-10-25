-- Run only on disposable local replay databases. Fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  v_owner uuid := 'e0000000-0000-4000-8000-000000000032';
  v_stranger uuid := 'e0000000-0000-4000-8000-000000000033';
  v_track uuid := 'e1000000-0000-4000-8000-000000000032';
  v_expired uuid := 'e2000000-0000-4000-8000-000000000032';
  v_closed uuid := 'e2000000-0000-4000-8000-000000000033';
  v_active uuid := 'e2000000-0000-4000-8000-000000000034';
  v_reviewer uuid := 'e3000000-0000-4000-8000-000000000032';
  v_result jsonb;
  v_denied boolean;
BEGIN
  IF has_function_privilege('anon','public.delete_finished_private_review_session(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.delete_finished_private_review_track(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anonymous deletion RPC exposure';
  END IF;
  IF NOT has_function_privilege('authenticated','public.delete_finished_private_review_session(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.delete_finished_private_review_track(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'missing owner RPC privileges';
  END IF;
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES (v_owner,'pb-archive-delete-owner@example.invalid',now()),
         (v_stranger,'pb-archive-delete-stranger@example.invalid',now());
  INSERT INTO public.tracks(id,user_id,title,audio_url,audio_type,source_type,source_id,source_url)
  VALUES(v_track,v_owner,'Offline review cleanup','https://suno.com/song/reviewcleanup','link','suno','reviewcleanup','https://suno.com/song/reviewcleanup');
  INSERT INTO public.private_review_sessions(
    id,owner_id,source_type,source_track_id,project_name,token_hash,
    snapshot,comment_visibility,created_at,expires_at,closed_at
  ) VALUES
    (v_expired,v_owner,'track',v_track,'Expired review',repeat('e',64),'{"title":"Expired"}','shared',now()-interval '2 days',now()-interval '1 day',NULL),
    (v_closed,v_owner,'track',v_track,'Closed review',repeat('f',64),'{"title":"Closed"}','shared',now(),now()+interval '1 day',now()),
    (v_active,v_owner,'track',v_track,'Active review',repeat('a',64),'{"title":"Active"}','shared',now(),now()+interval '1 day',NULL);
  INSERT INTO public.private_review_reviewers(id,session_id,access_key_hash,display_name)
  VALUES(v_reviewer,v_expired,repeat('b',64),'Reviewer');
  INSERT INTO public.private_review_comments(session_id,thread_reviewer_id,author_type,author_reviewer_id,body)
  VALUES(v_expired,v_reviewer,'reviewer',v_reviewer,'Review comment');
  INSERT INTO public.private_review_join_admissions(session_id,network_hash,bucket_start)
  VALUES(v_expired,repeat('c',64),date_trunc('hour',now()));
  INSERT INTO public.private_review_session_admissions(session_id,bucket_start)
  VALUES(v_expired,date_trunc('hour',now()));

  PERFORM set_config('request.jwt.claim.sub',v_stranger::text,true);
  v_denied := false;
  BEGIN
    PERFORM public.delete_finished_private_review_session(v_expired);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'nonowner deleted session'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  v_denied := false;
  BEGIN
    PERFORM public.delete_finished_private_review_session(v_active);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'active session was deleted'; END IF;

  v_denied := false;
  BEGIN
    PERFORM public.delete_finished_private_review_track(v_track);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'bulk operation deleted active review'; END IF;
  IF (SELECT count(*) FROM public.private_review_sessions WHERE source_track_id=v_track) <> 3 THEN
    RAISE EXCEPTION 'bulk failure was not atomic';
  END IF;

  v_result := public.delete_finished_private_review_session(v_expired);
  IF (v_result->>'deleted')::integer <> 1 THEN RAISE EXCEPTION 'single deletion wrong count'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_review_reviewers WHERE session_id=v_expired)
     OR EXISTS(SELECT 1 FROM public.private_review_comments WHERE session_id=v_expired)
     OR EXISTS(SELECT 1 FROM public.private_review_join_admissions WHERE session_id=v_expired)
     OR EXISTS(SELECT 1 FROM public.private_review_session_admissions WHERE session_id=v_expired) THEN
    RAISE EXCEPTION 'orphan review data after hard deletion';
  END IF;

  UPDATE public.private_review_sessions SET closed_at=now() WHERE id=v_active;
  v_result := public.delete_finished_private_review_track(v_track);
  IF (v_result->>'deleted')::integer <> 2 THEN RAISE EXCEPTION 'bulk deletion wrong count'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_review_sessions WHERE source_track_id=v_track) THEN
    RAISE EXCEPTION 'bulk deletion left sessions';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tracks WHERE id=v_track) THEN
    RAISE EXCEPTION 'review cleanup deleted the track';
  END IF;
END;
$$;
ROLLBACK;
