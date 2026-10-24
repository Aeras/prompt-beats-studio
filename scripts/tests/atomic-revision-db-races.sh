#!/usr/bin/env bash
# Disposable CI Supabase database only; two independent PostgreSQL sessions.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
owner='6a000000-0000-4000-8000-000000000014'
prompt='6b000000-0000-4000-8000-000000000014'
job_a='6c000000-0000-4000-8000-000000000014'
job_b='6d000000-0000-4000-8000-000000000014'
query <<SQL
INSERT INTO auth.users(id,email) VALUES ('$owner','atomic-revision-race@example.invalid');
INSERT INTO public.saved_prompts(id,user_id,title,tags,lyrics,note)
 VALUES ('$prompt','$owner','Original','', 'Original lyrics','');
INSERT INTO public.ai_generation_jobs(id,user_id,idempotency_key,status,input_payload)
 VALUES ('$job_a','$owner','atomic-revision-race-a','processing','{}'::jsonb),
        ('$job_b','$owner','atomic-revision-race-b','processing','{}'::jsonb);
SQL
finalize() {
 local id="$1" title="$2"
 query <<SQL
SELECT public.finalize_generation_revision_atomic(
 '$id'::uuid,'$owner'::uuid,NULL,'$prompt'::uuid,
 'Update the text','{}'::jsonb,'{}'::jsonb,
 '$title','', '$title', '', '', '', '', 'Greek',
 'openai', 'offline-fixture', '{"title":"$title"}'::jsonb, 1);
SQL
}
# Case A: finalization transaction owns job row before a competing cancel.
# The cancellation update must wait and must NOT override the completed job.
query <<SQL >/dev/null &
BEGIN;
SELECT public.finalize_generation_revision_atomic(
 '$job_a'::uuid,'$owner'::uuid,NULL,'$prompt'::uuid,
 'Update the text','{}'::jsonb,'{}'::jsonb,
 'Saved first','', 'Saved first', '', '', '', '', 'Greek',
 'openai', 'offline-fixture', '{"title":"Saved first"}'::jsonb, 1);
SELECT pg_sleep(0.5);
COMMIT;
SQL
first=$!
sleep 0.15
query <<SQL >/dev/null &
UPDATE public.ai_generation_jobs
SET cancel_requested_at=now()
WHERE id='$job_a' AND status='processing';
SQL
second=$!
wait "$first"; wait "$second"
# Case B: cancellation commits before finalization; no prompt overwrite.
query -c "UPDATE public.ai_generation_jobs SET cancel_requested_at=now() WHERE id='$job_b' AND status='processing';" >/dev/null
if finalize "$job_b" 'Cancelled write' >/dev/null 2>&1; then
 echo "FAIL: cancelled job created a revision" >&2
 exit 1
fi
query <<SQL
DO \$\$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE id='$job_a' AND status='completed' AND cancel_requested_at IS NULL) THEN
  RAISE EXCEPTION 'Finalization-first race did not preserve completed state';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE id='$job_b' AND status='processing' AND cancel_requested_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Cancellation-first race unexpectedly completed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.saved_prompts WHERE id='$prompt' AND title='Saved first' AND lyrics='Saved first') THEN
  RAISE EXCEPTION 'Cancelled revision overwrote saved prompt';
 END IF;
END;
\$\$;
DELETE FROM public.ai_generation_jobs WHERE id IN ('$job_a','$job_b');
DELETE FROM public.saved_prompts WHERE id='$prompt';
DELETE FROM auth.users WHERE id='$owner';
SQL
echo 'PASS: independent database connections; finalize-first and cancel-first serializations'
