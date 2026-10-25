-- Disposable replay only. All records and deliberate permission changes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text,expected text DEFAULT 'P0001') RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; BEGIN BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,sql; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES('ac000000-0000-4000-8000-000000000001','models-admin@example.invalid'),('ac000000-0000-4000-8000-000000000002','models-user@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) SELECT id,'user','active' FROM auth.users WHERE id::text LIKE 'ac000000%' ON CONFLICT(user_id) DO NOTHING;
UPDATE public.user_roles SET role='admin' WHERE user_id='ac000000-0000-4000-8000-000000000001';
INSERT INTO public.ai_models(id,provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled)
 SELECT ('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai','offline-admin-'||n,'Offline admin '||n,'enabled',true,true,true,true FROM generate_series(1,5) n;
INSERT INTO public.ai_usage_logs(user_id,provider,model,operation) VALUES('ac000000-0000-4000-8000-000000000002','openai','offline-admin-1','generate');
INSERT INTO public.ai_generation_jobs(user_id,idempotency_key,status,input_payload,model,result) VALUES('ac000000-0000-4000-8000-000000000002',gen_random_uuid(),'completed','{}','offline-admin-1','{"lyrics":"Historical offline fixture"}');
CREATE TEMP TABLE historical_usage AS SELECT count(*) AS n FROM public.ai_usage_logs;
DO $$ DECLARE fn text; r text; BEGIN
 FOREACH fn IN ARRAY ARRAY['admin_ai_model_controls()','admin_patch_ai_model(uuid,jsonb,bigint)','admin_uninstall_ai_models(jsonb,boolean)','admin_set_ai_model_default(text,text)'] LOOP
  PERFORM pg_temp.assert(has_function_privilege('authenticated','public.'||fn,'EXECUTE'),'Authenticated RPC entry');
  FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP PERFORM pg_temp.assert(NOT has_function_privilege(r,'public.'||fn,'EXECUTE'),'No non-caller RPC grant'); END LOOP;
 END LOOP;
 PERFORM pg_temp.assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_model_uninstall_guard'::regclass),'Tombstone RLS');
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP PERFORM pg_temp.assert(NOT has_table_privilege(r,'public.ai_model_uninstall_guard','SELECT,INSERT,UPDATE,DELETE'),'No direct guard access'); END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT public.admin_ai_model_controls()');
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"status":"disabled"}',0)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000001","revision":0}]',true)$q$);
SELECT pg_temp.denied('SELECT * FROM public.ai_models','42501');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"generator_enabled":false}',0);
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"quality_check_enabled":false}',0)$q$,'PT409');
SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"quality_check_enabled":false}',1);
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"provider_model_id":"other"}',2)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"notes":false}',2)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"pricing_status":"verified"}',2)$q$);
SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"input_price_per_million":2,"output_price_per_million":8,"pricing_status":"verified","generator_reasoning_effort":"high","notes":"Offline note"}',2);
SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000001','{"access_policy":"selected_users"}',3);
RESET ROLE;
SELECT pg_temp.assert((SELECT NOT generator_enabled AND NOT quality_check_enabled AND input_price_per_million=2 AND generator_reasoning_effort='high' AND notes='Offline note' AND admin_revision=4 FROM public.ai_models WHERE provider_model_id='offline-admin-1'),'Partial writes preserve independent fields and advanced settings');
UPDATE public.ai_models SET health_status='healthy',last_checked_at=now() WHERE provider_model_id='offline-admin-1';
SELECT pg_temp.assert((SELECT admin_revision=4 FROM public.ai_models WHERE provider_model_id='offline-admin-1'),'Health does not conflict with admin edits');
-- Every real default, including the legacy fallback, is protected atomically.
SET LOCAL ROLE authenticated;
DO $$ DECLARE op text; BEGIN
 FOREACH op IN ARRAY ARRAY['generator','quality_check','ai_tools','legacy'] LOOP
  PERFORM public.admin_set_ai_model_default(op,'offline-admin-2');
 END LOOP;
END $$;
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000002','{"status":"disabled"}',0)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000002','{"generator_enabled":false}',0)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000001","revision":4},{"id":"ac100000-0000-4000-8000-000000000002","revision":0}]',true)$q$);
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.ai_models WHERE provider_model_id IN ('offline-admin-1','offline-admin-2')),'Blocked bulk is all-or-nothing');
INSERT INTO public.user_model_access(user_id,access_mode,allowed_models) VALUES('ac000000-0000-4000-8000-000000000002','custom',ARRAY['offline-admin-3']);
SELECT pg_temp.assert('user_access'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-3'))),'Existing user grants block uninstall, never widen to inherit');
INSERT INTO public.ai_usage_outbox(payload) VALUES('{"model":"offline-admin-4"}');
SELECT pg_temp.assert('usage_pending'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-4'))),'Pending financial evidence blocks uninstall');
INSERT INTO public.ai_auxiliary_requests(user_id,operation,request_key) VALUES('ac000000-0000-4000-8000-000000000002','song_analyzer',gen_random_uuid());
SELECT pg_temp.assert('active_auxiliary'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-5'))),'Unknown auxiliary model fails closed');
DELETE FROM public.ai_auxiliary_requests WHERE user_id='ac000000-0000-4000-8000-000000000002';
-- Live jobs, unresolved dispatches and recoverable results cannot be deleted.
INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload,model) VALUES('ac200000-0000-4000-8000-000000000005','ac000000-0000-4000-8000-000000000002',gen_random_uuid(),'processing','{}','offline-admin-5');
SELECT pg_temp.assert('active_jobs'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-5'))),'Running job protection');
SELECT public.begin_ai_execution_internal('ac300000-0000-4000-8000-000000000005','ac000000-0000-4000-8000-000000000002','generate','openai','offline-admin-5',NULL,'ac200000-0000-4000-8000-000000000005',NULL);
SELECT pg_temp.assert('unresolved_execution'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-5'))),'Unknown provider outcome protection');
UPDATE public.ai_generation_jobs SET status='failed' WHERE id='ac200000-0000-4000-8000-000000000005';
UPDATE public.ai_provider_executions SET state='response_observed',result='{"lyrics":"Recoverable"}' WHERE id='ac300000-0000-4000-8000-000000000005';
SELECT pg_temp.assert('unresolved_execution'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-5'))),'Recovery protection');
UPDATE public.ai_generation_jobs SET status='completed' WHERE id='ac200000-0000-4000-8000-000000000005';
UPDATE public.ai_models SET generator_enabled=false,generator_compatible=false WHERE provider_model_id='offline-admin-5';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.admin_patch_ai_model('ac100000-0000-4000-8000-000000000005','{"generator_enabled":true}',1)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[]',true)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005"}]',true)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005","revision":1.5}]',true)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005","revision":1},{"id":"ac100000-0000-4000-8000-000000000005","revision":1}]',true)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005","revision":1}]',false)$q$);
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005","revision":0}]',true)$q$,'PT409');
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"AC100000-0000-4000-8000-000000000005","revision":0}]',true)$q$,'PT409');
RESET ROLE;
CREATE FUNCTION pg_temp.reject_model_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details->>'operation'='uninstall' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_model_audit BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_model_audit();
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000005","revision":1}]',true)$q$);
RESET ROLE;
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id='offline-admin-5') AND NOT EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id='offline-admin-5'),'Audit failure rolls back deletion and tombstone');
DROP TRIGGER reject_model_audit ON public.admin_audit_log;
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ac100000-0000-4000-8000-000000000001","revision":4},{"id":"ac100000-0000-4000-8000-000000000005","revision":1}]',true);
RESET ROLE;
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id IN ('offline-admin-1','offline-admin-5')),'Real registry deletion');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.ai_model_uninstall_guard WHERE provider_model_id IN ('offline-admin-1','offline-admin-5')),'Removed identities guarded');
SELECT pg_temp.assert(((SELECT count(*) FROM public.ai_usage_logs)=(SELECT n FROM historical_usage)),'Historical financial records preserved');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.admin_audit_log WHERE details->>'operation'='uninstall' AND details->'models' @> '[{"name":"Offline admin 1","id":"ac100000-0000-4000-8000-000000000001"}]'),'Atomic named audit');
SELECT pg_temp.denied($q$INSERT INTO public.user_model_access(user_id,access_mode,allowed_models) VALUES('ac000000-0000-4000-8000-000000000001','custom',ARRAY['offline-admin-1'])$q$);
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE model='offline-admin-1' AND result->>'lyrics'='Historical offline fixture'),'Historical content retained');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.ai_provider_executions WHERE model='offline-admin-5' AND result->>'lyrics'='Recoverable'),'Historical execution result retained');
-- A late trustworthy usage receipt must still be recordable, never lose finance evidence.
INSERT INTO public.ai_provider_executions(id,user_id,provider,model,operation,state,observed_usage) VALUES(gen_random_uuid(),'ac000000-0000-4000-8000-000000000002','openai','offline-admin-5','generate','response_observed','{"input_tokens":10}');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.ai_provider_executions WHERE model='offline-admin-5' AND observed_usage->>'input_tokens'='10'),'Late observed evidence retained');
INSERT INTO public.ai_models(provider,provider_model_id,display_name) VALUES('openai','offline-admin-1','Rediscovered');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.ai_model_uninstall_guard WHERE provider_model_id='offline-admin-1'),'Fresh add restores identity');
CREATE TABLE public.test_future_registry_reference(model_id uuid REFERENCES public.ai_models(id));
SELECT pg_temp.assert('foreign_key'=ANY(public.ai_model_uninstall_reasons((SELECT m FROM public.ai_models m WHERE provider_model_id='offline-admin-4'))),'Unknown future FK fails closed, never cascade historical data');
DROP TABLE public.test_future_registry_reference;
-- Revoked admin state cannot use any mutation RPC.
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='ac000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT public.admin_ai_model_controls()');
RESET ROLE;
ROLLBACK;
