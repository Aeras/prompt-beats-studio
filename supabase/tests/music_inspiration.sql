-- Disposable local replay ONLY. Every synthetic row/configuration change rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.reject(sql text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE rejected boolean:=false; BEGIN BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %',sql; END IF; END $$;
CREATE TEMP TABLE legacy AS SELECT * FROM public.feature_access_policies;
-- Never kick a real runner from fixtures, even on a misconfigured local replay.
DELETE FROM public.app_settings WHERE key IN ('runner_url','runner_token');
INSERT INTO auth.users(id,email) SELECT ('c4510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'inspiration-'||n||'@example.invalid' FROM generate_series(1,3)n;
INSERT INTO public.user_roles(user_id,role,moderation_status) SELECT id,'user','active' FROM auth.users WHERE id::text LIKE 'c4510000%' ON CONFLICT(user_id) DO UPDATE SET role='user',moderation_status='active';
INSERT INTO public.beta_testers(user_id) VALUES('c4510000-0000-4000-8000-000000000001'),('c4510000-0000-4000-8000-000000000002');
INSERT INTO public.ai_models(provider,provider_model_id,display_name,status,generator_compatible,generator_enabled)
 VALUES('openai','music-inspiration-sql-fixture','Local SQL only','enabled',true,true);
UPDATE public.global_ai_usage_policy SET enabled=true;
-- Transaction-only lifecycle fixtures: no promotion or policy change escapes rollback.
SELECT set_config('request.jwt.claim.sub','c4510000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert(NOT public.music_inspiration_access(auth.uid()),'Beta denies eligible non-cohort user');
UPDATE public.beta_features SET stage='stable' WHERE feature_key='ai_music_inspiration';
SELECT pg_temp.assert(public.music_inspiration_access(auth.uid()),'Stable permits eligible non-cohort user');
SELECT pg_temp.assert(NOT public.music_inspiration_access('c4510000-0000-4000-8000-000000000001'),'Access helper cannot probe another caller');
UPDATE public.beta_features SET stage='archived' WHERE feature_key='ai_music_inspiration';
SELECT pg_temp.assert(NOT public.music_inspiration_access(auth.uid()),'Archived inspiration denies access');
UPDATE public.beta_features SET stage='feature_access' WHERE feature_key='ai_music_inspiration';
INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
 VALUES('ai_music_inspiration','AI Music Inspiration','Rollback-only policy fixture','disabled');
SELECT pg_temp.assert(NOT public.music_inspiration_access(auth.uid()),'Promoted disabled policy enforced');
UPDATE public.feature_access_policies SET access_mode='selected_users' WHERE feature_key='ai_music_inspiration';
INSERT INTO public.feature_access_users(feature_key,user_id)VALUES('ai_music_inspiration','c4510000-0000-4000-8000-000000000003');
SELECT pg_temp.assert(public.music_inspiration_access(auth.uid()),'Promoted explicit selected user allowed without Beta membership');
SELECT set_config('request.jwt.claim.sub','c4510000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert(NOT public.music_inspiration_access(auth.uid()),'Beta membership cannot bypass promoted selected-users policy');
SELECT pg_temp.assert((SELECT access_mode='selected_users' FROM public.feature_access_policies WHERE feature_key='ai_music_inspiration'),'Caller checks preserve owner-selected policy');
DELETE FROM public.feature_access_users WHERE feature_key='ai_music_inspiration';
DELETE FROM public.feature_access_policies WHERE feature_key='ai_music_inspiration';
UPDATE public.beta_features SET stage='beta' WHERE feature_key='ai_music_inspiration';
SELECT set_config('request.jwt.claim.sub','',true);
CREATE TEMP TABLE fixture(job_id uuid,execution_id uuid,lease uuid,profile_id uuid);
GRANT SELECT,UPDATE ON fixture TO authenticated;
DO $$ DECLARE first jsonb; again jsonb; lease uuid:=gen_random_uuid(); j public.music_inspiration_jobs; BEGIN
 first:=public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001','c4510000-0000-4000-8000-000000000010','{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25);
 again:=public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001','c4510000-0000-4000-8000-000000000010','{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25);
 PERFORM pg_temp.assert(first=again,'Exact duplicate returns original');
 INSERT INTO fixture VALUES((first->>'id')::uuid,(first->>'execution_id')::uuid,lease,NULL);
 j:=public.claim_music_inspiration_job((first->>'id')::uuid,lease);
 PERFORM pg_temp.assert(j.status='running','First worker claims');
 j:=public.claim_music_inspiration_job((first->>'id')::uuid,gen_random_uuid());
 PERFORM pg_temp.assert(j.id IS NULL,'Second worker cannot claim live lease');
END $$;
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001','c4510000-0000-4000-8000-000000000010','{"depth":"standard","changed":true}','music-inspiration-sql-fixture','openai',0.25)$q$);
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001',gen_random_uuid(),'{"depth":"extended"}','music-inspiration-sql-fixture','openai',1)$q$);
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.26)$q$);
-- Service admission has no user JWT: the explicit trusted owner is required.
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000001','c4510000-0000-4000-8000-000000000010','{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25);
RESET ROLE;
SELECT pg_temp.assert(public.reserve_music_inspiration_dispatch(job_id,lease,'c4510000-0000-4000-8000-000000000020','search',0.02,1),'First query') FROM fixture;
SELECT pg_temp.assert(NOT public.reserve_music_inspiration_dispatch(job_id,lease,'c4510000-0000-4000-8000-000000000020','search',0.02,1),'Same query never redispatched') FROM fixture;
SELECT pg_temp.assert(public.reserve_music_inspiration_dispatch(job_id,lease,'c4510000-0000-4000-8000-000000000021','search',0.02,1),'Second distinct query allowed') FROM fixture;
SELECT pg_temp.assert(NOT public.reserve_music_inspiration_dispatch(job_id,lease,gen_random_uuid(),'search',0.02,1),'Third query exceeds standard credits') FROM fixture;
SELECT pg_temp.assert(NOT public.reserve_music_inspiration_dispatch(job_id,lease,gen_random_uuid(),'ai',0.22,0),'Budget preflight fails closed') FROM fixture;
SELECT pg_temp.assert(public.reserve_music_inspiration_dispatch(job_id,lease,'c4510000-0000-4000-8000-000000000022','ai',0.20,0),'AI reserved before call') FROM fixture;
SELECT pg_temp.assert(NOT public.reserve_music_inspiration_dispatch(job_id,lease,gen_random_uuid(),'ai',0.01,0),'Exactly one AI call') FROM fixture;
SELECT pg_temp.assert(reserved_usd=0.24 AND search_credits=2,'Cumulative counters') FROM public.music_inspiration_jobs WHERE id=(SELECT job_id FROM fixture);
SELECT pg_temp.reject(format('SELECT public.checkpoint_music_inspiration_job(%L,%L,%L)',job_id,lease,'{"reserved_usd":0}')) FROM fixture;
-- Simulate committed execution journal before worker crashes. No generation job FK.
SELECT public.begin_ai_execution_internal(execution_id,'c4510000-0000-4000-8000-000000000001','music_inspiration','openai','music-inspiration-sql-fixture',NULL,NULL,NULL) FROM fixture;
SELECT public.checkpoint_ai_execution_internal(execution_id,'c4510000-0000-4000-8000-000000000001','{"report":"journal survives crash"}') FROM fixture;
SELECT pg_temp.assert(public.read_ai_execution_by_id_internal('c4510000-0000-4000-8000-000000000002',execution_id) IS NULL,'Journal owner filter') FROM fixture;
INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd,status,result)VALUES('c4510000-0000-4000-8000-000000000001',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.01,'completed','{"trusted":true}');
SELECT set_config('request.jwt.claim.sub','c4510000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.music_inspiration_jobs),'Owner sees own job');
SELECT pg_temp.reject('UPDATE public.music_inspiration_jobs SET reserved_usd=0');
SELECT pg_temp.reject('SELECT * FROM public.music_inspiration_dispatches');
SELECT pg_temp.reject($q$INSERT INTO public.music_inspiration_profiles(owner_id,name,result) VALUES(auth.uid(),'Forged','{"evidence":"forged"}')$q$);
SELECT pg_temp.reject($q$SELECT public.save_music_inspiration_profile(NULL,NULL,'No job',NULL)$q$);
SELECT pg_temp.reject(format('SELECT public.save_music_inspiration_profile(NULL,NULL,%L,%L)','Pending job',job_id)) FROM fixture;
SELECT pg_temp.reject('SELECT public.read_ai_execution_by_id_internal(NULL,NULL)');
DO $$ DECLARE p public.music_inspiration_profiles; BEGIN
 p:=public.save_music_inspiration_profile(NULL,NULL,'Saved',(SELECT id FROM public.music_inspiration_jobs WHERE status='completed' LIMIT 1));
 PERFORM pg_temp.assert(p.revision=1,'First profile save returns revision 1 for the public API');
 UPDATE fixture SET profile_id=p.id;
 p:=public.save_music_inspiration_profile(p.id,1,'Renamed',NULL);
 PERFORM pg_temp.assert(p.revision=2 AND p.result->>'trusted'='true','Profile CAS advances revision and retains trusted research');
 p:=public.save_music_inspiration_profile(p.id,2,NULL,NULL);
 PERFORM pg_temp.assert(p.revision=3 AND p.name='Renamed' AND p.result->>'trusted'='true','NULL update retains name and result');
END $$;
SELECT pg_temp.reject(format('SELECT public.save_music_inspiration_profile(%L,1,%L,%L)',profile_id,'Stale',NULL)) FROM fixture;
SELECT public.cancel_music_inspiration_job(job_id) FROM fixture;
RESET ROLE;
SELECT public.settle_music_inspiration_dispatch(job_id,'c4510000-0000-4000-8000-000000000022','observed','{"usage":"durable"}') FROM fixture;
SELECT public.settle_music_inspiration_dispatch(job_id,'c4510000-0000-4000-8000-000000000022','unknown','{"late":"must not overwrite observed"}') FROM fixture;
SELECT pg_temp.assert(status='cancelled' AND provider_result->>'report'='journal survives crash' AND reserved_usd=0.24,'Receipt recovers journal without resurrecting cancellation') FROM public.music_inspiration_jobs WHERE id=(SELECT job_id FROM fixture);
SELECT pg_temp.assert(receipt='{"usage":"durable"}'::jsonb,'Observed receipt immutable') FROM public.music_inspiration_dispatches WHERE kind='ai' AND job_id=(SELECT job_id FROM fixture);
SELECT pg_temp.reject($q$DELETE FROM public.ai_models WHERE provider_model_id='music-inspiration-sql-fixture'$q$);
SELECT set_config('request.jwt.claim.sub','c4510000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.music_inspiration_jobs),'Foreign jobs invisible');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.music_inspiration_profiles),'Foreign profiles invisible');
SELECT pg_temp.assert((public.cancel_music_inspiration_job((SELECT job_id FROM fixture))).id IS NULL,'Foreign cancel unavailable');
SELECT pg_temp.reject(format('SELECT public.delete_music_inspiration_profile(%L,3)',profile_id)) FROM fixture;
RESET ROLE;
DELETE FROM public.beta_testers WHERE user_id='c4510000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','c4510000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.music_inspiration_jobs),'Revoked Beta loses read');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.music_inspiration_profiles),'Revoked Beta loses profile read');
RESET ROLE;
-- Extended cohort: five queries, never six.
UPDATE public.user_roles SET role='super_admin' WHERE user_id='c4510000-0000-4000-8000-000000000002';
DO $$ DECLARE j jsonb; id uuid; token uuid:=gen_random_uuid(); n integer; BEGIN
 j:=public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"extended"}','music-inspiration-sql-fixture','openai',1); id:=(j->>'id')::uuid;
 PERFORM public.claim_music_inspiration_job(id,token);
 FOR n IN 1..5 LOOP PERFORM pg_temp.assert(public.reserve_music_inspiration_dispatch(id,token,gen_random_uuid(),'search',0.01,1),'Extended query allowed'); END LOOP;
 PERFORM pg_temp.assert(NOT public.reserve_music_inspiration_dispatch(id,token,gen_random_uuid(),'search',0.01,1),'Extended sixth query denied');
END $$;
UPDATE public.global_ai_usage_policy SET enabled=false;
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
UPDATE public.global_ai_usage_policy SET enabled=true;
-- Owner 2 already admitted $1. The second $1 fits; any more fails closed.
SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"extended"}','music-inspiration-sql-fixture','openai',1);
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
INSERT INTO public.beta_testers(user_id)VALUES('c4510000-0000-4000-8000-000000000003');
DO $$ DECLARE n integer; BEGIN FOR n IN 1..4 LOOP
 PERFORM public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25);
END LOOP; END $$;
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
-- Unknown jobs recover only from an already committed result, never a new call.
DO $$ DECLARE j public.music_inspiration_jobs; job_id uuid; token uuid:=gen_random_uuid(); execution uuid; BEGIN
 SELECT jobs.id,jobs.execution_id INTO job_id,execution FROM public.music_inspiration_jobs jobs WHERE user_id='c4510000-0000-4000-8000-000000000002' ORDER BY created_at,id LIMIT 1;
 UPDATE public.music_inspiration_jobs SET status='unknown',error_code='provider_outcome_unknown',completed_at=now()-interval '1 hour' WHERE id=job_id;
 j:=public.claim_music_inspiration_job(job_id,token);
 PERFORM pg_temp.assert(j.id IS NULL,'Unknown without journal cannot retry');
 PERFORM public.begin_ai_execution_internal(execution,'c4510000-0000-4000-8000-000000000002','music_inspiration','openai','music-inspiration-sql-fixture',NULL,NULL,NULL);
 PERFORM public.checkpoint_ai_execution_internal(execution,'c4510000-0000-4000-8000-000000000002','{"recovered":true}');
 UPDATE public.global_ai_usage_policy SET enabled=false;
 j:=public.claim_music_inspiration_job(job_id,token);
 PERFORM pg_temp.assert(j.id=job_id AND j.execution_id=execution,'Global OFF journal recovery preserves execution identity');
 j:=public.checkpoint_music_inspiration_job(job_id,token,'{"status":"completed","result":{"recovered":true},"error_code":null}');
 PERFORM pg_temp.assert(j.status='completed' AND j.error_code IS NULL,'Successful recovery clears prior provider error');
 PERFORM pg_temp.assert(j.completed_at=now(),'Successful recovery replaces earlier unknown completion timestamp');
 UPDATE public.global_ai_usage_policy SET enabled=true;
END $$;
-- Generator entitlement is independently required before any new dispatch.
UPDATE public.feature_access_policies SET access_mode='disabled' WHERE feature_key='ai_generator';
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
UPDATE public.feature_access_policies p SET access_mode=l.access_mode FROM legacy l WHERE p.feature_key=l.feature_key AND p.feature_key='ai_generator';
UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='c4510000-0000-4000-8000-000000000002';
SELECT pg_temp.reject($q$SELECT public.start_music_inspiration_job('c4510000-0000-4000-8000-000000000002',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.25)$q$);
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.start_music_inspiration_job(uuid,uuid,jsonb,text,text,numeric)','EXECUTE'),'No client admission');
SELECT pg_temp.assert(to_regprocedure('public.save_music_inspiration_profile(uuid,integer,text,jsonb)') IS NULL,'No client-authoritative JSON overload');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.cancel_music_inspiration_job(uuid)','EXECUTE'),'No anonymous cancel');
SELECT pg_temp.assert(has_function_privilege('service_role','public.read_ai_execution_by_id_internal(uuid,uuid)','EXECUTE'),'Service journal reader');
-- Discovery must not starve queued jobs behind old blocked unknown responses.
UPDATE public.music_inspiration_jobs SET status='failed' WHERE user_id::text LIKE 'c4510000%';
INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd,status,created_at)
 SELECT 'c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.01,'unknown',now()-interval '2 days' FROM generate_series(1,7);
INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd,status)
 SELECT 'c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.01,'queued' FROM generate_series(1,6);
-- Even an eligible older recovery must yield the first five slots to queued work.
DO $$ DECLARE job public.music_inspiration_jobs; BEGIN
 INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd,status,created_at)
 VALUES('c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.01,'unknown',now()-interval '3 days') RETURNING * INTO job;
 PERFORM public.begin_ai_execution_internal(job.execution_id,job.user_id,'music_inspiration','openai',job.model,NULL,NULL,NULL);
 PERFORM public.checkpoint_ai_execution_internal(job.execution_id,job.user_id,'{"invalidStoredResponse":true}');
END $$;
SELECT pg_temp.assert((SELECT count(*)=5 FROM public.pending_music_inspiration_job_ids()),'Discovery limited to five eligible jobs');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() p JOIN public.music_inspiration_jobs j ON j.id=p.id WHERE j.status<>'queued'),'Old blocked unknowns do not starve queued jobs');
UPDATE public.music_inspiration_jobs SET status='failed' WHERE user_id::text LIKE 'c4510000%' AND status='queued';
UPDATE public.music_inspiration_jobs j SET status='failed' WHERE j.user_id::text LIKE 'c4510000%' AND j.status='unknown' AND EXISTS(SELECT 1 FROM public.ai_provider_executions e WHERE e.id=j.execution_id AND e.user_id=j.user_id AND e.result IS NOT NULL);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids()),'Blocked unknowns excluded');
DO $$ DECLARE job public.music_inspiration_jobs; claimed public.music_inspiration_jobs; attempt integer; BEGIN
 INSERT INTO public.music_inspiration_jobs(user_id,request_id,request,model,provider,budget_usd)
 VALUES('c4510000-0000-4000-8000-000000000003',gen_random_uuid(),'{"depth":"standard"}','music-inspiration-sql-fixture','openai',0.01) RETURNING * INTO job;
 claimed:=public.claim_music_inspiration_job(job.id,gen_random_uuid());
 PERFORM pg_temp.assert(claimed.recovery_attempts=0,'Initial queued claim is not recovery');
 PERFORM public.begin_ai_execution_internal(job.execution_id,job.user_id,'music_inspiration','openai',job.model,NULL,NULL,NULL);
 PERFORM public.checkpoint_ai_execution_internal(job.execution_id,job.user_id,'{"invalidStoredResponse":true}');
 UPDATE public.global_ai_usage_policy SET enabled=false;
 FOR attempt IN 1..3 LOOP
  UPDATE public.music_inspiration_jobs SET status='unknown' WHERE id=job.id;
  PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() p WHERE p.id=job.id),'Stored response recovery discoverable');
  claimed:=public.claim_music_inspiration_job(job.id,gen_random_uuid());
  PERFORM pg_temp.assert(claimed.id=job.id AND claimed.recovery_attempts=attempt,'Global OFF recovery consumes exactly one attempt');
 END LOOP;
 UPDATE public.music_inspiration_jobs SET status='unknown' WHERE id=job.id;
 claimed:=public.claim_music_inspiration_job(job.id,gen_random_uuid());
 PERFORM pg_temp.assert(claimed.id IS NULL,'Invalid response cannot recover forever');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() p WHERE p.id=job.id),'Exhausted unknown excluded from sweep');
 UPDATE public.music_inspiration_jobs SET status='running',lease_until=now()-interval '1 second' WHERE id=job.id;
 claimed:=public.claim_music_inspiration_job(job.id,gen_random_uuid());
 PERFORM pg_temp.assert(claimed.id IS NULL,'Exhausted stale-running cannot bypass cap');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() p WHERE p.id=job.id),'Exhausted stale-running excluded from sweep');
 UPDATE public.global_ai_usage_policy SET enabled=true;
END $$;
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.pending_music_inspiration_job_ids()','EXECUTE'),'No client discovery RPC');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.pending_music_inspiration_job_ids()','EXECUTE'),'No anonymous discovery RPC');
SELECT pg_temp.assert(has_function_privilege('service_role','public.pending_music_inspiration_job_ids()','EXECUTE'),'Service discovery RPC');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids()),'Service sweep excludes all blocked fixtures');
RESET ROLE;
SELECT pg_temp.assert(NOT EXISTS((SELECT * FROM legacy EXCEPT SELECT * FROM public.feature_access_policies) UNION ALL (SELECT * FROM public.feature_access_policies EXCEPT SELECT * FROM legacy)),'All 19 legacy policies unchanged');
SELECT 'PASS: music_inspiration SQL/RLS; legacy policies unchanged: '||(SELECT count(*) FROM legacy) AS verification;
ROLLBACK;
