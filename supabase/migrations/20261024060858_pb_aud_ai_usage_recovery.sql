BEGIN;

-- Additive evidence ledger. No inference is made about historical invoices.
ALTER TABLE public.ai_usage_logs
  ADD COLUMN provider_usage_state text NOT NULL DEFAULT 'legacy'
    CHECK (provider_usage_state IN ('legacy','unknown','partial','final')),
  ADD COLUMN reasoning_tokens integer CHECK (reasoning_tokens >= 0),
  ADD COLUMN provider_reported_cost_usd numeric(20,10) CHECK (provider_reported_cost_usd >= 0);

CREATE TABLE public.ai_provider_executions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  generation_id uuid,
  job_id uuid UNIQUE REFERENCES public.ai_generation_jobs(id) ON DELETE CASCADE,
  quality_action_id uuid UNIQUE REFERENCES public.ai_quality_check_actions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'execution_unknown'
    CHECK (state IN ('execution_unknown','accepted','response_observed','not_dispatched')),
  remote_provider text CHECK (remote_provider IN ('openai','gemini')),
  remote_id text CHECK (length(remote_id) BETWEEN 1 AND 160),
  observed_usage jsonb,
  result jsonb CHECK (octet_length(result::text) <= 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_recovery_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  recovery_attempts integer NOT NULL DEFAULT 0 CHECK (recovery_attempts BETWEEN 0 AND 8),
  lease_token uuid,
  lease_until timestamptz,
  CHECK (job_id IS NULL OR quality_action_id IS NULL)
);
CREATE UNIQUE INDEX ai_provider_execution_remote_identity
  ON public.ai_provider_executions(provider, remote_id) WHERE remote_id IS NOT NULL;
CREATE INDEX ai_provider_execution_recovery
  ON public.ai_provider_executions(next_recovery_at) WHERE state <> 'not_dispatched';
ALTER TABLE public.ai_provider_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_provider_executions TO service_role;

ALTER TABLE public.ai_generation_jobs ADD COLUMN recovery_until timestamptz;
ALTER TABLE public.ai_quality_check_actions ADD COLUMN recovery_until timestamptz;

CREATE FUNCTION public.begin_ai_execution_internal(
  _id uuid, _user_id uuid, _operation text, _provider text, _model text,
  _generation_id uuid, _job_id uuid, _quality_action_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
BEGIN
  IF _job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_generation_jobs WHERE id = _job_id AND user_id = _user_id
      AND status = 'processing' AND cancel_requested_at IS NULL
  ) THEN RAISE EXCEPTION 'invalid generation execution owner/state'; END IF;
  IF _quality_action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_quality_check_actions WHERE id = _quality_action_id AND user_id = _user_id
      AND status = 'processing' AND cancel_requested_at IS NULL
  ) THEN RAISE EXCEPTION 'invalid quality execution owner/state'; END IF;
  INSERT INTO public.ai_provider_executions(id,user_id,provider,model,operation,generation_id,job_id,quality_action_id)
    VALUES (_id,_user_id,_provider,_model,_operation,_generation_id,_job_id,_quality_action_id);
END;
$$;

CREATE FUNCTION public.mark_ai_execution_remote_internal(_id uuid, _user_id uuid, _provider text, _remote_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE public.ai_provider_executions SET remote_provider = _provider, remote_id = _remote_id,
    state = 'accepted', updated_at = now()
  WHERE id = _id AND user_id = _user_id AND state IN ('execution_unknown','accepted')
    AND (remote_id IS NULL OR remote_id = _remote_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'execution remote identity rejected'; END IF;
END;
$$;

CREATE FUNCTION public.observe_ai_execution_usage_internal(_id uuid, _user_id uuid, _usage jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE public.ai_provider_executions SET observed_usage = _usage, updated_at = now()
    WHERE id = _id AND user_id = _user_id AND result IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution observation rejected'; END IF;
END;
$$;

CREATE FUNCTION public.skip_ai_execution_internal(_id uuid, _user_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  UPDATE public.ai_provider_executions SET state = 'not_dispatched', updated_at = now()
  WHERE id = _id AND user_id = _user_id AND state = 'execution_unknown' AND remote_id IS NULL;
$$;

CREATE FUNCTION public.checkpoint_ai_execution_internal(_id uuid, _user_id uuid, _result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE public.ai_provider_executions SET result = COALESCE(result, _result),
    observed_usage = CASE WHEN result IS NULL THEN NULLIF(_result->'usage','null'::jsonb) ELSE observed_usage END,
    state = 'response_observed', updated_at = now(), next_recovery_at = now()
  WHERE id = _id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution checkpoint rejected'; END IF;
END;
$$;

CREATE FUNCTION public.read_ai_execution_internal(_user_id uuid, _job_id uuid, _quality_action_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  SELECT to_jsonb(e) FROM public.ai_provider_executions e WHERE e.user_id = _user_id
    AND ((_job_id IS NOT NULL AND e.job_id = _job_id)
      OR (_quality_action_id IS NOT NULL AND e.quality_action_id = _quality_action_id));
$$;

-- One primary-key identity survives insert commit/ACK loss and outbox delivery.
-- NULL evidence may be enriched later, but can never erase known consumption.
CREATE FUNCTION public.settle_ai_usage_internal(_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE v_id uuid := COALESCE(NULLIF(_payload->>'id','')::uuid, gen_random_uuid()); v_row public.ai_usage_logs;
BEGIN
  INSERT INTO public.ai_usage_logs(id,user_id,generation_id,provider,model,operation,
    input_tokens,output_tokens,total_tokens,cached_input_tokens,cache_write_tokens,reasoning_tokens,
    provider_reported_cost_usd,success,provider_usage_state)
  VALUES (v_id,(_payload->>'user_id')::uuid,NULLIF(_payload->>'generation_id','')::uuid,
    _payload->>'provider',_payload->>'model',_payload->>'operation',
    NULLIF(_payload->>'input_tokens','')::integer,NULLIF(_payload->>'output_tokens','')::integer,
    NULLIF(_payload->>'total_tokens','')::integer,NULLIF(_payload->>'cached_input_tokens','')::integer,
    NULLIF(_payload->>'cache_write_tokens','')::integer,NULLIF(_payload->>'reasoning_tokens','')::integer,
    NULLIF(_payload->>'provider_reported_cost_usd','')::numeric,COALESCE((_payload->>'success')::boolean,false),
    COALESCE(_payload->>'provider_usage_state','legacy'))
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO STRICT v_row FROM public.ai_usage_logs WHERE id = v_id FOR UPDATE;
  IF v_row.user_id IS DISTINCT FROM (_payload->>'user_id')::uuid
    OR v_row.provider IS DISTINCT FROM _payload->>'provider'
    OR v_row.model IS DISTINCT FROM _payload->>'model'
    OR v_row.operation IS DISTINCT FROM _payload->>'operation'
  THEN RAISE EXCEPTION 'usage execution identity mismatch'; END IF;
  IF _payload->>'provider_usage_state' = 'final' AND v_row.provider_usage_state IN ('unknown','partial') THEN
    UPDATE public.ai_usage_logs SET
      input_tokens = COALESCE(NULLIF(_payload->>'input_tokens','')::integer,input_tokens),
      output_tokens = COALESCE(NULLIF(_payload->>'output_tokens','')::integer,output_tokens),
      total_tokens = COALESCE(NULLIF(_payload->>'total_tokens','')::integer,total_tokens),
      cached_input_tokens = COALESCE(NULLIF(_payload->>'cached_input_tokens','')::integer,cached_input_tokens),
      cache_write_tokens = COALESCE(NULLIF(_payload->>'cache_write_tokens','')::integer,cache_write_tokens),
      reasoning_tokens = COALESCE(NULLIF(_payload->>'reasoning_tokens','')::integer,reasoning_tokens),
      estimated_cost_usd = NULL WHERE id = v_id;
  ELSIF _payload->>'provider_usage_state' = 'partial' AND v_row.provider_usage_state IN ('unknown','partial') THEN
    UPDATE public.ai_usage_logs SET
      input_tokens = GREATEST(input_tokens,NULLIF(_payload->>'input_tokens','')::integer),
      output_tokens = GREATEST(output_tokens,NULLIF(_payload->>'output_tokens','')::integer),
      total_tokens = GREATEST(total_tokens,NULLIF(_payload->>'total_tokens','')::integer),
      cached_input_tokens = GREATEST(cached_input_tokens,NULLIF(_payload->>'cached_input_tokens','')::integer),
      cache_write_tokens = GREATEST(cache_write_tokens,NULLIF(_payload->>'cache_write_tokens','')::integer),
      reasoning_tokens = GREATEST(reasoning_tokens,NULLIF(_payload->>'reasoning_tokens','')::integer),
      estimated_cost_usd = NULL WHERE id = v_id;
  END IF;
  UPDATE public.ai_usage_logs SET
    generation_id = COALESCE(generation_id,NULLIF(_payload->>'generation_id','')::uuid),
    input_tokens = COALESCE(input_tokens,NULLIF(_payload->>'input_tokens','')::integer),
    output_tokens = COALESCE(output_tokens,NULLIF(_payload->>'output_tokens','')::integer),
    total_tokens = COALESCE(total_tokens,NULLIF(_payload->>'total_tokens','')::integer),
    cached_input_tokens = COALESCE(cached_input_tokens,NULLIF(_payload->>'cached_input_tokens','')::integer),
    cache_write_tokens = COALESCE(cache_write_tokens,NULLIF(_payload->>'cache_write_tokens','')::integer),
    reasoning_tokens = COALESCE(reasoning_tokens,NULLIF(_payload->>'reasoning_tokens','')::integer),
    provider_reported_cost_usd = CASE WHEN v_row.provider_usage_state IN ('unknown','partial')
      AND _payload->>'provider_usage_state' = 'final'
      THEN COALESCE(NULLIF(_payload->>'provider_reported_cost_usd','')::numeric,provider_reported_cost_usd)
      ELSE COALESCE(provider_reported_cost_usd,NULLIF(_payload->>'provider_reported_cost_usd','')::numeric) END,
    success = success OR COALESCE((_payload->>'success')::boolean,false),
    provider_usage_state = CASE WHEN provider_usage_state = 'final' THEN 'final'
      WHEN _payload->>'provider_usage_state' = 'final' THEN 'final'
      WHEN provider_usage_state = 'partial' OR _payload->>'provider_usage_state' = 'partial' THEN 'partial'
      ELSE provider_usage_state END
  WHERE id = v_id;
  UPDATE public.ai_usage_logs SET
    estimated_cost_usd = public._calculate_ai_usage_cost(model,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens),
    cost_status = CASE WHEN input_tokens IS NULL AND output_tokens IS NULL THEN 'usage_unavailable'
      WHEN public._calculate_ai_usage_cost(model,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens) IS NULL
      THEN 'pending_pricing' ELSE 'calculated' END
  WHERE id = v_id AND estimated_cost_usd IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.flush_ai_usage_outbox(_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE v_row record; v_count integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM public.ai_usage_outbox WHERE next_attempt_at <= now()
    AND attempts < 8 ORDER BY created_at LIMIT LEAST(GREATEST(_limit,1),500) FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Historical rows have no dispatch identity; retain their outbox identity.
      PERFORM public.settle_ai_usage_internal(jsonb_build_object('id',v_row.id) || v_row.payload);
      DELETE FROM public.ai_usage_outbox WHERE id = v_row.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ai_usage_outbox SET attempts = attempts + 1,
        last_error = SQLSTATE, next_attempt_at = now() + interval '5 minutes', updated_at = now()
      WHERE id = v_row.id;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.claim_ai_execution_recovery_internal()
RETURNS SETOF public.ai_provider_executions LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  UPDATE public.ai_provider_executions SET lease_token = gen_random_uuid(),
    lease_until = now() + interval '2 minutes', recovery_attempts = recovery_attempts + 1
  WHERE id IN (SELECT id FROM public.ai_provider_executions
    WHERE state <> 'not_dispatched' AND next_recovery_at <= now() AND recovery_attempts < 8
      AND (lease_until IS NULL OR lease_until < now())
    ORDER BY next_recovery_at LIMIT 5 FOR UPDATE SKIP LOCKED)
  RETURNING *;
$$;
CREATE FUNCTION public.release_ai_execution_recovery_internal(_id uuid, _lease_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE e public.ai_provider_executions;
BEGIN
  UPDATE public.ai_provider_executions SET lease_until = NULL, lease_token = NULL,
    next_recovery_at = now() + interval '15 minutes'
    WHERE id = _id AND lease_token = _lease_token RETURNING * INTO e;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.ai_generation_jobs SET status='cancelled',completed_at=now(),result=NULL,error=NULL,
    cancellation_outcome=CASE WHEN e.remote_provider IS NOT NULL AND e.result->>'stopReason'='cancelled'
      THEN 'cancelled_upstream_confirmed' ELSE COALESCE(cancellation_outcome,'connection_aborted_unconfirmed') END
    WHERE id=e.job_id AND user_id=e.user_id AND status='processing' AND cancel_requested_at IS NOT NULL;
  UPDATE public.ai_quality_check_actions SET status='cancelled',completed_at=now(),quality_report=NULL,error=NULL,
    cancellation_outcome=CASE WHEN e.remote_provider IS NOT NULL AND e.result->>'stopReason'='cancelled'
      THEN 'cancelled_upstream_confirmed' ELSE COALESCE(cancellation_outcome,'connection_aborted_unconfirmed') END
    WHERE id=e.quality_action_id AND user_id=e.user_id AND status='processing' AND cancel_requested_at IS NOT NULL;
  -- Existing synchronous transports can run for 30 minutes. Do not fail a
  -- live request at the first 15-minute recovery sweep.
  IF e.result IS NULL AND ((e.remote_id IS NULL AND e.created_at < now() - interval '45 minutes')
    OR e.recovery_attempts >= 8) THEN
    UPDATE public.ai_generation_jobs SET status='failed',completed_at=now(),
      error='The provider outcome could not be recovered. Usage may still be billed. Start a new request explicitly.'
      WHERE id=e.job_id AND user_id=e.user_id AND status='processing' AND cancel_requested_at IS NULL;
    UPDATE public.ai_quality_check_actions SET status='failed',completed_at=now(),
      error='The provider outcome could not be recovered. Usage may still be billed. Start a new request explicitly.'
      WHERE id=e.quality_action_id AND user_id=e.user_id AND status='processing' AND cancel_requested_at IS NULL;
  END IF;
END;
$$;

CREATE FUNCTION public.claim_ai_recovered_job_internal(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE v_job jsonb;
BEGIN
  IF _kind = 'generate' THEN
    UPDATE public.ai_generation_jobs j SET recovery_until = now() + interval '15 minutes', status = 'processing'
    WHERE j.id = _id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
      AND (j.recovery_until IS NULL OR j.recovery_until < now())
      AND j.started_at < now() - interval '15 minutes'
      AND COALESCE(j.input_payload->>'operation','generate') <> 'revision'
      AND EXISTS (SELECT 1 FROM public.ai_provider_executions e WHERE e.job_id = j.id
        AND e.user_id = j.user_id AND e.result IS NOT NULL)
    RETURNING to_jsonb(j) INTO v_job;
  ELSIF _kind = 'quality_check' THEN
    UPDATE public.ai_quality_check_actions j SET recovery_until = now() + interval '15 minutes',status='processing'
    WHERE j.id = _id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
      AND (j.recovery_until IS NULL OR j.recovery_until < now())
      AND j.started_at < now() - interval '15 minutes'
      AND EXISTS (SELECT 1 FROM public.ai_provider_executions e WHERE e.quality_action_id = j.id
        AND e.user_id = j.user_id AND e.result IS NOT NULL)
    RETURNING to_jsonb(j) INTO v_job;
  END IF;
  RETURN v_job;
END;
$$;

-- No browser role can write/read receipts or invoke privileged recovery.
CREATE FUNCTION public.reap_unjournaled_ai_jobs_internal()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE n integer; m integer;
BEGIN
  -- Covers old workers and a crash between the existing provider-start fence
  -- and the new journal INSERT. No inference about spend or new dispatch.
  UPDATE public.ai_generation_jobs j SET status=CASE WHEN cancel_requested_at IS NULL THEN 'failed' ELSE 'cancelled' END,
    completed_at=now(),error='Provider execution/usage is unknown; no automatic retry was made.',
    cancellation_outcome=CASE WHEN cancel_requested_at IS NOT NULL
      THEN COALESCE(cancellation_outcome,'connection_aborted_unconfirmed') ELSE cancellation_outcome END
  WHERE status='processing' AND provider_started_at < now()-interval '45 minutes' AND result IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ai_provider_executions e WHERE e.job_id=j.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.ai_quality_check_actions j SET status=CASE WHEN cancel_requested_at IS NULL THEN 'failed' ELSE 'cancelled' END,
    completed_at=now(),error='Provider execution/usage is unknown; no automatic retry was made.',
    cancellation_outcome=CASE WHEN cancel_requested_at IS NOT NULL
      THEN COALESCE(cancellation_outcome,'connection_aborted_unconfirmed') ELSE cancellation_outcome END
  WHERE status='processing' AND provider_started_at < now()-interval '45 minutes' AND quality_report IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ai_provider_executions e WHERE e.quality_action_id=j.id);
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n+m;
END;
$$;

CREATE FUNCTION public.ai_execution_cancel_requested_internal(_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.ai_provider_executions e
   LEFT JOIN public.ai_generation_jobs g ON e.job_id=g.id AND e.user_id=g.user_id
   LEFT JOIN public.ai_quality_check_actions q ON e.quality_action_id=q.id AND e.user_id=q.user_id
   WHERE e.id=_id AND e.user_id=_user_id AND (g.cancel_requested_at IS NOT NULL OR q.cancel_requested_at IS NOT NULL)
 );
$$;

CREATE FUNCTION public.recoverable_ai_job_ids_internal(_kind text, _limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) FROM (
   SELECT j.id FROM public.ai_generation_jobs j
   JOIN public.ai_provider_executions e ON e.job_id = j.id AND e.user_id = j.user_id
   WHERE _kind = 'generate' AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
     AND j.started_at < now() - interval '15 minutes' AND e.result IS NOT NULL
     AND COALESCE(j.input_payload->>'operation','generate') <> 'revision'
     AND (j.recovery_until IS NULL OR j.recovery_until < now())
   UNION ALL
   SELECT j.id FROM public.ai_quality_check_actions j
   JOIN public.ai_provider_executions e ON e.quality_action_id = j.id AND e.user_id = j.user_id
   WHERE _kind = 'quality_check' AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
     AND j.started_at < now() - interval '15 minutes' AND e.result IS NOT NULL
     AND (j.recovery_until IS NULL OR j.recovery_until < now())
   LIMIT LEAST(GREATEST(_limit,1),20)
 ) selected;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'begin_ai_execution_internal','mark_ai_execution_remote_internal','observe_ai_execution_usage_internal',
      'skip_ai_execution_internal','checkpoint_ai_execution_internal','read_ai_execution_internal',
      'settle_ai_usage_internal','claim_ai_execution_recovery_internal',
      'release_ai_execution_recovery_internal','claim_ai_recovered_job_internal','flush_ai_usage_outbox',
      'recoverable_ai_job_ids_internal','ai_execution_cancel_requested_internal','reap_unjournaled_ai_jobs_internal')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END;
$$;
COMMIT;
