BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.ai_provider_executions
 ADD COLUMN application_resolution text CHECK(application_resolution IN ('invalid_response','incomplete_response')),
 ADD COLUMN application_resolved_at timestamptz,
 ADD COLUMN application_validation_checked_at timestamptz,
 ADD CONSTRAINT ai_execution_resolution_pair CHECK((application_resolution IS NULL)=(application_resolved_at IS NULL));

CREATE FUNCTION public.capture_generation_model_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='ai_generation_jobs' THEN
  NEW.model:=coalesce(NEW.model,nullif(NEW.input_payload->>'generationModel',''),(SELECT value->>'model' FROM public.app_settings WHERE key='ai_generator_default_model'));
  IF NEW.model IS NOT NULL THEN
   NEW.input_payload:=jsonb_set(NEW.input_payload,'{generationModel}',to_jsonb(NEW.model));
   SELECT provider INTO NEW.provider FROM public.ai_models WHERE provider_model_id=NEW.model;
  END IF;
 ELSE
  -- Actual server-resolved dispatch identity is authoritative, including legacy NULL jobs.
  UPDATE public.ai_generation_jobs SET model=NEW.model,provider=NEW.provider
   WHERE id=NEW.job_id AND user_id=NEW.user_id AND status='processing';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_generation_model_identity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER capture_generation_model_identity BEFORE INSERT ON public.ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.capture_generation_model_identity();
CREATE TRIGGER capture_generation_model_identity BEFORE INSERT ON public.ai_provider_executions FOR EACH ROW EXECUTE FUNCTION public.capture_generation_model_identity();

CREATE FUNCTION public.ai_execution_usage_is_final(_e public.ai_provider_executions) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_typeof(_e.observed_usage)='object' AND coalesce(_e.observed_usage->>'inputTokens',_e.observed_usage->>'outputTokens',_e.observed_usage->>'totalTokens',_e.observed_usage->>'reasoningTokens',_e.observed_usage->>'providerReportedCostUsd') IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.ai_usage_logs l WHERE l.id=_e.id AND l.user_id=_e.user_id
 AND l.provider=_e.provider AND l.model=_e.model AND l.operation=_e.operation AND l.provider_usage_state='final'
 AND l.input_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'inputTokens','')::integer
 AND l.output_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'outputTokens','')::integer
 AND l.total_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'totalTokens','')::integer
 AND l.reasoning_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'reasoningTokens','')::integer
 AND l.cached_input_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'cachedInputTokens','')::integer
 AND l.cache_write_tokens IS NOT DISTINCT FROM NULLIF(_e.observed_usage->>'cacheWriteTokens','')::integer
 AND (NULLIF(_e.observed_usage->>'providerReportedCostUsd','') IS NULL OR l.provider_reported_cost_usd=(_e.observed_usage->>'providerReportedCostUsd')::numeric(20,10))
 ) AND NOT EXISTS(SELECT 1 FROM public.ai_usage_outbox o WHERE o.id=_e.id OR o.payload->>'id'=_e.id::text);
$$;
REVOKE ALL ON FUNCTION public.ai_execution_usage_is_final(public.ai_provider_executions) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.resolve_failed_generation_internal(_execution_id uuid,_user_id uuid,_job_id uuid,_expected_result jsonb,_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.ai_provider_executions; j public.ai_generation_jobs;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fresh transaction required' USING ERRCODE='40001'; END IF;
 -- NOWAIT prevents lock inversion with existing claim/cancel/finalize transactions.
 SELECT * INTO e FROM public.ai_provider_executions WHERE id=_execution_id AND user_id=_user_id AND job_id=_job_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO j FROM public.ai_generation_jobs WHERE id=_job_id AND user_id=_user_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR j.status<>'failed' OR j.completed_at IS NULL OR j.cancel_requested_at IS NOT NULL
  OR coalesce(j.input_payload->>'operation','generate') NOT IN ('generate','revision')
  OR e.state<>'response_observed' OR e.result IS NULL OR _expected_result IS DISTINCT FROM e.result
  OR _reason IS NULL OR _reason NOT IN ('invalid_response','incomplete_response')
  OR (_reason='invalid_response' AND e.result->>'stopReason' IS DISTINCT FROM 'end_turn')
  OR (_reason='incomplete_response' AND e.result->>'stopReason' IS DISTINCT FROM 'max_tokens')
  OR public.ai_execution_usage_is_final(e) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF e.application_resolution IS NOT NULL THEN RETURN e.application_resolution=_reason; END IF;
 UPDATE public.ai_provider_executions SET application_resolution=_reason,application_resolved_at=now() WHERE id=e.id;
 UPDATE public.ai_generation_jobs SET model=coalesce(model,e.model),provider=coalesce(provider,e.provider) WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.resolve_failed_generation_internal(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_failed_generation_internal(uuid,uuid,uuid,jsonb,text) TO service_role;

-- A bounded no-provider validation queue, independent of exhausted provider/application retries.
CREATE FUNCTION public.claim_failed_generation_validation_internal() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH claimed AS (
 UPDATE public.ai_provider_executions e SET application_validation_checked_at=now()
 WHERE e.id IN (
  SELECT e2.id FROM public.ai_provider_executions e2 JOIN public.ai_generation_jobs j ON j.id=e2.job_id AND j.user_id=e2.user_id
  WHERE e2.application_resolution IS NULL AND e2.state='response_observed' AND e2.result IS NOT NULL
   AND j.status='failed' AND j.completed_at IS NOT NULL AND j.cancel_requested_at IS NULL
   AND coalesce(j.input_payload->>'operation','generate') IN ('generate','revision')
   AND public.ai_execution_usage_is_final(e2) IS TRUE
   AND (e2.application_validation_checked_at IS NULL OR e2.application_validation_checked_at<now()-interval '15 minutes')
  ORDER BY e2.application_validation_checked_at NULLS FIRST,e2.created_at LIMIT 20 FOR UPDATE OF e2 SKIP LOCKED
 ) RETURNING e.job_id,e.user_id)
 SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) FROM claimed;
$$;
REVOKE ALL ON FUNCTION public.claim_failed_generation_validation_internal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_failed_generation_validation_internal() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_execution_recovery_internal()
RETURNS SETOF public.ai_provider_executions LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  UPDATE public.ai_provider_executions SET lease_token = gen_random_uuid(),
    lease_until = now() + interval '2 minutes', recovery_attempts = recovery_attempts + 1
  WHERE id IN (SELECT id FROM public.ai_provider_executions
    WHERE application_resolution IS NULL AND state <> 'not_dispatched' AND next_recovery_at <= now() AND recovery_attempts < 8
      AND (lease_until IS NULL OR lease_until < now())
    ORDER BY next_recovery_at LIMIT 5 FOR UPDATE SKIP LOCKED)
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_recovered_job_internal(_kind text, _id uuid)
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
        AND e.user_id = j.user_id AND e.application_resolution IS NULL AND e.result IS NOT NULL AND e.application_recovery_attempts < 8)
    RETURNING to_jsonb(j) INTO v_job;
  ELSIF _kind = 'quality_check' THEN
    UPDATE public.ai_quality_check_actions j SET recovery_until = now() + interval '15 minutes',status='processing'
    WHERE j.id = _id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
      AND (j.recovery_until IS NULL OR j.recovery_until < now())
      AND j.started_at < now() - interval '15 minutes'
      AND EXISTS (SELECT 1 FROM public.ai_provider_executions e WHERE e.quality_action_id = j.id
        AND e.user_id = j.user_id AND e.application_resolution IS NULL AND e.result IS NOT NULL AND e.application_recovery_attempts < 8)
    RETURNING to_jsonb(j) INTO v_job;
  END IF;
  IF v_job IS NOT NULL THEN
    UPDATE public.ai_provider_executions SET application_recovery_attempts = application_recovery_attempts + 1
      WHERE ((_kind = 'generate' AND job_id = _id) OR (_kind = 'quality_check' AND quality_action_id = _id))
        AND application_recovery_attempts < 8;
    IF NOT FOUND THEN RAISE EXCEPTION 'application recovery exhausted'; END IF;
  END IF;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.recoverable_ai_job_ids_internal(_kind text, _limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) FROM (
   SELECT j.id FROM public.ai_generation_jobs j
   JOIN public.ai_provider_executions e ON e.job_id = j.id AND e.user_id = j.user_id
   WHERE _kind = 'generate' AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
     AND j.started_at < now() - interval '15 minutes' AND e.application_resolution IS NULL AND e.result IS NOT NULL AND e.application_recovery_attempts < 8
     AND COALESCE(j.input_payload->>'operation','generate') <> 'revision'
     AND (j.recovery_until IS NULL OR j.recovery_until < now())
   UNION ALL
   SELECT j.id FROM public.ai_quality_check_actions j
   JOIN public.ai_provider_executions e ON e.quality_action_id = j.id AND e.user_id = j.user_id
   WHERE _kind = 'quality_check' AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL
     AND j.started_at < now() - interval '15 minutes' AND e.application_resolution IS NULL AND e.result IS NOT NULL AND e.application_recovery_attempts < 8
     AND (j.recovery_until IS NULL OR j.recovery_until < now())
   LIMIT LEAST(GREATEST(_limit,1),20)
 ) selected;
$$;

CREATE OR REPLACE FUNCTION public.ai_model_uninstall_reasons(_model public.ai_models) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE reasons text[]:='{}'; k text;
BEGIN
 FOR k IN SELECT key FROM public.app_settings WHERE key IN ('ai_generator_default_model','ai_quality_check_default_model','ai_tools_default_model')
  AND (value->>'model'=_model.provider_model_id OR value->>'registryId'=_model.id::text) LOOP
  reasons:=array_append(reasons,'default:'||k);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'generationModel',input_payload->>'model')=_model.provider_model_id)
  OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions WHERE status IN ('pending','processing') AND coalesce(model,input_payload->>'qualityCheckModel',input_payload->>'model')=_model.provider_model_id) THEN reasons:=array_append(reasons,'active_jobs'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.model=_model.provider_model_id AND (
  e.state IN ('execution_unknown','accepted') OR (e.result IS NOT NULL AND e.application_resolution IS NULL AND (
   EXISTS(SELECT 1 FROM public.ai_generation_jobs j WHERE j.id=e.job_id AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.ai_quality_check_actions q WHERE q.id=e.quality_action_id AND q.status IN ('processing','failed') AND q.cancel_requested_at IS NULL))))) THEN reasons:=array_append(reasons,'unresolved_execution'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.model=_model.provider_model_id AND e.state<>'not_dispatched' AND public.ai_execution_usage_is_final(e) IS DISTINCT FROM true) THEN reasons:=array_append(reasons,'accounting_pending'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_provider_executions e JOIN public.ai_generation_jobs j ON j.id=e.job_id AND j.user_id=e.user_id WHERE e.model=_model.provider_model_id AND e.result IS NOT NULL AND e.application_resolution IS NULL AND j.status IN ('processing','failed') AND j.cancel_requested_at IS NULL) THEN reasons:=array_append(reasons,'recovery_pending'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_usage_outbox WHERE payload->>'model'=_model.provider_model_id) THEN reasons:=array_append(reasons,'usage_pending'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_auxiliary_model_uses u JOIN public.ai_auxiliary_requests r ON r.id=u.request_id WHERE u.model=_model.provider_model_id AND (r.status IN ('pending','processing') OR u.receipt_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_usage_logs l WHERE l.id=u.receipt_id AND l.user_id=u.user_id AND l.model=u.model AND l.provider_usage_state='final'))) THEN reasons:=array_append(reasons,'active_auxiliary'); END IF;
 IF NOT public.ai_legacy_fallback_safe(ARRAY[_model.provider_model_id]) THEN reasons:=array_append(reasons,'legacy_fallback'); END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.ai_models'::regclass) THEN reasons:=array_append(reasons,'foreign_key'); END IF;
 RETURN reasons;
END $$;
COMMIT;
