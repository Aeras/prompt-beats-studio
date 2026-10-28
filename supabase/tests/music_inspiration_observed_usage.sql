-- Disposable synthetic fixtures only; all changes roll back, no runner credentials.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
DELETE FROM public.app_settings WHERE key IN ('runner_url','runner_token');
INSERT INTO auth.users(id,email) VALUES('c4580000-0000-4000-8000-000000000001','usage-local@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('c4580000-0000-4000-8000-000000000001','super_admin','active') ON CONFLICT(user_id) DO UPDATE SET role='super_admin',moderation_status='active';
INSERT INTO public.ai_models(provider,provider_model_id,display_name,status,generator_compatible,generator_enabled) VALUES('openai','inspiration-usage-local','Offline','enabled',true,true);
UPDATE public.global_ai_usage_policy SET enabled=true;
DO $$ DECLARE job jsonb; lease uuid:=gen_random_uuid(); n integer; BEGIN
 FOR n IN 1..12 LOOP
  job:=public.start_music_inspiration_job_v2('c4580000-0000-4000-8000-000000000001',gen_random_uuid(),'{"depth":"standard"}','inspiration-usage-local','openai','{"input":1000,"output":2000,"searchCreditUsd":null}');
 END LOOP;
 PERFORM pg_temp.assert((SELECT count(*)=12 FROM public.music_inspiration_jobs WHERE user_id='c4580000-0000-4000-8000-000000000001'),'No four/hour or daily money gate');
 PERFORM public.claim_music_inspiration_job((job->>'id')::uuid,lease);
 PERFORM pg_temp.assert(public.reserve_music_inspiration_dispatch((job->>'id')::uuid,lease,'c4580000-0000-4000-8000-000000000010','ai',100,0),'No per-job financial cap');
 PERFORM pg_temp.assert(NOT public.reserve_music_inspiration_dispatch((job->>'id')::uuid,lease,gen_random_uuid(),'ai',100,0),'Still exactly one AI dispatch');
 PERFORM public.begin_ai_execution_internal((job->>'execution_id')::uuid,'c4580000-0000-4000-8000-000000000001','music_inspiration','openai','inspiration-usage-local',NULL,NULL,NULL);
 PERFORM public.checkpoint_ai_execution_internal((job->>'execution_id')::uuid,'c4580000-0000-4000-8000-000000000001','{"text":"private synthetic result must not enter report","usage":{"inputTokens":1000,"outputTokens":2000,"reasoningTokens":500}}');
 PERFORM pg_temp.assert(public.read_music_inspiration_usage_internal('c4580000-0000-4000-8000-000000000001',(job->>'id')::uuid)->'usage'->>'inputTokens'='1000','Real journal token evidence is returned');
 PERFORM pg_temp.assert(NOT (public.read_music_inspiration_usage_internal('c4580000-0000-4000-8000-000000000001',(job->>'id')::uuid) ? 'text'),'Raw provider text is excluded from usage report');
 PERFORM pg_temp.assert(public.read_music_inspiration_usage_internal('c4580000-0000-4000-8000-000000000002',(job->>'id')::uuid) IS NULL,'Usage isolated by owner');
 PERFORM pg_temp.assert(public.abandon_music_inspiration_request_internal('c4580000-0000-4000-8000-000000000001',(job->>'request_id')::uuid)->>'id'=job->>'id','Known job is recovered, not discarded or duplicated');
END $$;
DO $$ DECLARE rid uuid:=gen_random_uuid(); rejected boolean:=false; BEGIN
 PERFORM public.abandon_music_inspiration_request_internal('c4580000-0000-4000-8000-000000000001',rid);
 PERFORM public.abandon_music_inspiration_request_internal('c4580000-0000-4000-8000-000000000001',rid);
 BEGIN PERFORM public.start_music_inspiration_job('c4580000-0000-4000-8000-000000000001',rid,'{"depth":"standard"}','inspiration-usage-local','openai',100);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true; END;
 PERFORM pg_temp.assert(rejected,'Abandoned request cannot arrive late and create work');
END $$;
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.start_music_inspiration_job_v2(uuid,uuid,jsonb,text,text,jsonb)','EXECUTE'),'No client admission bypass');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.read_music_inspiration_usage_internal(uuid,uuid)','EXECUTE'),'No anonymous usage access');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.abandon_music_inspiration_request_internal(uuid,uuid)','EXECUTE'),'No cross-user abandon RPC');
SELECT pg_temp.assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.music_inspiration_abandoned_requests'::regclass),'Tombstones have RLS');
ROLLBACK;
