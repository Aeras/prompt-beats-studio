#!/usr/bin/env bash
# Disposable database only; independent sessions, no provider or production calls.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query(){ docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
target='ca280000-0000-4000-8000-000000000001'
cleanup(){ query <<SQL >/dev/null
DELETE FROM auth.users WHERE id='$target';
SQL
}
trap cleanup EXIT
query <<SQL >/dev/null
INSERT INTO auth.users(id,email)VALUES('$target','atlas-race@example.invalid');
INSERT INTO public.beta_testers(user_id)VALUES('$target');
SQL
query <<SQL >/dev/null &
BEGIN;
SET application_name='atlas_revoke_barrier';
SELECT public._lock_user_security_state('$target');
DELETE FROM public.beta_testers WHERE user_id='$target';
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
# Observe the real barrier instead of assuming a worker started after a sleep.
seen=false
for i in $(seq 1 80); do
 if [[ "$(query -c "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='atlas_revoke_barrier' AND wait_event='PgSleep')")" == t ]];then seen=true;break;fi
 sleep 0.03
done
[[ "$seen" == true ]]
if output="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$target',true);
SET LOCAL ROLE authenticated;
SELECT public.atlas_preview_admission();
COMMIT;
SQL
)";then echo 'FAIL: concurrent revoked tester accessed Atlas' >&2;exit 1;fi
[[ "$output" == *'Atlas research preview not available'* ]]
wait "$first"
query <<SQL >/dev/null
INSERT INTO public.beta_testers(user_id)VALUES('$target');
BEGIN;
SELECT set_config('request.jwt.claim.sub','$target',true);
SET LOCAL ROLE authenticated;
SELECT public.atlas_preview_admission();
COMMIT;
DELETE FROM public.beta_testers WHERE user_id='$target';
SQL
echo 'PASS: independent Atlas admission/revocation ordering; regrant remains compatible'
