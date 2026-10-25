#!/usr/bin/env bash
# Disposable local DB only; observed barriers and independent connections.
set -euo pipefail
project="${1:?local project ID required}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
actor='af000000-0000-4000-8000-000000000001'
wait_sleep() {
 for _ in $(seq 1 100); do
  if [[ "$(query -c "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%$1%';")" != 0 ]]; then return; fi
  sleep 0.05
 done
 echo 'FAIL: auxiliary registry barrier not observed' >&2; exit 1
}
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES('$actor','precise-races@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('$actor','admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin';
INSERT INTO public.ai_models(id,provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled)
SELECT ('af100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai','precise-race-'||n,'Precise race '||n,'enabled',true,true,true,true FROM generate_series(1,3)n;
INSERT INTO public.ai_auxiliary_requests(id,user_id,operation,request_key,status,execution_token) VALUES('af200000-0000-4000-8000-000000000001','$actor','song_setup_assistant','af300000-0000-4000-8000-000000000001','processing','af400000-0000-4000-8000-000000000001');
SQL
query <<SQL >/dev/null &
BEGIN;
SELECT public.auxiliary_model_use_start_internal('$actor','song_setup_assistant','af300000-0000-4000-8000-000000000001','af400000-0000-4000-8000-000000000001','precise-race-1','af500000-0000-4000-8000-000000000001');
SELECT pg_sleep(2) /*precise-aux-start-wins*/;
COMMIT;
SQL
winner=$!; wait_sleep precise-aux-start-wins
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"af100000-0000-4000-8000-000000000001","revision":0}]',true);
COMMIT;
SQL
)"; then echo 'FAIL: uninstalled a concurrently admitted model' >&2; exit 1; fi
[[ "$error" == *'active defaults or dependencies'* ]]; wait "$winner"
# An unrelated model remains uninstallable while that exact dispatch is active.
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"af100000-0000-4000-8000-000000000002","revision":0}]',true);
SELECT pg_sleep(2) /*precise-uninstall-wins*/;
COMMIT;
SQL
winner=$!; wait_sleep precise-uninstall-wins
if error="$(query -c "SELECT public.auxiliary_model_use_start_internal('$actor','song_setup_assistant','af300000-0000-4000-8000-000000000001','af400000-0000-4000-8000-000000000001','precise-race-2',gen_random_uuid());" 2>&1)"; then echo 'FAIL: dispatched after concurrent uninstall' >&2; exit 1; fi
[[ "$error" == *'no longer installed'* ]]; wait "$winner"
# Failed UI state does not release a dispatch. A real durable usage receipt can.
query <<SQL >/dev/null
UPDATE public.ai_auxiliary_requests SET status='failed' WHERE id='af200000-0000-4000-8000-000000000001';
INSERT INTO public.ai_usage_logs(id,user_id,provider,model,operation,input_tokens,output_tokens,total_tokens,provider_usage_state) VALUES('af600000-0000-4000-8000-000000000001','$actor','openai','precise-race-1','song_setup_assistant',10,5,15,'final');
SQL
query <<SQL >/dev/null &
BEGIN;
SELECT public.auxiliary_model_use_receipt_internal('af500000-0000-4000-8000-000000000001','af600000-0000-4000-8000-000000000001');
SELECT pg_sleep(2) /*precise-usage-settlement*/;
COMMIT;
SQL
winner=$!; wait_sleep precise-usage-settlement
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"af100000-0000-4000-8000-000000000001","revision":0}]',true);
COMMIT;
DO \$\$ BEGIN
 IF EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id='precise-race-1') OR NOT EXISTS(SELECT 1 FROM public.ai_usage_logs WHERE id='af600000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Settlement/deletion race lost financial history'; END IF;
END \$\$;
SQL
wait "$winner"
query <<SQL >/dev/null
DELETE FROM public.ai_auxiliary_requests WHERE user_id='$actor';
DELETE FROM public.ai_models WHERE provider_model_id LIKE 'precise-race-%';
DELETE FROM public.ai_model_uninstall_guard WHERE provider_model_id LIKE 'precise-race-%';
DELETE FROM public.ai_usage_logs WHERE user_id='$actor';
DELETE FROM public.admin_audit_log WHERE admin_user_id='$actor';
DELETE FROM auth.users WHERE id='$actor';
SQL
echo 'PASS: precise auxiliary/uninstall in both orders, unrelated model removal and financial settlement/uninstall races'
