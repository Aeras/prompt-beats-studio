-- PB-014. Additive migration; no scheduler/configuration or historical record changes.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.music_inspiration_jobs
 ADD COLUMN research_version smallint NOT NULL DEFAULT 1 CHECK(research_version IN (1,2)),
 ADD COLUMN planner_model text,
 ADD COLUMN planner_provider text,
 ADD COLUMN planner_execution_id uuid UNIQUE,
 ADD COLUMN planner_pricing_snapshot jsonb CHECK(octet_length(planner_pricing_snapshot::text)<=16384),
 ADD COLUMN planner_result jsonb CHECK(octet_length(planner_result::text)<=2097152),
 ADD COLUMN research_plan jsonb CHECK(jsonb_typeof(research_plan)='object' AND octet_length(research_plan::text)<=65536),
 ADD CONSTRAINT inspiration_planner_identity CHECK(research_version=1 OR
  (planner_model IS NOT NULL AND planner_provider IS NOT NULL AND planner_model='openai/gpt-6-luna' AND planner_provider='openrouter' AND planner_execution_id IS NOT NULL AND planner_execution_id<>execution_id));
CREATE INDEX music_inspiration_jobs_planner ON public.music_inspiration_jobs(planner_model) WHERE research_version=2;
ALTER TABLE public.music_inspiration_dispatches DROP CONSTRAINT music_inspiration_dispatches_kind_check;
ALTER TABLE public.music_inspiration_dispatches ADD CONSTRAINT music_inspiration_dispatches_kind_check CHECK(kind IN ('search','ai','planner'));
CREATE UNIQUE INDEX music_inspiration_one_planner_dispatch ON public.music_inspiration_dispatches(job_id) WHERE kind='planner';

CREATE FUNCTION public.admit_music_inspiration_planner_internal(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.ai_models; selected text;
BEGIN
 PERFORM public.admit_music_inspiration_internal(_user_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 SELECT * INTO m FROM public.ai_models WHERE provider::text='openrouter' AND provider_model_id='openai/gpt-6-luna' AND status='enabled' AND generator_enabled AND generator_compatible;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=m.provider_model_id) THEN RAISE EXCEPTION 'Planner unavailable' USING ERRCODE='42501'; END IF;
 SELECT coalesce((SELECT value->>'model' FROM public.app_settings WHERE key='ai_generator_default_model'),(SELECT value->>'model' FROM public.app_settings WHERE key='ai_model')) INTO selected;
 IF NOT public._is_admin_level_internal(_user_id) AND selected IS DISTINCT FROM m.provider_model_id
 AND NOT EXISTS(SELECT 1 FROM public.user_model_access WHERE user_id=_user_id AND access_mode='custom' AND m.provider_model_id=ANY(allowed_models) AND m.access_policy<>'admin_only') THEN
  RAISE EXCEPTION 'Planner access unavailable' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.start_music_inspiration_job_v3(_user_id uuid,_request_id uuid,_request jsonb,_model text,_provider text,_pricing jsonb,_planner_pricing jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job jsonb; existing boolean;
BEGIN
 PERFORM public.admit_music_inspiration_internal(_user_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('music-inspiration:'||_user_id::text,0));
 SELECT EXISTS(SELECT 1 FROM public.music_inspiration_jobs WHERE user_id=_user_id AND request_id=_request_id) INTO existing;
 IF NOT existing THEN
  PERFORM public.admit_music_inspiration_planner_internal(_user_id);
  IF _planner_pricing IS NULL OR jsonb_typeof(_planner_pricing)<>'object' OR octet_length(_planner_pricing::text)>16384 THEN RAISE EXCEPTION 'Invalid planner prices'; END IF;
 END IF;
 job:=public.start_music_inspiration_job_v2(_user_id,_request_id,_request,_model,_provider,_pricing);
 IF NOT existing THEN
  UPDATE public.music_inspiration_jobs SET research_version=2,planner_model='openai/gpt-6-luna',planner_provider='openrouter',planner_execution_id=gen_random_uuid(),planner_pricing_snapshot=_planner_pricing WHERE id=(job->>'id')::uuid;
 END IF;
 SELECT to_jsonb(j) INTO job FROM public.music_inspiration_jobs j WHERE id=(job->>'id')::uuid;
 RETURN job;
END $$;

-- Old binaries cannot claim new two-stage jobs. Historical jobs keep their exact protocol.
CREATE OR REPLACE FUNCTION public.claim_music_inspiration_job(_job_id uuid,_lease_token uuid)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 IF _lease_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 UPDATE public.music_inspiration_jobs SET research_started_at=coalesce(research_started_at,clock_timestamp()),recovery_attempts=recovery_attempts+CASE WHEN status='queued' THEN 0 ELSE 1 END,status='running',lease_token=_lease_token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=now()
 WHERE id=_job_id AND research_version=1 AND cancel_requested_at IS NULL AND (status='queued' OR (status='running' AND recovery_attempts<3 AND lease_until<clock_timestamp()) OR (status='unknown' AND recovery_attempts<3 AND EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id=music_inspiration_jobs.execution_id AND e.user_id=music_inspiration_jobs.user_id AND e.result IS NOT NULL))) RETURNING * INTO job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN job;
END $$;
CREATE FUNCTION public.claim_music_inspiration_job_v2(_job_id uuid,_lease_token uuid)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 IF _lease_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 UPDATE public.music_inspiration_jobs SET research_started_at=coalesce(research_started_at,clock_timestamp()),recovery_attempts=recovery_attempts+CASE WHEN status='queued' THEN 0 ELSE 1 END,status='running',lease_token=_lease_token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=now()
 WHERE id=_job_id AND cancel_requested_at IS NULL AND (status='queued' OR (status='running' AND recovery_attempts<3 AND lease_until<clock_timestamp()) OR (status='unknown' AND recovery_attempts<3 AND (provider_result IS NOT NULL OR planner_result IS NOT NULL OR EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id IN (music_inspiration_jobs.execution_id,music_inspiration_jobs.planner_execution_id) AND e.user_id=music_inspiration_jobs.user_id AND e.result IS NOT NULL)))) RETURNING * INTO job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN job;
END $$;
CREATE OR REPLACE FUNCTION public.pending_music_inspiration_job_ids()
RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT j.id FROM public.music_inspiration_jobs j WHERE j.cancel_requested_at IS NULL AND (
 j.status='queued' OR (j.status='running' AND j.recovery_attempts<3 AND j.lease_until<clock_timestamp())
 OR (j.status='unknown' AND j.recovery_attempts<3 AND (j.provider_result IS NOT NULL OR j.planner_result IS NOT NULL OR EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id IN(j.execution_id,j.planner_execution_id) AND e.user_id=j.user_id AND e.result IS NOT NULL))))
 ORDER BY CASE WHEN j.status='queued' THEN 0 ELSE 1 END,j.created_at,j.id LIMIT 5;
$$;
CREATE FUNCTION public.checkpoint_music_inspiration_plan(_job_id uuid,_lease_token uuid,_plan jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 IF NOT FOUND OR job.research_version<>2 OR _lease_token IS NULL OR job.lease_token IS DISTINCT FROM _lease_token OR job.lease_until<=clock_timestamp() OR job.status<>'running' OR job.cancel_requested_at IS NOT NULL THEN RAISE EXCEPTION 'Planner lease lost' USING ERRCODE='PT409'; END IF;
 IF _plan IS NULL OR jsonb_typeof(_plan)<>'object' OR _plan->>'version' IS DISTINCT FROM '1' OR _plan->'request' IS DISTINCT FROM job.request OR jsonb_typeof(_plan->'queries') IS DISTINCT FROM 'array' OR jsonb_array_length(_plan->'queries')<>(CASE WHEN job.request->>'depth'='extended' THEN 5 ELSE 2 END) OR octet_length(_plan::text)>65536 THEN RAISE EXCEPTION 'Invalid research plan'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.music_inspiration_dispatches WHERE job_id=_job_id AND dispatch_key=job.planner_execution_id AND kind='planner' AND state='observed') OR job.planner_result IS NULL THEN RAISE EXCEPTION 'Planner evidence required'; END IF;
 IF job.research_plan IS NOT NULL AND job.research_plan IS DISTINCT FROM _plan THEN RAISE EXCEPTION 'Plan is immutable' USING ERRCODE='PT409'; END IF;
 UPDATE public.music_inspiration_jobs SET research_plan=_plan,updated_at=now() WHERE id=_job_id;
END $$;
CREATE OR REPLACE FUNCTION public.reserve_music_inspiration_dispatch(_job_id uuid,_lease_token uuid,_dispatch_key uuid,_kind text,_max_cost numeric,_max_credits integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; owner_id uuid; credit_limit integer;
BEGIN
 SELECT user_id INTO owner_id FROM public.music_inspiration_jobs WHERE id=_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.admit_music_inspiration_internal(owner_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 IF job.status<>'running' OR job.cancel_requested_at IS NOT NULL OR _lease_token IS NULL OR job.lease_token IS DISTINCT FROM _lease_token OR job.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF _dispatch_key IS NULL OR _kind IS NULL OR _kind NOT IN ('search','ai','planner') OR _max_cost IS NULL OR _max_cost::text IN ('NaN','Infinity','-Infinity') OR _max_cost<0 OR _max_credits IS NULL OR _max_credits<0 THEN RAISE EXCEPTION 'Invalid dispatch reservation'; END IF;
 IF job.research_version=2 THEN
  PERFORM public.admit_music_inspiration_planner_internal(owner_id);
  IF (_kind='planner' AND _dispatch_key<>job.planner_execution_id) OR (_kind='ai' AND _dispatch_key<>job.execution_id) OR (_kind<>'planner' AND job.research_plan IS NULL) THEN RAISE EXCEPTION 'Planner stage order violated'; END IF;
 ELSIF _kind='planner' THEN RAISE EXCEPTION 'Legacy job has no planner'; END IF;
 IF EXISTS(SELECT 1 FROM public.music_inspiration_dispatches WHERE (job_id=_job_id AND kind=_kind AND _kind IN ('ai','planner')) OR dispatch_key=_dispatch_key) THEN RETURN false; END IF;
 credit_limit:=CASE WHEN job.request->>'depth'='extended' THEN 5 ELSE 2 END;
 IF job.search_credits+_max_credits>credit_limit OR (_kind IN ('ai','planner') AND _max_credits<>0) OR (_kind='search' AND _max_credits<>1) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id=job.model AND provider::text=job.provider AND status='enabled' AND generator_enabled AND generator_compatible) OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=job.model) THEN RAISE EXCEPTION 'Research model unavailable'; END IF;
 INSERT INTO public.music_inspiration_dispatches(job_id,dispatch_key,kind,max_cost_usd,credits) VALUES(_job_id,_dispatch_key,_kind,_max_cost,_max_credits) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.music_inspiration_jobs SET reserved_usd=reserved_usd+_max_cost,search_credits=search_credits+_max_credits,updated_at=now() WHERE id=_job_id;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.settle_music_inspiration_dispatch(_job_id uuid,_dispatch_key uuid,_state text,_receipt jsonb)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; dispatch public.music_inspiration_dispatches; journal jsonb;
BEGIN
 IF _state IS NULL OR _state NOT IN ('observed','unknown') OR _receipt IS NULL OR jsonb_typeof(_receipt)<>'object' THEN RAISE EXCEPTION 'Invalid dispatch receipt'; END IF;
 SELECT * INTO STRICT job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 SELECT * INTO STRICT dispatch FROM public.music_inspiration_dispatches WHERE job_id=_job_id AND dispatch_key=_dispatch_key FOR UPDATE;
 IF dispatch.state='observed' THEN RETURN job; END IF;
 UPDATE public.music_inspiration_dispatches SET state=_state,receipt=_receipt,updated_at=now() WHERE job_id=_job_id AND dispatch_key=_dispatch_key;
 -- Consumption/raw responses survive cancellation and expired leases. Never infer zero cost.
 IF dispatch.kind IN ('ai','planner') THEN
  SELECT e.result INTO journal FROM public.ai_provider_executions e WHERE e.id=CASE WHEN dispatch.kind='planner' THEN job.planner_execution_id ELSE job.execution_id END AND e.user_id=job.user_id;
  IF dispatch.kind='planner' THEN
   UPDATE public.music_inspiration_jobs SET planner_result=coalesce(planner_result,journal,_receipt->'provider_result'),updated_at=now() WHERE id=_job_id RETURNING * INTO job;
  ELSE
   UPDATE public.music_inspiration_jobs SET provider_result=coalesce(provider_result,journal,_receipt->'provider_result'),updated_at=now() WHERE id=_job_id RETURNING * INTO job;
  END IF;
 END IF;
 RETURN job;
END $$;
CREATE FUNCTION public.guard_music_inspiration_planner_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.music_inspiration_jobs j WHERE j.planner_model=OLD.provider_model_id AND j.planner_provider=OLD.provider::text AND (j.status IN ('queued','running','unknown') OR EXISTS(SELECT 1 FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='planner' AND d.state<>'observed'))) THEN RAISE EXCEPTION 'Planner has active or unreconciled research' USING ERRCODE='23503'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_music_inspiration_planner_delete BEFORE DELETE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.guard_music_inspiration_planner_delete();
CREATE OR REPLACE FUNCTION public.read_music_inspiration_usage_internal(_user_id uuid,_job_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('prices',j.pricing_snapshot,
 'usage',coalesce(NULLIF(e.result->'usage','null'::jsonb),NULLIF(j.provider_result->'usage','null'::jsonb),e.observed_usage),
 'aiDispatched',EXISTS(SELECT 1 FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='ai') OR e.id IS NOT NULL OR j.provider_result IS NOT NULL OR j.status='completed',
 'aiFinal',(e.result->'usage' IS NOT NULL AND e.result->'usage'<>'null'::jsonb) OR (j.provider_result->'usage' IS NOT NULL AND j.provider_result->'usage'<>'null'::jsonb),
 'planner',CASE WHEN j.research_version=2 THEN jsonb_build_object('prices',j.planner_pricing_snapshot,
 'usage',coalesce(NULLIF(p.result->'usage','null'::jsonb),NULLIF(j.planner_result->'usage','null'::jsonb),p.observed_usage),
 'aiDispatched',EXISTS(SELECT 1 FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='planner') OR p.id IS NOT NULL OR j.planner_result IS NOT NULL,
 'aiFinal',(p.result->'usage' IS NOT NULL AND p.result->'usage'<>'null'::jsonb) OR (j.planner_result->'usage' IS NOT NULL AND j.planner_result->'usage'<>'null'::jsonb)) ELSE NULL END,
 'searches',coalesce((SELECT jsonb_agg(jsonb_build_object('state',d.state,'credits',d.receipt->'credits')) FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='search'),'[]'::jsonb))
 FROM public.music_inspiration_jobs j LEFT JOIN public.ai_provider_executions e ON e.id=j.execution_id AND e.user_id=j.user_id LEFT JOIN public.ai_provider_executions p ON p.id=j.planner_execution_id AND p.user_id=j.user_id WHERE j.id=_job_id AND j.user_id=_user_id;
$$;
REVOKE ALL ON FUNCTION public.admit_music_inspiration_planner_internal(uuid),public.start_music_inspiration_job_v3(uuid,uuid,jsonb,text,text,jsonb,jsonb),public.claim_music_inspiration_job_v2(uuid,uuid),public.checkpoint_music_inspiration_plan(uuid,uuid,jsonb),public.guard_music_inspiration_planner_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_music_inspiration_planner_internal(uuid),public.start_music_inspiration_job_v3(uuid,uuid,jsonb,text,text,jsonb,jsonb),public.claim_music_inspiration_job_v2(uuid,uuid),public.checkpoint_music_inspiration_plan(uuid,uuid,jsonb) TO service_role;
COMMIT;
