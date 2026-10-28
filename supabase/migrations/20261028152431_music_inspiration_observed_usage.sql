BEGIN;
SET LOCAL lock_timeout='5s';
-- Owner explicitly removed research monetary caps. Preserve historical evidence.
-- Legacy budget_usd=1 is only a compatibility sentinel for old readers, never an admission limit.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname,conrelid::regclass tbl FROM pg_constraint
 WHERE contype='c' AND conrelid IN ('public.music_inspiration_jobs'::regclass,'public.music_inspiration_dispatches'::regclass)
 AND pg_get_constraintdef(oid) ~ '(budget_usd|reserved_usd|max_cost_usd)' LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.tbl,item.conname);
 END LOOP;
END $$;
ALTER TABLE public.music_inspiration_jobs ADD CONSTRAINT inspiration_legacy_amounts_finite
 CHECK(budget_usd>=0 AND reserved_usd>=0 AND budget_usd::text NOT IN ('NaN','Infinity','-Infinity') AND reserved_usd::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE public.music_inspiration_dispatches ADD CONSTRAINT inspiration_dispatch_amount_finite
 CHECK(max_cost_usd>=0 AND max_cost_usd::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE public.music_inspiration_jobs ADD COLUMN pricing_snapshot jsonb
 CHECK(pricing_snapshot IS NULL OR (jsonb_typeof(pricing_snapshot)='object' AND octet_length(pricing_snapshot::text)<=16384));
CREATE TABLE public.music_inspiration_abandoned_requests (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.music_inspiration_abandoned_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.music_inspiration_abandoned_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.music_inspiration_abandoned_requests TO service_role;

CREATE OR REPLACE FUNCTION public.start_music_inspiration_job(_user_id uuid,_request_id uuid,_request jsonb,_model text,_provider text,_budget numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; depth text;
BEGIN
 PERFORM public.admit_music_inspiration_internal(_user_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('music-inspiration:'||_user_id::text,0));
 IF EXISTS(SELECT 1 FROM public.music_inspiration_abandoned_requests WHERE user_id=_user_id AND request_id=_request_id) THEN
  RAISE EXCEPTION 'Research request abandoned' USING ERRCODE='PT409'; END IF;
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE user_id=_user_id AND request_id=_request_id;
 IF FOUND THEN
  IF job.request IS DISTINCT FROM _request OR job.model IS DISTINCT FROM _model OR job.provider IS DISTINCT FROM _provider THEN
   RAISE EXCEPTION 'Music inspiration idempotency conflict' USING ERRCODE='PT409';
  END IF;
  RETURN to_jsonb(job);
 END IF;
 depth:=_request->>'depth';
 IF _request_id IS NULL OR _request IS NULL OR jsonb_typeof(_request)<>'object' OR depth IS NULL OR depth NOT IN ('standard','extended')
 THEN RAISE EXCEPTION 'Invalid music inspiration request'; END IF;
 IF depth='extended' AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text='super_admin' AND moderation_status='active') THEN
  RAISE EXCEPTION 'Extended research requires Super Admin' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id=_model AND provider::text=_provider AND status='enabled' AND generator_enabled AND generator_compatible)
  OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=_model) THEN RAISE EXCEPTION 'Research model unavailable'; END IF;
 INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd)
 VALUES(_user_id,_request_id,_request,_model,_provider,1) RETURNING * INTO job;
 RETURN to_jsonb(job);
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
 IF _dispatch_key IS NULL OR _kind IS NULL OR _kind NOT IN ('search','ai') OR _max_cost IS NULL OR _max_cost::text IN ('NaN','Infinity','-Infinity') OR _max_cost<0 OR _max_credits IS NULL OR _max_credits<0 THEN RAISE EXCEPTION 'Invalid dispatch reservation'; END IF;
 IF EXISTS(SELECT 1 FROM public.music_inspiration_dispatches WHERE (job_id=_job_id AND kind='ai' AND _kind='ai') OR dispatch_key=_dispatch_key) THEN RETURN false; END IF;
 credit_limit:=CASE WHEN job.request->>'depth'='extended' THEN 5 ELSE 2 END;
 IF job.search_credits+_max_credits>credit_limit OR (_kind='ai' AND _max_credits<>0) OR (_kind='search' AND _max_credits<1) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id=job.model AND provider::text=job.provider AND status='enabled' AND generator_enabled AND generator_compatible)
  OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=job.model) THEN RAISE EXCEPTION 'Research model unavailable'; END IF;
 INSERT INTO public.music_inspiration_dispatches(job_id,dispatch_key,kind,max_cost_usd,credits) VALUES(_job_id,_dispatch_key,_kind,_max_cost,_max_credits) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.music_inspiration_jobs SET reserved_usd=reserved_usd+_max_cost,search_credits=search_credits+_max_credits,updated_at=now() WHERE id=_job_id;
 -- Commit this reservation before making any external call. Never replay started/unknown.
 RETURN true;
END $$;
CREATE FUNCTION public.start_music_inspiration_job_v2(_user_id uuid,_request_id uuid,_request jsonb,_model text,_provider text,_pricing jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job jsonb;
BEGIN
 IF _pricing IS NULL OR jsonb_typeof(_pricing)<>'object' OR octet_length(_pricing::text)>16384 THEN RAISE EXCEPTION 'Invalid price snapshot'; END IF;
 job:=public.start_music_inspiration_job(_user_id,_request_id,_request,_model,_provider,0);
 UPDATE public.music_inspiration_jobs SET pricing_snapshot=_pricing WHERE id=(job->>'id')::uuid AND pricing_snapshot IS NULL;
 SELECT to_jsonb(j) INTO job FROM public.music_inspiration_jobs j WHERE id=(job->>'id')::uuid;
 RETURN job;
END $$;
CREATE FUNCTION public.abandon_music_inspiration_request_internal(_user_id uuid,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job jsonb;
BEGIN
 IF _request_id IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'Request identity required'; END IF;
 PERFORM public._lock_user_security_state(_user_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('music-inspiration:'||_user_id::text,0));
 SELECT to_jsonb(j) INTO job FROM public.music_inspiration_jobs j WHERE user_id=_user_id AND request_id=_request_id;
 IF FOUND THEN RETURN job; END IF;
 INSERT INTO public.music_inspiration_abandoned_requests(user_id,request_id) VALUES(_user_id,_request_id) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
CREATE FUNCTION public.read_music_inspiration_usage_internal(_user_id uuid,_job_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('prices',j.pricing_snapshot,
 'usage',coalesce(NULLIF(e.result->'usage','null'::jsonb),NULLIF(j.provider_result->'usage','null'::jsonb),e.observed_usage),
 'aiDispatched',EXISTS(SELECT 1 FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='ai') OR e.id IS NOT NULL OR j.provider_result IS NOT NULL OR j.status='completed',
 'aiFinal',(e.result->'usage' IS NOT NULL AND e.result->'usage'<>'null'::jsonb) OR (j.provider_result->'usage' IS NOT NULL AND j.provider_result->'usage'<>'null'::jsonb),
 'searches',coalesce((SELECT jsonb_agg(jsonb_build_object('state',d.state,'credits',d.receipt->'credits')) FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='search'),'[]'::jsonb))
 FROM public.music_inspiration_jobs j LEFT JOIN public.ai_provider_executions e ON e.id=j.execution_id AND e.user_id=j.user_id WHERE j.id=_job_id AND j.user_id=_user_id;
$$;
REVOKE ALL ON FUNCTION public.start_music_inspiration_job_v2(uuid,uuid,jsonb,text,text,jsonb),public.abandon_music_inspiration_request_internal(uuid,uuid),public.read_music_inspiration_usage_internal(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_music_inspiration_job_v2(uuid,uuid,jsonb,text,text,jsonb),public.abandon_music_inspiration_request_internal(uuid,uuid),public.read_music_inspiration_usage_internal(uuid,uuid) TO service_role;
COMMIT;
