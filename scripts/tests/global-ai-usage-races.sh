#!/usr/bin/env bash
# Disposable local database only. Independent transactions and observed barriers.
set -euo pipefail
project="${1:?local project ID required}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
wait_barrier() {
 for _ in $(seq 1 100); do
  if [[ "$(query -c "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%$1%';")" != 0 ]]; then return; fi
  sleep 0.05
 done
 echo 'FAIL: global policy barrier not observed' >&2; exit 1
}
query <<'SQL' >/dev/null
INSERT INTO auth.users(id,email) VALUES('ab900000-0000-4000-8000-000000000001','global-race@example.invalid') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES('ab900000-0000-4000-8000-000000000001','admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin';
SQL
query <<'SQL' >/dev/null &
BEGIN;
SELECT public.admit_global_ai_dispatch_internal();
SELECT pg_sleep(2) /*global-admission-wins*/;
COMMIT;
SQL
winner=$!; wait_barrier global-admission-wins
query <<'SQL' >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','ab900000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_global_ai_usage(false,0);
COMMIT;
SQL
wait "$winner"
if query -c 'SELECT public.admit_global_ai_dispatch_internal();' 2>/dev/null; then echo 'FAIL: OFF allowed dispatch'; exit 1; fi
query -c 'UPDATE public.global_ai_usage_policy SET enabled=true,revision=0;' >/dev/null
query <<'SQL' >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','ab900000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_global_ai_usage(false,0);
SELECT pg_sleep(2) /*global-off-wins*/;
COMMIT;
SQL
winner=$!; wait_barrier global-off-wins
if query -c 'SELECT public.admit_global_ai_dispatch_internal();' 2>/dev/null; then echo 'FAIL: concurrent OFF bypass'; exit 1; fi
wait "$winner"
query -c 'UPDATE public.global_ai_usage_policy SET enabled=true,revision=0;' >/dev/null
echo 'PASS: admission-first and OFF-first independent transaction ordering'
