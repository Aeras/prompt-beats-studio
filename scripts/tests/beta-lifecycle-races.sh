#!/usr/bin/env bash
# Independent connections to a disposable local replay database, never linked.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
actor='bc000000-0000-4000-8000-000000000001'
other='bc000000-0000-4000-8000-000000000002'
target='bc000000-0000-4000-8000-000000000003'
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES ('$actor','beta-race-a@example.invalid'),('$other','beta-race-b@example.invalid'),('$target','beta-race-c@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES ('$actor','super_admin','active'),('$other','super_admin','active'),('$target','user','active');
SELECT public.register_beta_feature('beta_race_fixture','Race','Local only');
SQL
# Winner holds the feature row; stale competing action must fail after waiting.
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_feature_transition('beta_race_fixture','stable',0);
SELECT pg_sleep(0.8);
COMMIT;
SQL
first=$!
sleep 0.2
if stale_output="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$other',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_feature_transition('beta_race_fixture','archive',0);
COMMIT;
SQL
 )"
then echo 'FAIL: stale concurrent lifecycle transition succeeded' >&2; exit 1; fi
[[ "$stale_output" == *'Beta settings changed. Refresh and retry.'* ]] || { echo 'FAIL: unexpected competing transition error' >&2; exit 1; }
wait "$first"
# Simultaneous same promotion is idempotent: one policy and one audit event.
promote() { query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$1',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_feature_transition('beta_race_fixture','promote',1,true);
SELECT pg_sleep(0.2);
COMMIT;
SQL
}
promote "$actor" & first=$!
promote "$other" & second=$!
wait "$first"; wait "$second"
grant_tester() { query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$1',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_tester_set('$target',true,false);
SELECT pg_sleep(0.2);
COMMIT;
SQL
}
grant_tester "$actor" & first=$!
grant_tester "$other" & second=$!
wait "$first"; wait "$second"
query <<SQL >/dev/null
SELECT public.register_beta_feature('beta_race_access','Access race','Local only');
BEGIN;
SELECT set_config('request.jwt.claim.sub','$target',true);
DO \$\$ BEGIN IF NOT public.current_user_can_use_feature('beta_race_access') THEN RAISE EXCEPTION 'Grant not effective'; END IF; END \$\$;
COMMIT;
SQL
# Account change owns the same user-security fence before a stale administrator
# attempts a grant. It must wait and reject; it cannot authorize from stale JWT.
query <<SQL >/dev/null &
BEGIN;
UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='$actor';
SELECT pg_sleep(0.8);
COMMIT;
SQL
first=$!
sleep 0.2
if denied_output="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.beta_tester_set('$other',true,false);
COMMIT;
SQL
)"; then echo 'FAIL: stale banned administrator granted tester access' >&2; exit 1; fi
[[ "$denied_output" == *'Not allowed'* ]] || { echo 'FAIL: unexpected security fence error' >&2; exit 1; }
wait "$first"
query -c "UPDATE auth.users SET banned_until=NULL WHERE id='$actor';" >/dev/null
query <<SQL >/dev/null
DO \$\$ BEGIN
 IF (SELECT count(*) FROM public.feature_access_policies WHERE feature_key='beta_race_fixture')<>1 OR
    (SELECT count(*) FROM public.beta_feature_events WHERE feature_key='beta_race_fixture' AND action='promote')<>1 OR
    (SELECT count(*) FROM public.beta_feature_events WHERE target_user_id='$target' AND action='tester_grant')<>1 THEN RAISE EXCEPTION 'Duplicate effects'; END IF;
END \$\$;
BEGIN;
SELECT set_config('request.jwt.claim.sub','$actor',true);
SET LOCAL ROLE authenticated;
SELECT public.feature_access_set_policy('beta_race_fixture','disabled');
SELECT public.beta_feature_transition('beta_race_fixture','promote',1,true);
SELECT public.beta_tester_set('$target',false,true);
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub','$target',true);
DO \$\$ BEGIN IF public.current_user_can_use_feature('beta_race_access') THEN RAISE EXCEPTION 'Revoked entitlement still effective'; END IF; END \$\$;
COMMIT;
DO \$\$ BEGIN
 IF (SELECT access_mode FROM public.feature_access_policies WHERE feature_key='beta_race_fixture')<>'disabled' OR
    EXISTS(SELECT 1 FROM public.beta_testers WHERE user_id='$target') THEN RAISE EXCEPTION 'Retry reset or lost revocation'; END IF;
END \$\$;
-- Remove only this script's synthetic fixtures from the disposable database.
DELETE FROM public.beta_feature_events WHERE feature_key IN ('beta_race_fixture','beta_race_access') OR target_user_id='$target';
DELETE FROM public.feature_access_policies WHERE feature_key='beta_race_fixture';
DELETE FROM public.beta_features WHERE feature_key IN ('beta_race_fixture','beta_race_access');
DELETE FROM auth.users WHERE id IN ('$actor','$other','$target');
SQL
echo 'PASS: Beta CAS, duplicate promotion, entitlement races, revocation and account-security fence'
