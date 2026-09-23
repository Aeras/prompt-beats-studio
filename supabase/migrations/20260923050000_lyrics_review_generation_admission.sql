BEGIN;

CREATE OR REPLACE FUNCTION public.start_generation_job(_idempotency_key uuid, _input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  v_feature_key:=CASE
    WHEN v_operation='lyrics_section_edit'
      AND COALESCE(NULLIF(_input->>'feature',''),'lyrics_workspace')='lyrics_review'
      THEN 'lyrics_review'
    WHEN v_operation='lyrics_section_edit' THEN 'lyrics_workspace'
    ELSE 'ai_generator'
  END;

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
$function$;

COMMIT;
