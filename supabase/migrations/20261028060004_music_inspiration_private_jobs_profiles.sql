-- Forward-only, code-only release. No runner configuration or cron mutation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT public.register_beta_feature('ai_music_inspiration','AI Music Inspiration','Private evidence-based music research and reusable Generator profiles.');

CREATE TABLE public.music_inspiration_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND octet_length(request::text)<=65536),
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 240), provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 80),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled','unknown')),
 result jsonb CHECK(octet_length(result::text)<=2097152), provider_result jsonb CHECK(octet_length(provider_result::text)<=2097152),
 execution_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 budget_usd numeric NOT NULL CHECK(budget_usd>0 AND budget_usd<=1),
 reserved_usd numeric NOT NULL DEFAULT 0 CHECK(reserved_usd>=0 AND reserved_usd<=budget_usd),
 search_credits integer NOT NULL DEFAULT 0 CHECK(search_credits BETWEEN 0 AND 40),
 recovery_attempts integer NOT NULL DEFAULT 0 CHECK(recovery_attempts BETWEEN 0 AND 3),
 cancel_requested_at timestamptz, lease_token uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 error_code text CHECK(length(error_code)<=160), UNIQUE(user_id,request_id)
);
CREATE INDEX music_inspiration_jobs_owner_created ON public.music_inspiration_jobs(user_id,created_at DESC);
CREATE INDEX music_inspiration_jobs_recovery ON public.music_inspiration_jobs(lease_until,created_at) WHERE status IN ('queued','running','unknown');
CREATE INDEX music_inspiration_jobs_model ON public.music_inspiration_jobs(model);
CREATE TABLE public.music_inspiration_dispatches (
 job_id uuid NOT NULL REFERENCES public.music_inspiration_jobs(id) ON DELETE CASCADE,
 dispatch_key uuid NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('search','ai')),
 max_cost_usd numeric NOT NULL CHECK(max_cost_usd>0 AND max_cost_usd<=1),
 credits integer NOT NULL CHECK(credits BETWEEN 0 AND 40),
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','observed','unknown')),
 receipt jsonb CHECK(octet_length(receipt::text)<=2097152),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,dispatch_key)
);
CREATE UNIQUE INDEX music_inspiration_one_ai_dispatch ON public.music_inspiration_dispatches(job_id) WHERE kind='ai';
CREATE TABLE public.music_inspiration_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=2097152),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX music_inspiration_profiles_owner ON public.music_inspiration_profiles(owner_id,updated_at DESC);
ALTER TABLE public.music_inspiration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_inspiration_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_inspiration_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.music_inspiration_jobs,public.music_inspiration_dispatches,public.music_inspiration_profiles FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.music_inspiration_jobs,public.music_inspiration_dispatches,public.music_inspiration_profiles TO service_role;
GRANT SELECT ON public.music_inspiration_jobs,public.music_inspiration_profiles TO authenticated;

-- Caller-bound lifecycle access: Beta cohort and promoted policies use the standard helper.
CREATE FUNCTION public.music_inspiration_access(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _user_id=auth.uid() AND public.current_user_can_use_feature('ai_music_inspiration')
  AND NOT EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key='ai_music_inspiration' AND stage='archived');
$$;
REVOKE ALL ON FUNCTION public.music_inspiration_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.music_inspiration_access(uuid) TO authenticated;
CREATE POLICY music_inspiration_jobs_owner ON public.music_inspiration_jobs FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND public.music_inspiration_access((SELECT auth.uid())));
CREATE POLICY music_inspiration_profiles_owner ON public.music_inspiration_profiles FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()) AND public.music_inspiration_access((SELECT auth.uid())));

CREATE FUNCTION public.admit_music_inspiration_internal(_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_sub text:=current_setting('request.jwt.claim.sub',true); allowed boolean;
BEGIN
 PERFORM public._lock_user_security_state(_user_id);
 -- Serialize with lifecycle changes as well as account/tester revocation.
 PERFORM 1 FROM public.beta_features WHERE feature_key='ai_music_inspiration' FOR SHARE;
 -- Existing can_use_feature is caller-bound; scope the trusted service owner locally.
 PERFORM set_config('request.jwt.claim.sub',_user_id::text,true);
 allowed:=public.music_inspiration_access(_user_id) AND public.can_use_feature(_user_id,'ai_generator');
 PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 IF allowed IS NOT TRUE THEN RAISE EXCEPTION 'Music inspiration unavailable' USING ERRCODE='42501'; END IF;
 PERFORM public.admit_global_ai_dispatch_internal();
END $$;

CREATE FUNCTION public.kick_music_inspiration_runner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE runner_url text; runner_token text;
BEGIN
 SELECT value #>> '{}' INTO runner_url FROM public.app_settings WHERE key='runner_url';
 SELECT value #>> '{}' INTO runner_token FROM public.app_settings WHERE key='runner_token';
 IF runner_url IS NOT NULL AND runner_token IS NOT NULL THEN
  PERFORM net.http_post(url:=runner_url,headers:=jsonb_build_object('Content-Type','application/json','x-runner-token',runner_token),
   body:=jsonb_build_object('musicInspirationJobId',NEW.id),timeout_milliseconds:=170000);
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- Existing runner sweep is the backstop.
END $$;
CREATE TRIGGER kick_music_inspiration_runner AFTER INSERT ON public.music_inspiration_jobs FOR EACH ROW EXECUTE FUNCTION public.kick_music_inspiration_runner();
CREATE TRIGGER ai_model_registry_fence BEFORE INSERT OR UPDATE OR DELETE ON public.music_inspiration_jobs FOR EACH STATEMENT EXECUTE FUNCTION public.ai_model_registry_fence();

CREATE FUNCTION public.start_music_inspiration_job(_user_id uuid,_request_id uuid,_request jsonb,_model text,_provider text,_budget numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; depth text;
BEGIN
 PERFORM public.admit_music_inspiration_internal(_user_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('music-inspiration:'||_user_id::text,0));
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE user_id=_user_id AND request_id=_request_id;
 IF FOUND THEN
  IF job.request IS DISTINCT FROM _request OR job.model IS DISTINCT FROM _model OR job.provider IS DISTINCT FROM _provider OR job.budget_usd IS DISTINCT FROM _budget THEN
   RAISE EXCEPTION 'Music inspiration idempotency conflict' USING ERRCODE='PT409';
  END IF;
  RETURN to_jsonb(job);
 END IF;
 depth:=_request->>'depth';
 IF _request_id IS NULL OR _request IS NULL OR jsonb_typeof(_request)<>'object' OR depth IS NULL OR depth NOT IN ('standard','extended')
  OR _budget IS NULL OR _budget::text IN ('NaN','Infinity','-Infinity') OR _budget<=0
  OR _budget>(CASE WHEN depth='extended' THEN 1 ELSE 0.25 END) THEN RAISE EXCEPTION 'Invalid music inspiration request/budget'; END IF;
 IF depth='extended' AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text='super_admin' AND moderation_status='active') THEN
  RAISE EXCEPTION 'Extended research requires Super Admin' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id=_model AND provider::text=_provider AND status='enabled' AND generator_enabled AND generator_compatible)
  OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=_model) THEN RAISE EXCEPTION 'Research model unavailable'; END IF;
 IF (SELECT count(*) FROM public.music_inspiration_jobs WHERE user_id=_user_id AND created_at>now()-interval '1 hour')>=4
  OR (SELECT coalesce(sum(budget_usd),0) FROM public.music_inspiration_jobs WHERE user_id=_user_id AND created_at>now()-interval '24 hours')+_budget>2 THEN
  RAISE EXCEPTION 'Music inspiration quota exceeded' USING ERRCODE='PT429'; END IF;
 INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd)
 VALUES(_user_id,_request_id,_request,_model,_provider,_budget) RETURNING * INTO job;
 RETURN to_jsonb(job);
END $$;

CREATE FUNCTION public.claim_music_inspiration_job(_job_id uuid,_lease_token uuid)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 IF _lease_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
 UPDATE public.music_inspiration_jobs SET recovery_attempts=recovery_attempts+CASE WHEN status='queued' THEN 0 ELSE 1 END,status='running',lease_token=_lease_token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=now()
 WHERE id=_job_id AND cancel_requested_at IS NULL AND (status='queued' OR (status='running' AND recovery_attempts<3 AND lease_until<clock_timestamp()) OR (status='unknown' AND recovery_attempts<3 AND EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id=music_inspiration_jobs.execution_id AND e.user_id=music_inspiration_jobs.user_id AND e.result IS NOT NULL))) RETURNING * INTO job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN job;
END $$;

-- Discovery and atomic claim share eligibility. Discovery does not grant a lease.
-- Blocked unknowns never occupy the five slots ahead of newly queued work.
CREATE FUNCTION public.pending_music_inspiration_job_ids()
RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT j.id FROM public.music_inspiration_jobs j
 WHERE j.cancel_requested_at IS NULL AND (
  j.status='queued'
  OR (j.status='running' AND j.recovery_attempts<3 AND j.lease_until<clock_timestamp())
  OR (j.status='unknown' AND j.recovery_attempts<3 AND EXISTS(
   SELECT 1 FROM public.ai_provider_executions e WHERE e.id=j.execution_id AND e.user_id=j.user_id AND e.result IS NOT NULL)))
 ORDER BY CASE WHEN j.status='queued' THEN 0 ELSE 1 END,j.created_at,j.id
 LIMIT 5;
$$;
CREATE FUNCTION public.checkpoint_music_inspiration_job(_job_id uuid,_lease_token uuid,_patch jsonb)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; next_status text;
BEGIN
 IF _patch IS NULL OR jsonb_typeof(_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('result','provider_result','status','error_code')) THEN RAISE EXCEPTION 'Invalid checkpoint fields'; END IF;
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 IF NOT FOUND OR _lease_token IS NULL OR job.lease_token IS DISTINCT FROM _lease_token OR job.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Music inspiration lease lost' USING ERRCODE='PT409'; END IF;
 next_status:=coalesce(_patch->>'status',job.status);
 IF next_status NOT IN ('running','completed','failed','unknown','cancelled') OR (job.status IN ('completed','failed','unknown') AND next_status<>job.status) THEN RAISE EXCEPTION 'Invalid job transition'; END IF;
 UPDATE public.music_inspiration_jobs SET
  status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE next_status END,
  result=coalesce(result,NULLIF(_patch->'result','null'::jsonb)),
  provider_result=coalesce(provider_result,NULLIF(_patch->'provider_result','null'::jsonb)),
  error_code=CASE WHEN next_status='completed' THEN NULL ELSE coalesce(_patch->>'error_code',error_code) END,updated_at=now(),
  completed_at=CASE WHEN next_status='completed' AND cancel_requested_at IS NULL THEN now() WHEN next_status IN ('completed','failed','unknown','cancelled') OR cancel_requested_at IS NOT NULL THEN coalesce(completed_at,now()) ELSE completed_at END,
  lease_until=CASE WHEN next_status='running' AND cancel_requested_at IS NULL THEN clock_timestamp()+interval '5 minutes' ELSE lease_until END
 WHERE id=_job_id RETURNING * INTO job;
 RETURN job;
END $$;

CREATE FUNCTION public.reserve_music_inspiration_dispatch(_job_id uuid,_lease_token uuid,_dispatch_key uuid,_kind text,_max_cost numeric,_max_credits integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; owner_id uuid; credit_limit integer;
BEGIN
 SELECT user_id INTO owner_id FROM public.music_inspiration_jobs WHERE id=_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.admit_music_inspiration_internal(owner_id);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0));
 SELECT * INTO job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 IF job.status<>'running' OR job.cancel_requested_at IS NOT NULL OR _lease_token IS NULL OR job.lease_token IS DISTINCT FROM _lease_token OR job.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF _dispatch_key IS NULL OR _kind IS NULL OR _kind NOT IN ('search','ai') OR _max_cost IS NULL OR _max_cost::text IN ('NaN','Infinity','-Infinity') OR _max_cost<=0 OR _max_credits IS NULL OR _max_credits<0 THEN RAISE EXCEPTION 'Invalid dispatch reservation'; END IF;
 IF EXISTS(SELECT 1 FROM public.music_inspiration_dispatches WHERE (job_id=_job_id AND kind='ai' AND _kind='ai') OR dispatch_key=_dispatch_key) THEN RETURN false; END IF;
 credit_limit:=CASE WHEN job.request->>'depth'='extended' THEN 5 ELSE 2 END;
 IF job.reserved_usd+_max_cost>job.budget_usd OR job.search_credits+_max_credits>credit_limit OR (_kind='ai' AND _max_credits<>0) OR (_kind='search' AND _max_credits<1) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id=job.model AND provider::text=job.provider AND status='enabled' AND generator_enabled AND generator_compatible)
  OR EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id=job.model) THEN RAISE EXCEPTION 'Research model unavailable'; END IF;
 INSERT INTO public.music_inspiration_dispatches(job_id,dispatch_key,kind,max_cost_usd,credits) VALUES(_job_id,_dispatch_key,_kind,_max_cost,_max_credits) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.music_inspiration_jobs SET reserved_usd=reserved_usd+_max_cost,search_credits=search_credits+_max_credits,updated_at=now() WHERE id=_job_id;
 -- Commit this reservation before making any external call. Never replay started/unknown.
 RETURN true;
END $$;

CREATE FUNCTION public.settle_music_inspiration_dispatch(_job_id uuid,_dispatch_key uuid,_state text,_receipt jsonb)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs; dispatch public.music_inspiration_dispatches; journal jsonb;
BEGIN
 IF _state IS NULL OR _state NOT IN ('observed','unknown') OR _receipt IS NULL OR jsonb_typeof(_receipt)<>'object' THEN RAISE EXCEPTION 'Invalid dispatch receipt'; END IF;
 SELECT * INTO STRICT job FROM public.music_inspiration_jobs WHERE id=_job_id FOR UPDATE;
 SELECT * INTO STRICT dispatch FROM public.music_inspiration_dispatches WHERE job_id=_job_id AND dispatch_key=_dispatch_key FOR UPDATE;
 IF dispatch.state='observed' THEN RETURN job; END IF;
 UPDATE public.music_inspiration_dispatches SET state=_state,receipt=_receipt,updated_at=now() WHERE job_id=_job_id AND dispatch_key=_dispatch_key;
 -- Financial/provider observations survive cancellation and expired/lost worker leases.
 IF dispatch.kind='ai' THEN
  SELECT e.result INTO journal FROM public.ai_provider_executions e WHERE e.id=job.execution_id AND e.user_id=job.user_id;
  UPDATE public.music_inspiration_jobs SET provider_result=coalesce(provider_result,journal,_receipt->'provider_result'),updated_at=now() WHERE id=_job_id RETURNING * INTO job;
 END IF;
 RETURN job;
END $$;

CREATE FUNCTION public.cancel_music_inspiration_job(_job_id uuid)
RETURNS public.music_inspiration_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.music_inspiration_jobs;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 -- Revoked users may still stop their own pending work, but never inspect another owner.
 UPDATE public.music_inspiration_jobs SET cancel_requested_at=coalesce(cancel_requested_at,now()),status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now()
 WHERE id=_job_id AND user_id=auth.uid() AND status IN ('queued','running','unknown') RETURNING * INTO job;
 IF NOT FOUND THEN SELECT * INTO job FROM public.music_inspiration_jobs WHERE id=_job_id AND user_id=auth.uid(); END IF;
 RETURN job;
END $$;

-- All profile mutations use expected revision (including delete); no raw client writes.
CREATE FUNCTION public.save_music_inspiration_profile(_id uuid,_expected_revision integer,_name text,_job_id uuid)
RETURNS public.music_inspiration_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile public.music_inspiration_profiles; v_owner_id uuid:=auth.uid(); trusted_result jsonb;
BEGIN
 PERFORM public._lock_user_security_state(v_owner_id);
 IF public.music_inspiration_access(v_owner_id) IS NOT TRUE THEN RAISE EXCEPTION 'Music inspiration unavailable' USING ERRCODE='42501'; END IF;
 IF _job_id IS NOT NULL THEN
  SELECT result INTO trusted_result FROM public.music_inspiration_jobs WHERE id=_job_id AND user_id=v_owner_id AND status='completed' AND result IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Completed owned research required' USING ERRCODE='42501'; END IF;
 END IF;
 IF _expected_revision IS NULL THEN
  IF _job_id IS NULL OR _name IS NULL THEN RAISE EXCEPTION 'Name and completed job required'; END IF;
  INSERT INTO public.music_inspiration_profiles(id,owner_id,name,result) VALUES(coalesce(_id,gen_random_uuid()),v_owner_id,_name,trusted_result) RETURNING * INTO profile;
 ELSE
  UPDATE public.music_inspiration_profiles SET name=coalesce(_name,name),result=coalesce(trusted_result,result),revision=revision+1,updated_at=now()
   WHERE id=_id AND music_inspiration_profiles.owner_id=v_owner_id AND revision=_expected_revision RETURNING * INTO profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile changed or unavailable' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN profile;
END $$;
CREATE FUNCTION public.delete_music_inspiration_profile(_id uuid,_expected_revision integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public._lock_user_security_state(auth.uid());
 IF public.music_inspiration_access(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'Music inspiration unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM public.music_inspiration_profiles WHERE id=_id AND owner_id=auth.uid() AND revision=_expected_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile changed or unavailable' USING ERRCODE='PT409'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.read_ai_execution_by_id_internal(_user_id uuid,_execution_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(e) FROM public.ai_provider_executions e WHERE e.id=_execution_id AND e.user_id=_user_id;
$$;

-- Extend delete protection without rewriting the existing uninstall RPC/reasons.
-- Both job mutations and model mutations share the existing registry fence.
CREATE FUNCTION public.guard_music_inspiration_model_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.music_inspiration_jobs j WHERE j.model=OLD.provider_model_id AND (
  j.status IN ('queued','running','unknown') OR EXISTS(SELECT 1 FROM public.music_inspiration_dispatches d WHERE d.job_id=j.id AND d.kind='ai' AND (
   d.state<>'observed' OR NOT EXISTS(SELECT 1 FROM public.ai_usage_logs l WHERE l.id=j.execution_id AND l.user_id=j.user_id AND l.model=j.model AND l.provider_usage_state='final'))))) THEN
  RAISE EXCEPTION 'Model has active music inspiration or unsettled usage';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_music_inspiration_model_delete BEFORE DELETE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.guard_music_inspiration_model_delete();

DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (
  'admit_music_inspiration_internal','kick_music_inspiration_runner','start_music_inspiration_job','claim_music_inspiration_job','checkpoint_music_inspiration_job',
  'reserve_music_inspiration_dispatch','settle_music_inspiration_dispatch','cancel_music_inspiration_job','save_music_inspiration_profile','delete_music_inspiration_profile',
  'read_ai_execution_by_id_internal','guard_music_inspiration_model_delete','pending_music_inspiration_job_ids') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.signature);
  IF fn.proname IN ('start_music_inspiration_job','claim_music_inspiration_job','checkpoint_music_inspiration_job','reserve_music_inspiration_dispatch','settle_music_inspiration_dispatch','read_ai_execution_by_id_internal','pending_music_inspiration_job_ids') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
  ELSIF fn.proname IN ('cancel_music_inspiration_job','save_music_inspiration_profile','delete_music_inspiration_profile') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn.signature);
  END IF;
 END LOOP;
END $$;
-- ai_usage_logs.operation and ai_provider_executions.operation are unconstrained text:
-- music_inspiration needs no enum/constraint rewrite and uses no generation-job FK.
COMMIT;
