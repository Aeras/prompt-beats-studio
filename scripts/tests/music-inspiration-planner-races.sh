#!/usr/bin/env bash
# Disposable Docker only. No provider, linked DB, scheduler or external networking.
set -euo pipefail
project_id="${1:?local project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query(){ docker exec -i "$db" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
[[ "$(query -c "SELECT count(*) FROM public.app_settings WHERE key IN ('runner_url','runner_token')")" == 0 ]]
[[ "$(query -c 'SELECT enabled FROM public.global_ai_usage_policy WHERE singleton')" == t ]]
owner='c0142000-0000-4000-8000-000000000001'
request='c0142000-0000-4000-8000-000000000002'
model='pb014-race-synthesis'
planner_created=false
work="$(mktemp -d /tmp/pb014-races.XXXXXX)"
cleanup(){
 query -c "DELETE FROM auth.users WHERE id='$owner'; DELETE FROM public.ai_models WHERE provider_model_id='$model';" >/dev/null
 if [[ "$planner_created" == true ]]; then query -c "DELETE FROM public.ai_models WHERE provider_model_id='openai/gpt-6-luna';" >/dev/null; fi
 [[ "$work" == /tmp/pb014-races.* ]] && rm -rf -- "$work"
}
trap cleanup EXIT
if [[ "$(query -c "SELECT count(*) FROM public.ai_models WHERE provider_model_id='openai/gpt-6-luna'")" == 0 ]]; then
 query -c "INSERT INTO public.ai_models(provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,access_policy) VALUES('openrouter','openai/gpt-6-luna','Offline planner race','enabled',true,true,'selected_users');" >/dev/null
 planner_created=true
fi
[[ "$(query -c "SELECT count(*) FROM public.ai_models WHERE provider_model_id='openai/gpt-6-luna' AND provider::text='openrouter' AND status='enabled' AND generator_enabled AND generator_compatible")" == 1 ]]
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES('$owner','pb014-race@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status)VALUES('$owner','user','active') ON CONFLICT(user_id)DO UPDATE SET role='user',moderation_status='active';
INSERT INTO public.beta_testers(user_id)VALUES('$owner');
INSERT INTO public.ai_models(provider,provider_model_id,display_name,status,generator_compatible,generator_enabled,access_policy)VALUES('openai','$model','Offline synthesis race','enabled',true,true,'all_users');
INSERT INTO public.user_model_access(user_id,access_mode,allowed_models)VALUES('$owner','custom',ARRAY['openai/gpt-6-luna','$model']) ON CONFLICT(user_id)DO UPDATE SET access_mode='custom',allowed_models=excluded.allowed_models;
SQL
start="SELECT public.start_music_inspiration_job_v3('$owner','$request',jsonb_build_object('kind','artist','artist','Offline race','depth','standard'),'$model','openai','{}','{}')->>'id'"
query -c "$start" >"$work/start-a" & a=$!
query -c "$start" >"$work/start-b" & b=$!
wait "$a"; wait "$b"
job="$(cat "$work/start-a")"
[[ "$job" == "$(cat "$work/start-b")" && "$job" =~ ^[0-9a-f-]{36}$ ]]
planner="$(query -c "SELECT planner_execution_id FROM public.music_inspiration_jobs WHERE id='$job'")"
query -c "SELECT (public.claim_music_inspiration_job_v2('$job',gen_random_uuid())).id IS NOT NULL" >"$work/claim-a" & a=$!
query -c "SELECT (public.claim_music_inspiration_job_v2('$job',gen_random_uuid())).id IS NOT NULL" >"$work/claim-b" & b=$!
wait "$a"; wait "$b"
[[ "$(cat "$work/claim-a" "$work/claim-b" | grep -c '^t$')" == 1 ]]
lease="$(query -c "SELECT lease_token FROM public.music_inspiration_jobs WHERE id='$job'")"
reserve="SELECT public.reserve_music_inspiration_dispatch('$job','$lease','$planner','planner',0,0)"
query -c "BEGIN; $reserve; SELECT pg_sleep(1); COMMIT;" >"$work/reserve-a" & a=$!
query -c "$reserve" >"$work/reserve-b" & b=$!
wait "$a"; wait "$b"
[[ "$(cat "$work/reserve-a" "$work/reserve-b" | grep -c '^t$')" == 1 ]]
# Registry deletion serializes with dispatch reservations and must preserve the active planner.
query -c "BEGIN; SELECT pg_advisory_xact_lock_shared(hashtextextended('pb:ai-model-registry:v1',0)); SELECT pg_sleep(1); COMMIT;" >"$work/fence" & a=$!
sleep 0.1
if query -c "DELETE FROM public.ai_models WHERE provider_model_id='openai/gpt-6-luna'" >"$work/uninstall" 2>&1; then echo 'Active planner uninstall unexpectedly succeeded' >&2; exit 1; fi
wait "$a"
grep -q 'Planner has active or unreconciled research' "$work/uninstall"
# Cancellation and consumption evidence are ordered independently; both orderings retain the receipt.
for ordering in cancel-first settle-first; do
 j="$(query -c "SELECT public.start_music_inspiration_job_v3('$owner',gen_random_uuid(),jsonb_build_object('kind','artist','artist','Offline race','depth','standard'),'$model','openai','{}','{}')->>'id'")"
 l='c0142000-0000-4000-8000-000000000003'
 p="$(query -c "SELECT planner_execution_id FROM public.music_inspiration_jobs WHERE id='$j'")"
 query -c "SELECT (public.claim_music_inspiration_job_v2('$j','$l')).id; SELECT public.reserve_music_inspiration_dispatch('$j','$l','$p','planner',0,0);" >/dev/null
 cancel="SELECT set_config('request.jwt.claim.sub','$owner',true); SELECT (public.cancel_music_inspiration_job('$j')).id"
 settle="SELECT (public.settle_music_inspiration_dispatch('$j','$p','observed',jsonb_build_object('provider_result',jsonb_build_object('provider','openrouter','model','openai/gpt-6-luna','text','synthetic retained receipt','usage',jsonb_build_object('inputTokens',10,'outputTokens',5,'totalTokens',15))))).id"
 if [[ "$ordering" == cancel-first ]]; then first="$cancel"; second="$settle"; else first="$settle"; second="$cancel"; fi
 query -c "BEGIN; $first; SELECT pg_sleep(1); COMMIT;" >"$work/first" & a=$!
 sleep 0.1
 query -c "$second" >"$work/second" & b=$!
 wait "$a"; wait "$b"
 [[ "$(query -c "SELECT status='cancelled' AND planner_result->>'text'='synthetic retained receipt' FROM public.music_inspiration_jobs WHERE id='$j'")" == t ]]
 [[ "$(query -c "SELECT state FROM public.music_inspiration_dispatches WHERE dispatch_key='$p'")" == observed ]]
done
# A stored planner receipt makes unknown recovery eligible, but claim remains single-owner.
query -c "SELECT public.settle_music_inspiration_dispatch('$job','$planner','observed',jsonb_build_object('provider_result',jsonb_build_object('text','synthetic recovery receipt'))) IS NOT NULL; UPDATE public.music_inspiration_jobs SET status='unknown',lease_until=now()-interval '1 second' WHERE id='$job';" >/dev/null
query -c "SELECT (public.claim_music_inspiration_job_v2('$job',gen_random_uuid())).id IS NOT NULL" >"$work/recovery-a" & a=$!
query -c "SELECT (public.claim_music_inspiration_job_v2('$job',gen_random_uuid())).id IS NOT NULL" >"$work/recovery-b" & b=$!
wait "$a"; wait "$b"
[[ "$(cat "$work/recovery-a" "$work/recovery-b" | grep -c '^t$')" == 1 ]]
query -c "UPDATE public.music_inspiration_jobs SET status='unknown',recovery_attempts=3,lease_until=now()-interval '1 second' WHERE id='$job';" >/dev/null
[[ "$(query -c "SELECT (public.claim_music_inspiration_job_v2('$job',gen_random_uuid())).id IS NULL")" == t ]]
[[ "$(query -c "SELECT count(*) FROM public.music_inspiration_dispatches WHERE job_id='$job' AND kind='planner'")" == 1 ]]
echo 'PASS: PB-014 duplicate admission, claim, planner dispatch, uninstall fence, cancel/receipt both orders, bounded recovery races'
