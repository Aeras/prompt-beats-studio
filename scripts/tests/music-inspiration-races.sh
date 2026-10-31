#!/usr/bin/env bash
# Local disposable fixture only; no URLs, linked databases, providers or paid calls.
# Usage: bash scripts/tests/music-inspiration-races.sh PROJECT_ID [DISPOSABLE_DB]
set -euo pipefail
project_id="${1:?local fixture Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
database="${2:-postgres}"
[[ "$database" =~ ^[a-zA-Z0-9_-]+$ ]]
query(){ docker exec -i "$db" psql -X -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -tA "$@"; }
# Refuse a fixture with runner credentials; never change external settings to test.
[[ "$(query -c "SELECT count(*) FROM public.app_settings WHERE key IN ('runner_url','runner_token')")" == 0 ]]
[[ "$(query -c 'SELECT enabled FROM public.global_ai_usage_policy WHERE singleton')" == t ]]
owner='c4511000-0000-4000-8000-000000000001'
job='c4511000-0000-4000-8000-000000000002'
lease='c4511000-0000-4000-8000-000000000003'
request='c4511000-0000-4000-8000-000000000004'
dispatch='c4511000-0000-4000-8000-000000000005'
profile='c4511000-0000-4000-8000-000000000006'
model='music-inspiration-race-fixture'
cleanup(){ query <<SQL >/dev/null
DELETE FROM auth.users WHERE id='$owner';
DELETE FROM public.ai_models WHERE provider_model_id='$model';
SQL
}
trap cleanup EXIT
query <<SQL >/dev/null
INSERT INTO auth.users(id,email)VALUES('$owner','music-inspiration-race@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status)VALUES('$owner','user','active') ON CONFLICT(user_id)DO UPDATE SET role='user',moderation_status='active';
INSERT INTO public.beta_testers(user_id)VALUES('$owner');
INSERT INTO public.ai_models(provider,provider_model_id,display_name,status,generator_compatible,generator_enabled)VALUES('openai','$model','Local race only','enabled',true,true);
SQL
barrier(){
 local seen=false
 for i in $(seq 1 120); do
  if [[ "$(query -c "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='$1' AND wait_event='PgSleep')")" == t ]]; then seen=true;break;fi
  sleep 0.025
 done
 [[ "$seen" == true ]]
}
# Same-request admission waits for owner lock and returns the exact committed row.
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_start_barrier';
SELECT public.start_music_inspiration_job('$owner','$request','{"depth":"standard"}','$model','openai',0.25);
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_start_barrier
# Uninstall waits for the same registry fence, then observes the admitted job.
if query -c "DELETE FROM public.ai_models WHERE provider_model_id='$model'" >/dev/null 2>&1;then echo 'FAIL: active model removed' >&2;exit 1;fi
query <<SQL >/dev/null
SELECT public.start_music_inspiration_job('$owner','$request','{"depth":"standard"}','$model','openai',0.25);
SQL
wait "$first"
[[ "$(query -c "SELECT count(*) FROM public.music_inspiration_jobs WHERE user_id='$owner'")" == 1 ]]
job="$(query -c "SELECT id FROM public.music_inspiration_jobs WHERE user_id='$owner'")"
# Claim winner blocks competitor; no parallel active lease.
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_claim_barrier';
SELECT public.claim_music_inspiration_job('$job','$lease');
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_claim_barrier
[[ "$(query -c "SELECT (public.claim_music_inspiration_job('$job',gen_random_uuid())).id IS NULL")" == t ]]
wait "$first"
# Both reserve the same stable query key. Only the committed winner may call out.
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_reserve_barrier';
SELECT public.reserve_music_inspiration_dispatch('$job','$lease','$dispatch','search',0.02,1);
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_reserve_barrier
[[ "$(query -c "SELECT public.reserve_music_inspiration_dispatch('$job','$lease','$dispatch','search',0.02,1)")" == f ]]
wait "$first"
[[ "$(query -c "SELECT reserved_usd=0.02 AND search_credits=1 FROM public.music_inspiration_jobs WHERE id='$job'")" == t ]]
# Expired worker loses claim; durable started reservation cannot be replayed.
query -c "UPDATE public.music_inspiration_jobs SET lease_until=now()-interval '1 second' WHERE id='$job'" >/dev/null
newlease='c4511000-0000-4000-8000-000000000007'
[[ "$(query -c "SELECT (public.claim_music_inspiration_job('$job','$newlease')).id IS NOT NULL")" == t ]]
[[ "$(query -c "SELECT public.reserve_music_inspiration_dispatch('$job','$newlease','$dispatch','search',0.02,1)")" == f ]]
if query -c "SELECT public.checkpoint_music_inspiration_job('$job','$lease','{}')" >/dev/null 2>&1; then echo 'FAIL: stale checkpoint' >&2;exit 1;fi
# Two independent workers contend for the last recovery attempt: exactly one wins.
[[ "$(query -c "SELECT recovery_attempts=1 FROM public.music_inspiration_jobs WHERE id='$job'")" == t ]]
query -c "UPDATE public.music_inspiration_jobs SET recovery_attempts=2,lease_until=now()-interval '1 second' WHERE id='$job'" >/dev/null
[[ "$(query -c "SELECT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() WHERE id='$job')")" == t ]]
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_cap_barrier';
SELECT public.claim_music_inspiration_job('$job',gen_random_uuid());
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_cap_barrier
[[ "$(query -c "SELECT (public.claim_music_inspiration_job('$job',gen_random_uuid())).id IS NULL")" == t ]]
wait "$first"
[[ "$(query -c "SELECT recovery_attempts=3 FROM public.music_inspiration_jobs WHERE id='$job'")" == t ]]
query -c "UPDATE public.music_inspiration_jobs SET lease_until=now()-interval '1 second' WHERE id='$job'" >/dev/null
[[ "$(query -c "SELECT (public.claim_music_inspiration_job('$job',gen_random_uuid())).id IS NULL")" == t ]]
[[ "$(query -c "SELECT NOT EXISTS(SELECT 1 FROM public.pending_music_inspiration_job_ids() WHERE id='$job')")" == t ]]
# Cancellation commits first; late receipt remains durable and cannot restart work.
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_cancel_barrier';
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.cancel_music_inspiration_job('$job');
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_cancel_barrier
query -c "SELECT public.settle_music_inspiration_dispatch('$job','$dispatch','observed','{\"late\":true}')" >/dev/null
wait "$first"
[[ "$(query -c "SELECT status='cancelled' AND reserved_usd=0.02 FROM public.music_inspiration_jobs WHERE id='$job'")" == t ]]
[[ "$(query -c "SELECT state='observed' AND receipt->>'late'='true' FROM public.music_inspiration_dispatches WHERE dispatch_key='$dispatch'")" == t ]]
# A separate server-completed job is the only source of profile evidence.
source_job='c4511000-0000-4000-8000-000000000008'
query <<SQL >/dev/null
INSERT INTO public.music_inspiration_jobs(id,user_id,request_id,request,model,provider,budget_usd,status,result)VALUES('$source_job','$owner',gen_random_uuid(),'{"depth":"standard"}','$model','openai',0.01,'completed','{"trusted":true}');
SQL
# Profile CAS winner commits, stale writer fails after waiting on the same row.
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.save_music_inspiration_profile('$profile',NULL,'Original','$source_job');
COMMIT;
SQL
[[ "$(query -c "SELECT revision=1 FROM public.music_inspiration_profiles WHERE id='$profile'")" == t ]]
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_profile_barrier';
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.save_music_inspiration_profile('$profile',1,'Winner',NULL);
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_profile_barrier
if query <<SQL >/dev/null 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.save_music_inspiration_profile('$profile',1,'Lost',NULL);
COMMIT;
SQL
then echo 'FAIL: stale profile overwrite' >&2;exit 1;fi
wait "$first"
[[ "$(query -c "SELECT revision=2 AND name='Winner' FROM public.music_inspiration_profiles WHERE id='$profile'")" == t ]]
# Abandon wins: a delayed POST waits for the same lock then cannot dispatch.
replacement_request='c4511000-0000-4000-8000-000000000090'
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_abandon_barrier';
SELECT public.abandon_music_inspiration_request_internal('$owner','$replacement_request');
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_abandon_barrier
if query -c "SELECT public.start_music_inspiration_job('$owner','$replacement_request','{\"depth\":\"standard\"}','$model','openai',100)" >/dev/null 2>&1;then echo 'FAIL: abandoned request dispatched' >&2;exit 1;fi
wait "$first"
# Start wins: abandonment recovers that exact job, never removes evidence.
replacement_request='c4511000-0000-4000-8000-000000000091'
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_known_barrier';
SELECT public.start_music_inspiration_job('$owner','$replacement_request','{"depth":"standard"}','$model','openai',100);
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_known_barrier
[[ "$(query -c "SELECT public.abandon_music_inspiration_request_internal('$owner','$replacement_request')->>'request_id'")" == "$replacement_request" ]]
wait "$first"
# Security-state barrier: revoke wins before new admission, even with a service caller.
query <<SQL >/dev/null &
BEGIN;
SET application_name='music_inspiration_revoke_barrier';
SELECT public._lock_user_security_state('$owner');
DELETE FROM public.beta_testers WHERE user_id='$owner';
SELECT pg_sleep(1.5);
COMMIT;
SQL
first=$!
barrier music_inspiration_revoke_barrier
if query -c "SELECT public.start_music_inspiration_job('$owner',gen_random_uuid(),'{\"depth\":\"standard\"}','$model','openai',0.25)" >/dev/null 2>&1;then echo 'FAIL: revoked admission' >&2;exit 1;fi
wait "$first"
echo 'PASS: admission, claim, dispatch, stale-lease, recovery-cap/discovery, cancel/receipt, profile CAS and revocation races'
