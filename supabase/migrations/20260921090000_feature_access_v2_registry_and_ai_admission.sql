-- PromptBeats Feature Access V2 — expand canonical product feature registry
-- and enforce cost-sensitive durable admission before credits/provider execution.
BEGIN;

INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES
  ('ai_generator','AI Generator','AI-powered full song generation and revision workflows.','everyone'),
  ('quality_check','Quality Check','AI-powered lyric and song Quality Check workflow.','everyone'),
  ('song_analyzer','Song Analyzer','Audio analysis, DSP analysis, and AI-assisted song analysis.','everyone'),
  ('lyrics_workspace','Lyrics Workspace','Section-based lyric editing and AI-assisted lyric section revisions.','everyone'),
  ('track_uploads','Track Uploads','Uploading new user audio tracks and associated cover artwork.','everyone'),
  ('sharing_public_links','Sharing / Public Links','Creation and management of shareable public track links.','everyone'),
  ('playlists','Playlists','Creating, editing, and managing user playlists.','everyone'),
  ('favorites','Favorites','Adding and removing tracks from a user''s Favorites collection.','everyone'),
  ('likes','Likes','Liking and unliking public tracks.','everyone')
ON CONFLICT(feature_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.start_generation_job(_idempotency_key uuid,_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_job public.ai_generation_jobs;
  v_used integer;
  v_reserved integer;
  v_gen uuid;
  v_operation text:=COALESCE(NULLIF(_input->>'operation',''),'generate');
  v_feature_key text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  IF _input IS NULL OR jsonb_typeof(_input)<>'object' THEN RAISE EXCEPTION 'invalid generation input'; END IF;

  v_feature_key:=CASE WHEN v_operation='lyrics_section_edit' THEN 'lyrics_workspace' ELSE 'ai_generator' END;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE user_id=v_user AND idempotency_key=_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(v_job); END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE user_id=v_user AND status IN('pending','processing') AND dismissed_at IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_job); END IF;

  IF NOT public.can_use_feature(v_user,v_feature_key) THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used
    FROM public.ai_generations
    WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user AND status IN('pending','processing');
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('rate_limited',true); END IF;
  END IF;

  INSERT INTO public.ai_generations(user_id) VALUES(v_user) RETURNING id INTO v_gen;
  INSERT INTO public.ai_generation_jobs(user_id,idempotency_key,status,input_payload,generation_id)
  VALUES(v_user,_idempotency_key,'pending',_input,v_gen) RETURNING * INTO v_job;
  PERFORM public.kick_generation_runner(v_job.id);
  RETURN to_jsonb(v_job);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_quality_check_job(_idempotency_key uuid,_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
  v_generation_key text:=NULLIF(_input->>'generationId','');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  IF _input IS NULL OR jsonb_typeof(_input)<>'object' THEN RAISE EXCEPTION 'invalid quality check input'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT * INTO v_action FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND idempotency_key=_idempotency_key FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId',v_action.id,'status',v_action.status,'qualityReport',v_action.quality_report,
      'provider',v_action.provider,'model',v_action.model,'error',v_action.error,'createdAt',v_action.created_at
    );
  END IF;

  SELECT * INTO v_action FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND status IN('pending','processing')
    AND ((v_generation_key IS NULL AND COALESCE(input_payload->>'generationId','')='')
      OR input_payload->>'generationId'=v_generation_key)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'actionId',v_action.id,'status',v_action.status,'qualityReport',v_action.quality_report,
      'provider',v_action.provider,'model',v_action.model,'error',v_action.error,'createdAt',v_action.created_at
    );
  END IF;

  IF NOT public.can_use_feature(v_user,'quality_check') THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_generations WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved FROM public.ai_quality_check_actions WHERE user_id=v_user AND status IN('pending','processing');
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('rate_limited',true); END IF;
  END IF;

  INSERT INTO public.ai_quality_check_actions(
    user_id,idempotency_key,status,input_payload,quality_report,consumed_generation_id,
    provider_started_at,provider,model,error,started_at,completed_at,updated_at
  ) VALUES(
    v_user,_idempotency_key,'pending',_input,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,now()
  ) RETURNING * INTO v_action;

  PERFORM public.kick_quality_check_runner(v_action.id);
  RETURN jsonb_build_object(
    'actionId',v_action.id,'status',v_action.status,'qualityReport',NULL,
    'provider',NULL,'model',NULL,'error',NULL,'createdAt',v_action.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_quality_check(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_action public.ai_quality_check_actions;
  v_used integer;
  v_reserved integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT * INTO v_action
  FROM public.ai_quality_check_actions
  WHERE user_id=v_user AND idempotency_key=_idempotency_key
  FOR UPDATE;

  IF FOUND AND v_action.status='completed' THEN
    RETURN jsonb_build_object('status','completed','qualityReport',v_action.quality_report,'provider',v_action.provider,'model',v_action.model);
  END IF;
  IF FOUND AND v_action.status='failed' AND v_action.provider_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','failed');
  END IF;
  IF FOUND AND v_action.status='processing'
     AND (v_action.provider_started_at IS NOT NULL OR v_action.updated_at>now()-interval '15 minutes')
  THEN
    RETURN jsonb_build_object('status','processing');
  END IF;

  IF NOT public.can_use_feature(v_user,'quality_check') THEN
    RAISE EXCEPTION 'feature not available';
  END IF;

  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_generations WHERE user_id=v_user AND created_at>now()-interval '1 hour';
    SELECT count(*)::integer INTO v_reserved
    FROM public.ai_quality_check_actions
    WHERE user_id=v_user AND status IN('pending','processing') AND (v_action.id IS NULL OR id<>v_action.id);
    IF v_used+v_reserved>=10 THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
  END IF;

  IF FOUND THEN
    UPDATE public.ai_quality_check_actions
    SET status='processing',quality_report=NULL,consumed_generation_id=NULL,provider_started_at=NULL,provider=NULL,model=NULL,updated_at=now()
    WHERE id=v_action.id;
    RETURN jsonb_build_object('status','claimed');
  END IF;

  INSERT INTO public.ai_quality_check_actions(user_id,idempotency_key,status)
  VALUES(v_user,_idempotency_key,'processing');
  RETURN jsonb_build_object('status','claimed');
END;
$$;

COMMIT;
