-- Local disposable database only; mock pg_net transactionally, never contact a runner/provider.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE TEMP TABLE runner_http(body jsonb,timeout_ms integer);
CREATE OR REPLACE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}'::jsonb,params jsonb DEFAULT '{}'::jsonb,headers jsonb DEFAULT '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer DEFAULT 1000)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('pb.runner_fixture_fail',true)='on' THEN RAISE EXCEPTION 'Synthetic enqueue failure'; END IF;
 INSERT INTO pg_temp.runner_http VALUES(body,timeout_milliseconds);RETURN 1;
END $$;
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.dispatch_ai_runner_sweep_internal()','EXECUTE'),'anon cannot dispatch');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.dispatch_ai_runner_sweep_internal()','EXECUTE'),'authenticated cannot dispatch');
SELECT pg_temp.assert(has_function_privilege('service_role','public.dispatch_ai_runner_sweep_internal()','EXECUTE'),'service dispatch grant');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.claim_ai_execution_recovery_by_id_internal(uuid)','EXECUTE'),'recovery internal only');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.ai_runner_deliveries','SELECT'),'private delivery metadata');
INSERT INTO public.app_settings(key,value) VALUES('runner_url','"https://runner.example.invalid/api/public/jobs/run"'),('runner_token','"offline-only-runner-token-fixture"') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
INSERT INTO auth.users(id,email) VALUES('c4520000-0000-4000-8000-000000000001','runner-fixture@example.invalid');
SET LOCAL pb.runner_fixture_fail='on';
INSERT INTO public.music_inspiration_jobs(id,user_id,request_id,request,model,provider,budget_usd,created_at) VALUES('c4520000-0000-4000-8000-000000000002','c4520000-0000-4000-8000-000000000001',gen_random_uuid(),'{"kind":"artist","artist":"Offline","depth":"standard"}','offline','openai',0.2,now()-interval '2 minutes');
SELECT pg_temp.assert((SELECT count(*)=0 FROM pg_temp.runner_http),'failed initial kick leaves job durable without network record');
SELECT pg_temp.assert((SELECT status='queued' FROM public.music_inspiration_jobs WHERE id='c4520000-0000-4000-8000-000000000002'),'kick failure preserves queued job');
INSERT INTO public.music_inspiration_jobs(id,user_id,request_id,request,model,provider,budget_usd) SELECT ('c4520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'c4520000-0000-4000-8000-000000000001',gen_random_uuid(),'{"kind":"artist","artist":"Offline","depth":"standard"}','offline','openai',0.2 FROM generate_series(10,12) n;
SET LOCAL pb.runner_fixture_fail='off';
SELECT public.dispatch_ai_runner_sweep_internal() IS NOT NULL AS sweep_ran;
SELECT pg_temp.assert((SELECT count(*)=1 FROM pg_temp.runner_http WHERE body->>'musicInspirationJobId'='c4520000-0000-4000-8000-000000000002'),'periodic sweep recovers lost kick');
SELECT pg_temp.assert((SELECT count(*)<=11 FROM pg_temp.runner_http),'fanout bounded across independent lanes');
SELECT pg_temp.assert((SELECT bool_and(timeout_ms=170000) FROM pg_temp.runner_http),'each worker has its own existing transport budget');
SELECT pg_temp.assert((SELECT count(*)=1 FROM pg_temp.runner_http WHERE body->>'maintenance'='true'),'maintenance isolated from provider workers');
SELECT public.dispatch_ai_runner_sweep_internal() IS NOT NULL AS repeated_sweep;
SELECT pg_temp.assert((SELECT count(*)=1 FROM pg_temp.runner_http WHERE body->>'musicInspirationJobId'='c4520000-0000-4000-8000-000000000002'),'tick overlap cannot flood delivery');
UPDATE public.ai_runner_deliveries SET queued_at=now()-interval '46 seconds' WHERE kind='sweep';
SELECT public.dispatch_ai_runner_sweep_internal() IS NOT NULL AS retry_sweep;
SELECT pg_temp.assert((SELECT count(*)=1 FROM pg_temp.runner_http WHERE body->>'musicInspirationJobId'='c4520000-0000-4000-8000-000000000011'),'cooling targets cannot starve later queued jobs');
SELECT pg_temp.assert((SELECT count(*)=1 FROM pg_temp.runner_http WHERE body->>'musicInspirationJobId'='c4520000-0000-4000-8000-000000000002'),'per-target cooldown survives another scheduler');
-- A confirmed failure rolls back only that delivery receipt; later ticks can retry.
DELETE FROM public.ai_runner_deliveries WHERE kind IN ('sweep','inspiration');
SET LOCAL pb.runner_fixture_fail='on';
SELECT pg_temp.assert((public.dispatch_ai_runner_sweep_internal()->>'failed')::int>0,'failed HTTP enqueue reported without raw error');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.ai_runner_deliveries WHERE kind='inspiration' AND target='c4520000-0000-4000-8000-000000000002'),'failed enqueue not incorrectly acknowledged');
SET LOCAL pb.runner_fixture_fail='off';
DELETE FROM public.ai_runner_deliveries WHERE kind='sweep';
SELECT public.dispatch_ai_runner_sweep_internal() IS NOT NULL AS recovered_enqueue;
SELECT pg_temp.assert((SELECT count(*)=2 FROM pg_temp.runner_http WHERE body->>'musicInspirationJobId'='c4520000-0000-4000-8000-000000000002'),'enqueue retry redelivers only after known failure');
SELECT public.claim_music_inspiration_job('c4520000-0000-4000-8000-000000000002','c4520000-0000-4000-8000-000000000003') IS NOT NULL AS first_claim;
SELECT pg_temp.assert((SELECT research_started_at>created_at+interval '1 minute' FROM public.music_inspiration_jobs WHERE id='c4520000-0000-4000-8000-000000000002'),'research deadline starts at first durable claim');
SELECT pg_temp.assert((public.claim_music_inspiration_job('c4520000-0000-4000-8000-000000000002',gen_random_uuid())).id IS NULL,'duplicate worker cannot claim active lease');
SELECT pg_temp.assert((SELECT reserved_usd=0 AND budget_usd=0.2 FROM public.music_inspiration_jobs WHERE id='c4520000-0000-4000-8000-000000000002'),'delivery does not charge or bypass spend reservation');
INSERT INTO public.ai_provider_executions(id,user_id,provider,model,operation,state,next_recovery_at) VALUES
 ('c4520000-0000-4000-8000-000000000004','c4520000-0000-4000-8000-000000000001','openai','offline','music_inspiration','execution_unknown',now()-interval '1 second'),
 ('c4520000-0000-4000-8000-000000000005','c4520000-0000-4000-8000-000000000001','openai','offline','music_inspiration','not_dispatched',now()-interval '1 second');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.claim_ai_execution_recovery_by_id_internal('c4520000-0000-4000-8000-000000000004')),'one exact execution can be leased');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.claim_ai_execution_recovery_by_id_internal('c4520000-0000-4000-8000-000000000004')),'concurrent/repeated recovery cannot re-claim an active lease');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.claim_ai_execution_recovery_by_id_internal('c4520000-0000-4000-8000-000000000005')),'never-dispatched execution is not a provider-recovery candidate');
UPDATE public.ai_provider_executions SET lease_until=now()-interval '1 second',recovery_attempts=8 WHERE id='c4520000-0000-4000-8000-000000000004';
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.claim_ai_execution_recovery_by_id_internal('c4520000-0000-4000-8000-000000000004')),'recovery retry cap is preserved');
SELECT 'PASS: runner fanout, lost kick, retry, cooldown, permissions, lease and preserved budgets' AS verification;
ROLLBACK;
