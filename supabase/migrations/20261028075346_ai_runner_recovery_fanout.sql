BEGIN;
SET LOCAL lock_timeout='5s';
-- Operational delivery receipts, not financial/provider execution receipts.
CREATE TABLE public.ai_runner_deliveries (
 kind text NOT NULL CHECK(kind IN ('sweep','generate','quality','inspiration','recovery','validation','maintenance')),
 target text NOT NULL, queued_at timestamptz NOT NULL, PRIMARY KEY(kind,target)
);
ALTER TABLE public.ai_runner_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_runner_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_runner_deliveries TO service_role;

CREATE FUNCTION public.enqueue_ai_runner_request_internal(_kind text,_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_token text; v_body jsonb; v_key text;
BEGIN
 SELECT value#>>'{}' INTO v_url FROM public.app_settings WHERE key='runner_url';
 SELECT value#>>'{}' INTO v_token FROM public.app_settings WHERE key='runner_token';
 IF v_url IS NULL OR v_url !~ '^https://[A-Za-z0-9.-]+/api/public/jobs/run$' OR coalesce(length(v_token),0)<16 THEN
  RAISE EXCEPTION 'Runner configuration unavailable';
 END IF;
 v_key:=CASE _kind WHEN 'generate' THEN 'jobId' WHEN 'quality' THEN 'qualityActionId' WHEN 'inspiration' THEN 'musicInspirationJobId' WHEN 'recovery' THEN 'recoveryExecutionId' WHEN 'validation' THEN 'validationJobId' WHEN 'maintenance' THEN 'maintenance' END;
 IF v_key IS NULL OR (_kind<>'maintenance' AND _id IS NULL) THEN RAISE EXCEPTION 'Invalid runner target'; END IF;
 INSERT INTO public.ai_runner_deliveries(kind,target,queued_at) VALUES(_kind,coalesce(_id::text,'singleton'),clock_timestamp())
 ON CONFLICT(kind,target) DO UPDATE SET queued_at=EXCLUDED.queued_at
 WHERE public.ai_runner_deliveries.queued_at<clock_timestamp()-interval '90 seconds';
 IF NOT FOUND THEN RETURN false; END IF;
 v_body:=CASE WHEN _kind='maintenance' THEN jsonb_build_object('maintenance',true) ELSE jsonb_build_object(v_key,_id) END;
 PERFORM net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-runner-token',v_token),body:=v_body,timeout_milliseconds:=170000);
 RETURN true;
END $$;

CREATE FUNCTION public.dispatch_ai_runner_sweep_internal()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; queued integer:=0; failed integer:=0;
BEGIN
 -- Nonblocking serialization across cron, legacy HTTP sweeps and external schedulers.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('promptbeats:runner:sweep',0)) THEN RETURN jsonb_build_object('queued',0,'busy',true); END IF;
 INSERT INTO public.ai_runner_deliveries(kind,target,queued_at) VALUES('sweep','singleton',clock_timestamp())
 ON CONFLICT(kind,target) DO UPDATE SET queued_at=EXCLUDED.queued_at WHERE public.ai_runner_deliveries.queued_at<clock_timestamp()-interval '45 seconds';
 IF NOT FOUND THEN RETURN jsonb_build_object('queued',0,'cooldown',true); END IF;
 FOR candidate IN
  WITH generations AS (
   SELECT j.id FROM public.ai_generation_jobs j WHERE status='pending' AND dismissed_at IS NULL AND created_at>now()-interval '30 minutes' AND cancel_requested_at IS NULL
   UNION SELECT value::text::uuid FROM jsonb_array_elements_text(public.recoverable_ai_job_ids_internal('generate',2))
  ), quality AS (
   SELECT j.id FROM public.ai_quality_check_actions j WHERE cancel_requested_at IS NULL AND ((status='pending' AND created_at>now()-interval '30 minutes') OR (status='processing' AND quality_report IS NOT NULL))
   UNION SELECT value::text::uuid FROM jsonb_array_elements_text(public.recoverable_ai_job_ids_internal('quality_check',2))
  )
  SELECT 'generate'::text kind,id FROM (SELECT id FROM generations ORDER BY id LIMIT 2) g
  UNION ALL SELECT 'quality',id FROM (SELECT id FROM quality ORDER BY id LIMIT 2) q
  UNION ALL SELECT 'inspiration',id FROM (SELECT id FROM public.pending_music_inspiration_job_ids() LIMIT 2) i
  UNION ALL SELECT 'recovery',id FROM (SELECT id FROM public.ai_provider_executions WHERE application_resolution IS NULL AND state<>'not_dispatched' AND next_recovery_at<=now() AND recovery_attempts<8 AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_recovery_at,id LIMIT 2) e
  UNION ALL SELECT 'validation',job_id FROM (SELECT e.job_id FROM public.ai_provider_executions e JOIN public.ai_generation_jobs j ON j.id=e.job_id AND j.user_id=e.user_id WHERE e.application_resolution IS NULL AND e.state='response_observed' AND e.result IS NOT NULL AND j.status='failed' AND j.completed_at IS NOT NULL AND j.cancel_requested_at IS NULL AND coalesce(j.input_payload->>'operation','generate') IN ('generate','revision') AND public.ai_execution_usage_is_final(e) IS TRUE AND (e.application_validation_checked_at IS NULL OR e.application_validation_checked_at<now()-interval '15 minutes') ORDER BY e.created_at,e.id LIMIT 2) v
  UNION ALL SELECT 'maintenance',NULL::uuid
 LOOP
  BEGIN
   IF public.enqueue_ai_runner_request_internal(candidate.kind,candidate.id) THEN
    queued:=queued+1;
    IF candidate.kind='validation' THEN UPDATE public.ai_provider_executions SET application_validation_checked_at=now() WHERE job_id=candidate.id; END IF;
   END IF;
  EXCEPTION WHEN OTHERS THEN failed:=failed+1; -- No raw error, URL or token returned.
  END;
 END LOOP;
 RETURN jsonb_build_object('queued',queued,'failed',failed);
END $$;

CREATE FUNCTION public.claim_ai_execution_recovery_by_id_internal(_id uuid)
RETURNS SETOF public.ai_provider_executions LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.ai_provider_executions SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',recovery_attempts=recovery_attempts+1
 WHERE id IN (SELECT id FROM public.ai_provider_executions WHERE id=_id AND application_resolution IS NULL AND state<>'not_dispatched' AND next_recovery_at<=now() AND recovery_attempts<8 AND (lease_until IS NULL OR lease_until<now()) FOR UPDATE SKIP LOCKED)
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.enqueue_ai_runner_request_internal(text,uuid),public.dispatch_ai_runner_sweep_internal(),public.claim_ai_execution_recovery_by_id_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_runner_request_internal(text,uuid),public.dispatch_ai_runner_sweep_internal(),public.claim_ai_execution_recovery_by_id_internal(uuid) TO service_role;
-- No cron.schedule, no secret/config changes. Activation is a separate approved runbook step.
ALTER TABLE public.music_inspiration_jobs ADD COLUMN research_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_music_inspiration_job(_job_id uuid,_lease_token uuid)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 IF _lease_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 UPDATE public.music_inspiration_jobs SET research_started_at=coalesce(research_started_at,clock_timestamp()),recovery_attempts=recovery_attempts+CASE WHEN status='queued' THEN 0 ELSE 1 END,status='running',lease_token=_lease_token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=now()
 WHERE id=_job_id AND cancel_requested_at IS NULL AND (status='queued' OR (status='running' AND recovery_attempts<3 AND lease_until<clock_timestamp()) OR (status='unknown' AND recovery_attempts<3 AND EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id=music_inspiration_jobs.execution_id AND e.user_id=music_inspiration_jobs.user_id AND e.result IS NOT NULL))) RETURNING * INTO job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN job;
END $$;


COMMIT;
