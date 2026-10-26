#!/usr/bin/env bash
# Local disposable database only. Observe barriers, never use production.
set -euo pipefail
project="${1:?local project ID required}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
barrier() {
 for _ in $(seq 1 100); do
  if [[ "$(query -c "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%$1%';")" != 0 ]]; then return; fi
  sleep 0.05
 done
 echo 'FAIL: reconciliation race barrier not observed' >&2; exit 1
}
query <<'SQL' >/dev/null
INSERT INTO auth.users(id,email) VALUES('ec000000-0000-4000-8000-000000000001','reconciliation-race@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('ec000000-0000-4000-8000-000000000001','admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin';
INSERT INTO public.ai_models(id,provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled)
SELECT ('ec100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai','reconcile-race-'||n,'Reconcile race '||n,'enabled',true,true,true,true FROM generate_series(1,2)n;
INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload,model)
SELECT ('ec200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ec000000-0000-4000-8000-000000000001',gen_random_uuid(),'processing','{"operation":"generate"}','reconcile-race-'||n FROM generate_series(1,2)n;
SELECT public.begin_ai_execution_internal(('ec300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ec000000-0000-4000-8000-000000000001','generate','openai','reconcile-race-'||n,NULL,('ec200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,NULL) FROM generate_series(1,2)n;
SELECT public.checkpoint_ai_execution_internal(id,user_id,'{"text":"invalid","stopReason":"end_turn","usage":{"inputTokens":10,"outputTokens":5,"totalTokens":15}}') FROM public.ai_provider_executions WHERE model LIKE 'reconcile-race-%';
SELECT public.settle_ai_usage_internal(jsonb_build_object('id',id,'user_id',user_id,'provider',provider,'model',model,'operation',operation,'provider_usage_state','final','input_tokens',10,'output_tokens',5,'total_tokens',15)) FROM public.ai_provider_executions WHERE model LIKE 'reconcile-race-%';
UPDATE public.ai_generation_jobs SET status='failed',completed_at=now() WHERE model LIKE 'reconcile-race-%';
SQL
uninstall() { query <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ec100000-0000-4000-8000-00000000000$1","revision":0}]',true);
COMMIT;
SQL
}
resolve() { query -c "SELECT public.resolve_failed_generation_internal(id,user_id,job_id,result,'invalid_response') FROM public.ai_provider_executions WHERE model='reconcile-race-$1';"; }
if uninstall 1 2>/dev/null; then echo 'FAIL: unresolved work uninstalled'; exit 1; fi
query <<'SQL' >/dev/null &
BEGIN;
SELECT public.resolve_failed_generation_internal(id,user_id,job_id,result,'invalid_response') FROM public.ai_provider_executions WHERE model='reconcile-race-1';
SELECT pg_sleep(2) /*reconcile-before-uninstall*/;
COMMIT;
SQL
winner=$!; barrier reconcile-before-uninstall
uninstall 1 >/dev/null
wait "$winner"
query <<'SQL' >/dev/null &
BEGIN;
SELECT public.resolve_failed_generation_internal(id,user_id,job_id,result,'invalid_response') FROM public.ai_provider_executions WHERE model='reconcile-race-2';
SELECT pg_sleep(2) /*reconcile-concurrent-retry*/;
COMMIT;
SQL
winner=$!; barrier reconcile-concurrent-retry
if resolve 2 2>/dev/null; then echo 'FAIL: busy row lock should fail closed'; exit 1; fi
wait "$winner"
[[ "$(resolve 2)" == 't' ]]
[[ "$(query -c "SELECT count(*) FROM public.ai_usage_logs WHERE model LIKE 'reconcile-race-%';")" == '2' ]]
[[ "$(query -c "SELECT count(*) FROM public.ai_provider_executions WHERE model LIKE 'reconcile-race-%' AND result IS NOT NULL AND application_recovery_attempts=0 AND application_resolution='invalid_response';")" == '2' ]]
echo 'PASS: unresolved uninstall denied; final proof/uninstall ordered; concurrent retry idempotent; receipts/results retained'
