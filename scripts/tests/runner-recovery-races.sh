#!/usr/bin/env bash
# Disposable Docker only. Never enqueue HTTP: second connection must see the held lock.
set -euo pipefail
project_id="${1:?local project ID required}"
database="${2:-postgres}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ && "$database" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query(){ docker exec -i "$db" psql -X -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -tA "$@"; }
[[ "$(query -c "SELECT count(*) FROM public.app_settings WHERE key IN ('runner_url','runner_token')")" == 0 ]]
query <<'SQL' >/dev/null &
BEGIN;
SET application_name='pb_runner_sweep_barrier';
SELECT pg_advisory_xact_lock(hashtextextended('promptbeats:runner:sweep',0));
SELECT pg_sleep(2);
ROLLBACK;
SQL
first=$!
seen=false
for _ in $(seq 1 80); do
 if [[ "$(query -c "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='pb_runner_sweep_barrier' AND wait_event='PgSleep')")" == t ]]; then seen=true;break;fi
 sleep 0.025
done
[[ "$seen" == true ]]
[[ "$(query -c "SELECT (public.dispatch_ai_runner_sweep_internal()->>'busy')::boolean")" == t ]]
wait "$first"
echo 'PASS: concurrent scheduler connection returns busy without dispatch or provider work'
