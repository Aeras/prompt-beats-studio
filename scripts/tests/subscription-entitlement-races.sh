#!/usr/bin/env bash
# PB-015 independent-connection entitlement/admission races on disposable replay DB only.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

actor='bd160000-0000-4000-8000-000000000001'
target='bd160000-0000-4000-8000-000000000002'
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES
 ('$actor','pb015-race-admin@example.invalid'),
 ('$target','pb015-race-user@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES
 ('$actor','super_admin','active'),
 ('$target','user','active');
INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
 VALUES('pb015_race_feature','PB-015 race','Disposable local race fixture','pro_only');
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_create(
 '$target','pro',statement_timestamp()+interval '1 day','race fixture grant'
);
RESET ROLE;
SQL

grant_id="$(query -c "SELECT id FROM public.subscription_manual_grants WHERE user_id='$target' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;")"
test -n "$grant_id"

# Revoke-first: admission waits behind the entitlement lock and must observe revoked state.
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_revoke('$grant_id','race revoke first');
SELECT pg_sleep(1) /*pb015-revoke-first*/;
COMMIT;
SQL
winner=$!
sleep 0.2
if query -c "SELECT public.admit_feature_ai_dispatch_internal('$target',ARRAY['pb015_race_feature']);" >/dev/null 2>&1; then
  echo 'FAIL: admission succeeded after revoke-first ordering' >&2
  exit 1
fi
wait "$winner"

# Re-create a Pro grant.
query <<SQL >/dev/null
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_create(
 '$target','pro',statement_timestamp()+interval '1 day','race fixture second grant'
);
RESET ROLE;
SQL
grant_id2="$(query -c "SELECT id FROM public.subscription_manual_grants WHERE user_id='$target' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;")"

# Admission-first: one admitted transaction may complete; revoke then wins for later admissions.
query <<SQL >/dev/null &
BEGIN;
SELECT public.admit_feature_ai_dispatch_internal('$target',ARRAY['pb015_race_feature']);
SELECT pg_sleep(1) /*pb015-admission-first*/;
COMMIT;
SQL
admitted=$!
sleep 0.2
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_revoke('$grant_id2','race revoke after admission');
COMMIT;
SQL
wait "$admitted"
if query -c "SELECT public.admit_feature_ai_dispatch_internal('$target',ARRAY['pb015_race_feature']);" >/dev/null 2>&1; then
  echo 'FAIL: later admission succeeded after revoke' >&2
  exit 1
fi

# Stale Super Admin authority: security-state mutation commits first, grant must fail.
query -c "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='$actor';" >/dev/null
if output="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_create(
 '$target','plus',statement_timestamp()+interval '1 day','stale actor attempt'
);
COMMIT;
SQL
)"; then
  echo 'FAIL: stale/banned Super Admin created grant' >&2
  exit 1
fi
[[ "$output" == *'not allowed'* ]] || { echo 'FAIL: unexpected stale-authority error' >&2; exit 1; }

query -c "UPDATE auth.users SET banned_until=NULL WHERE id='$actor';" >/dev/null

# Role-removal-first: grant waits on the actor security row and must observe the
# committed loss of Super Admin authority.
query <<SQL >/dev/null &
BEGIN;
UPDATE public.user_roles SET role='user' WHERE user_id='$actor';
SELECT pg_sleep(1) /*pb015-role-removal-first*/;
COMMIT;
SQL
role_removal=$!
sleep 0.2
if query <<SQL >/dev/null 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_create(
 '$target','plus',statement_timestamp()+interval '1 day','role removal first'
);
COMMIT;
SQL
then
  echo 'FAIL: grant succeeded after role-removal-first ordering' >&2
  exit 1
fi
wait "$role_removal"
query -c "UPDATE public.user_roles SET role='super_admin' WHERE user_id='$actor';" >/dev/null

# Grant-first: the protected mutation holds the actor security lock. A concurrent
# role removal must wait, so the already-admitted grant deterministically commits
# before authority is removed.
before_grants="$(query -c "SELECT count(*) FROM public.subscription_manual_grants WHERE user_id='$target' AND reason='grant first race';")"
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_create(
 '$target','plus',statement_timestamp()+interval '1 day','grant first race'
);
SELECT pg_sleep(1) /*pb015-grant-first*/;
COMMIT;
SQL
grant_first=$!
sleep 0.2
query -c "UPDATE public.user_roles SET role='user' WHERE user_id='$actor';" >/dev/null &
role_after=$!
wait "$grant_first"
wait "$role_after"
after_grants="$(query -c "SELECT count(*) FROM public.subscription_manual_grants WHERE user_id='$target' AND reason='grant first race';")"
[[ "$after_grants" -eq $((before_grants + 1)) ]] || {
  echo 'FAIL: grant-first ordering did not commit exactly one grant' >&2
  exit 1
}
query -c "UPDATE public.user_roles SET role='super_admin' WHERE user_id='$actor';" >/dev/null

# Duplicate revoke is idempotent and cannot create duplicate revoke audit.
before="$(query -c "SELECT count(*) FROM public.admin_audit_log WHERE action='REVOKE_SUBSCRIPTION_MANUAL_GRANT' AND details->>'grant_id'='$grant_id2';")"
query <<SQL >/dev/null
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_revoke('$grant_id2','duplicate revoke retry');
RESET ROLE;
SQL
after="$(query -c "SELECT count(*) FROM public.admin_audit_log WHERE action='REVOKE_SUBSCRIPTION_MANUAL_GRANT' AND details->>'grant_id'='$grant_id2';")"
[[ "$before" = "$after" ]] || { echo 'FAIL: duplicate revoke created another audit' >&2; exit 1; }

# Clean disposable fixtures.
query <<SQL >/dev/null
DELETE FROM public.feature_access_policies WHERE feature_key='pb015_race_feature';
DELETE FROM auth.users WHERE id IN ('$actor','$target');
SQL

echo 'PASS: PB-015 revoke/admission ordering, stale authority and duplicate revoke'
