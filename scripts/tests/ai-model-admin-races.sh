#!/usr/bin/env bash
# Disposable replay database only. Independent connections with observed barriers.
set -euo pipefail
project="${1:?local project ID required}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
actor='ad000000-0000-4000-8000-000000000001'
wait_sleep() {
 for _ in $(seq 1 100); do
  if [[ "$(query -c "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%$1%';")" != 0 ]]; then return; fi
  sleep 0.05
 done
 echo 'FAIL: registry race barrier not observed' >&2; exit 1
}
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES('$actor','model-races@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('$actor','admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin';
INSERT INTO public.ai_models(id,provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled)
 SELECT ('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai','offline-race-'||n,'Offline race '||n,'enabled',true,true,true,true FROM generate_series(1,5) n;
SQL
old_default="$(query -c "SELECT quote_literal(value::text) FROM public.app_settings WHERE key='ai_generator_default_model';")"
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_patch_ai_model('ad100000-0000-4000-8000-000000000001','{"status":"testing"}',0);
SELECT pg_sleep(2) /*model-cas-winner*/;
COMMIT;
SQL
winner=$!; wait_sleep model-cas-winner
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_patch_ai_model('ad100000-0000-4000-8000-000000000001','{"access_policy":"admin_only"}',0);
COMMIT;
SQL
)"; then echo 'FAIL: stale edit overwrote current settings' >&2; exit 1; fi
[[ "$error" == *'settings changed'* ]]; wait "$winner"
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_patch_ai_model('ad100000-0000-4000-8000-000000000001','{"access_policy":"selected_users"}',1);
COMMIT;
DO \$\$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.ai_models WHERE provider_model_id='offline-race-1' AND status='testing' AND access_policy='selected_users' AND admin_revision=2) THEN RAISE EXCEPTION 'Lost independent field'; END IF; END \$\$;
SQL
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_ai_model_default('generator','offline-race-2');
SELECT pg_sleep(2) /*model-default-winner*/;
COMMIT;
SQL
winner=$!; wait_sleep model-default-winner
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ad100000-0000-4000-8000-000000000002","revision":0}]',true);
COMMIT;
SQL
)"; then echo 'FAIL: deleted concurrently assigned default' >&2; exit 1; fi
[[ "$error" == *'active defaults or dependencies'* ]]; wait "$winner"
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ad100000-0000-4000-8000-000000000003","revision":0}]',true);
SELECT pg_sleep(2) /*model-delete-winner*/;
COMMIT;
SQL
winner=$!; wait_sleep model-delete-winner
if error="$(query -c "SELECT public.begin_ai_execution_internal(gen_random_uuid(),'$actor','generate','openai','offline-race-3',NULL,NULL,NULL);" 2>&1)"; then echo 'FAIL: dispatch admitted after uninstall' >&2; exit 1; fi
[[ "$error" == *'no longer installed'* ]]; wait "$winner"
query <<SQL >/dev/null &
BEGIN;
INSERT INTO public.user_model_access(user_id,access_mode,allowed_models) VALUES('$actor','custom',ARRAY['offline-race-4']);
SELECT pg_sleep(2) /*model-grant-winner*/;
COMMIT;
SQL
winner=$!; wait_sleep model-grant-winner
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ad100000-0000-4000-8000-000000000004","revision":0}]',true);
COMMIT;
SQL
)"; then echo 'FAIL: orphaned concurrently assigned user access' >&2; exit 1; fi
[[ "$error" == *'active defaults or dependencies'* ]]; wait "$winner"
# Reverse ordering: once deletion commits, assignment must fail, not create an orphan.
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_uninstall_ai_models('[{"id":"ad100000-0000-4000-8000-000000000005","revision":0}]',true);
SELECT pg_sleep(2) /*model-delete-before-default*/;
COMMIT;
SQL
winner=$!; wait_sleep model-delete-before-default
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_ai_model_default('generator','offline-race-5');
COMMIT;
SQL
)"; then echo 'FAIL: assigned deleted default' >&2; exit 1; fi
[[ "$error" == *'not eligible'* ]]; wait "$winner"
query <<SQL >/dev/null
UPDATE public.app_settings SET value=$old_default::jsonb WHERE key='ai_generator_default_model';
DELETE FROM public.user_model_access WHERE user_id='$actor';
DELETE FROM public.ai_models WHERE provider_model_id LIKE 'offline-race-%';
DELETE FROM public.ai_model_uninstall_guard WHERE provider_model_id LIKE 'offline-race-%';
DELETE FROM public.admin_audit_log WHERE admin_user_id='$actor';
DELETE FROM auth.users WHERE id='$actor';
SQL
echo 'PASS: CAS, independent fields, default/delete (both orders), grant/delete and dispatch/delete races'
