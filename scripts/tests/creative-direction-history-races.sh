#!/usr/bin/env bash
# Disposable CI Supabase database only. Exercise concurrent successful jobs in one scope.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
owner='ce510000-0000-4000-8000-000000000001'
project='ce520000-0000-4000-8000-000000000001'
job_a='ce530000-0000-4000-8000-000000000001'
job_b='ce530000-0000-4000-8000-000000000002'
direction_a='{"coreIdea":"A quiet return to a hometown","narrator":"First person","emotionalApproach":"Tender","hookIdentity":"A homecoming refrain","sonicIdentity":"Piano and strings"}'
direction_b='{"coreIdea":"A brave departure toward the sea","narrator":"First person","emotionalApproach":"Restless optimism","hookIdentity":"A rising horizon line","sonicIdentity":"Bright guitars"}'
result='{"title":"Offline","tags":"Pop","lyrics":"Test lyrics","note":"Test note"}'

query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES ('$owner','$owner@example.invalid');
INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES ('$owner','super_admin','active');
INSERT INTO public.profile_private(user_id,is_banned) VALUES ('$owner',false) ON CONFLICT(user_id) DO UPDATE SET is_banned=false;
INSERT INTO public.prompt_projects(id,user_id,name) VALUES ('$project','$owner','Creative history concurrency');
INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload) VALUES
 ('$job_a','${owner}','ce540000-0000-4000-8000-000000000001','processing',jsonb_build_object('operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(jsonb_build_object('type','project','id','$project'))))),
 ('$job_b','${owner}','ce540000-0000-4000-8000-000000000002','processing',jsonb_build_object('operation','generate','inputSnapshot',jsonb_build_object('generatorMode','advanced'),'creativeDirectionHistory',jsonb_build_object('version',1,'scopes',jsonb_build_array(jsonb_build_object('type','project','id','$project')))));
SQL

complete() {
  local job="$1" direction="$2"
  query -c "SELECT public.complete_generation_with_creative_direction_history('$job'::uuid,'$owner'::uuid,'$result'::jsonb,'$direction'::jsonb,'openai','offline-race',1);" >/dev/null
}

query <<SQL >/dev/null &
BEGIN;
SELECT public.complete_generation_with_creative_direction_history('$job_a'::uuid,'$owner'::uuid,'$result'::jsonb,'$direction_a'::jsonb,'openai','offline-race',1);
SELECT pg_sleep(0.5);
COMMIT;
SQL
first=$!
sleep 0.1
complete "$job_b" "$direction_b" &
second=$!
wait "$first"
wait "$second"

# Replaying a committed completion must be harmless and not add another row.
complete "$job_a" "$direction_a"
query <<SQL
DO \$\$
BEGIN
 IF (SELECT count(*) FROM public.generator_creative_direction_history WHERE user_id='$owner' AND scope_type='project' AND scope_id='$project')<>2 THEN
  RAISE EXCEPTION 'Concurrent jobs or retry produced missing/duplicate direction rows';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.generator_creative_direction_history WHERE job_id='$job_a' AND direction->>'coreIdea'='A quiet return to a hometown')
 OR NOT EXISTS(SELECT 1 FROM public.generator_creative_direction_history WHERE job_id='$job_b' AND direction->>'coreIdea'='A brave departure toward the sea') THEN
  RAISE EXCEPTION 'A concurrent direction was lost or crossed between jobs';
 END IF;
END;
\$\$;
DELETE FROM public.ai_generation_jobs WHERE id IN ('$job_a','$job_b');
DELETE FROM public.prompt_projects WHERE id='$project';
DELETE FROM auth.users WHERE id='$owner';
SQL

echo 'PASS: concurrent completions serialize per scope and retries remain idempotent'
