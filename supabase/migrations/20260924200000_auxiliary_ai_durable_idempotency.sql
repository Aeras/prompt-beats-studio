-- F7-03: durable, result-replayable idempotency for every paid auxiliary AI action.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_auxiliary_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('song_setup_assistant','ai_music_lab','song_analyzer','inspiration_wall','story_map','song_universe')),
  request_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  execution_token uuid,
  provider_started_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ai_auxiliary_requests_user_operation_key UNIQUE (user_id, operation, request_key)
);

CREATE INDEX IF NOT EXISTS ai_auxiliary_requests_recovery_idx
  ON public.ai_auxiliary_requests (user_id, operation, status, updated_at);

ALTER TABLE public.ai_auxiliary_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_auxiliary_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_auxiliary_requests TO service_role;

CREATE OR REPLACE FUNCTION public.claim_auxiliary_ai_request(_operation text, _request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_request public.ai_auxiliary_requests;
  v_used integer;
  v_token uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _operation NOT IN ('song_setup_assistant','ai_music_lab','song_analyzer','inspiration_wall','story_map','song_universe') THEN RAISE EXCEPTION 'invalid AI operation'; END IF;
  PERFORM public._lock_user_security_state(v_user);
  IF NOT public.has_valid_account_state(v_user) THEN RAISE EXCEPTION 'account is not available'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai-request:' || v_user::text || ':' || _operation || ':' || _request_key::text, 0));

  SELECT * INTO v_request FROM public.ai_auxiliary_requests
  WHERE user_id = v_user AND operation = _operation AND request_key = _request_key FOR UPDATE;
  IF FOUND THEN
    IF v_request.status = 'completed' THEN
      RETURN jsonb_build_object('status','completed','result',v_request.result);
    END IF;
    IF v_request.status = 'processing' AND (v_request.provider_started_at IS NOT NULL OR v_request.updated_at > now() - interval '15 minutes') THEN
      RETURN jsonb_build_object('status','processing');
    END IF;
    IF v_request.status = 'failed' AND v_request.provider_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('status','failed','error',COALESCE(v_request.error,'AI request failed'));
    END IF;
    -- Only an execution that never reached provider-started may be recovered.
    v_token := gen_random_uuid();
    UPDATE public.ai_auxiliary_requests SET status='processing', execution_token=v_token, error=NULL, updated_at=now()
    WHERE id=v_request.id;
    RETURN jsonb_build_object('status','claimed','executionToken',v_token);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('aux-ai-hour:' || v_user::text || ':' || _operation, 0));
  IF NOT public._is_admin_level_internal(v_user) THEN
    SELECT count(*)::integer INTO v_used FROM public.ai_auxiliary_admissions
    WHERE user_id=v_user AND operation=_operation AND created_at > now()-interval '1 hour';
    IF v_used >= 10 THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
  END IF;
  INSERT INTO public.ai_auxiliary_admissions(user_id,operation) VALUES(v_user,_operation);
  DELETE FROM public.ai_auxiliary_admissions WHERE user_id=v_user AND created_at < now()-interval '7 days';

  v_token := gen_random_uuid();
  INSERT INTO public.ai_auxiliary_requests(user_id,operation,request_key,status,execution_token)
  VALUES(v_user,_operation,_request_key,'processing',v_token);
  RETURN jsonb_build_object('status','claimed','executionToken',v_token);
END; $$;

CREATE OR REPLACE FUNCTION public.mark_auxiliary_ai_provider_started(_operation text, _request_key uuid, _execution_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE v_user uuid := auth.uid(); BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ai_auxiliary_requests SET provider_started_at=now(), updated_at=now()
  WHERE user_id=v_user AND operation=_operation AND request_key=_request_key AND status='processing'
    AND execution_token=_execution_token AND provider_started_at IS NULL;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_auxiliary_ai_request(_operation text, _request_key uuid, _execution_token uuid, _result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE v_user uuid := auth.uid(); BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ai_auxiliary_requests SET status='completed',result=_result,error=NULL,completed_at=now(),updated_at=now()
  WHERE user_id=v_user AND operation=_operation AND request_key=_request_key AND execution_token=_execution_token AND status='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'auxiliary AI request claim lost'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.fail_auxiliary_ai_request(_operation text, _request_key uuid, _execution_token uuid, _error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp' AS $$
DECLARE v_user uuid := auth.uid(); BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ai_auxiliary_requests SET status='failed',error=left(COALESCE(_error,'AI request failed'),500),updated_at=now()
  WHERE user_id=v_user AND operation=_operation AND request_key=_request_key AND execution_token=_execution_token AND status='processing';
END; $$;

REVOKE ALL ON FUNCTION public.claim_auxiliary_ai_request(text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_auxiliary_ai_provider_started(text,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_auxiliary_ai_request(text,uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_auxiliary_ai_request(text,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_auxiliary_ai_request(text,uuid), public.mark_auxiliary_ai_provider_started(text,uuid,uuid), public.complete_auxiliary_ai_request(text,uuid,uuid,jsonb), public.fail_auxiliary_ai_request(text,uuid,uuid,text) TO authenticated, service_role;

COMMIT;
