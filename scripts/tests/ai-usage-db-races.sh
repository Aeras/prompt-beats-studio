#!/usr/bin/env bash
# CI disposable Supabase container ONLY. Never accepts a database URL.
set -euo pipefail
project_id="${1:?local project id required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
query() { docker exec -i "supabase_db_$project_id" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
query <<'SQL'
INSERT INTO auth.users(id,email) VALUES ('55555555-5555-4555-8555-555555555555','usage-race@example.invalid');
SELECT public.begin_ai_execution_internal('66666666-6666-4666-8666-666666666666',
 '55555555-5555-4555-8555-555555555555','generate','openai','fixture',NULL,NULL,NULL);
UPDATE public.ai_provider_executions SET next_recovery_at=now()-interval '1 second'
 WHERE id='66666666-6666-4666-8666-666666666666';
SQL
settle() {
  query <<'SQL'
BEGIN;
SELECT public.settle_ai_usage_internal('{"id":"66666666-6666-4666-8666-666666666666","user_id":"55555555-5555-4555-8555-555555555555","provider":"openai","model":"fixture","operation":"generate","input_tokens":10,"output_tokens":5,"total_tokens":15,"provider_usage_state":"final","success":true}');
SELECT pg_sleep(0.2);
COMMIT;
SQL
}
settle >/dev/null & first=$!
settle >/dev/null & second=$!
wait "$first"
wait "$second"
claim() { query -c 'BEGIN; SELECT id FROM public.claim_ai_execution_recovery_internal(); SELECT pg_sleep(0.2); COMMIT;' >/dev/null; }
claim & first=$!
claim & second=$!
wait "$first"
wait "$second"
query <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM public.ai_usage_logs WHERE id='66666666-6666-4666-8666-666666666666') <> 1
 THEN RAISE EXCEPTION 'concurrent settlement duplicated accounting'; END IF;
 IF (SELECT recovery_attempts FROM public.ai_provider_executions WHERE id='66666666-6666-4666-8666-666666666666') <> 1
 THEN RAISE EXCEPTION 'concurrent workers both claimed the same lease'; END IF;
END;
$$;
DELETE FROM public.ai_usage_logs WHERE id='66666666-6666-4666-8666-666666666666';
DELETE FROM auth.users WHERE id='55555555-5555-4555-8555-555555555555';
SQL
echo "PASS: independent PostgreSQL connections, concurrent receipt settlement and recovery claims"
