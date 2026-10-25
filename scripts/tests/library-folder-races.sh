#!/usr/bin/env bash
# Disposable local database only; independent PostgreSQL connections.
set -euo pipefail
project="${1:?local project ID required}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project"
query() { docker exec -i "$db" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
owner='df000000-0000-4000-8000-000000000001'
wait_sleep() {
 for _ in $(seq 1 80); do
  if [[ "$(query -c "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%$1%';")" != 0 ]]; then return; fi
  sleep 0.05
 done
 echo "FAIL: lock-holder barrier not observed" >&2; exit 1
}
query <<SQL >/dev/null
INSERT INTO auth.users(id,email) VALUES('$owner','folder-races@example.invalid');
INSERT INTO public.library_folders(id,user_id,name) VALUES
 ('f1000000-0000-4000-8000-000000000001','$owner','A'),('f1000000-0000-4000-8000-000000000002','$owner','B');
DO \$\$ DECLARE i integer; BEGIN
 FOR i IN 1..3 LOOP
  INSERT INTO public.library_folders(id,user_id,parent_folder_id,name) VALUES
   (('f2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'$owner',CASE WHEN i=1 THEN NULL ELSE ('f2000000-0000-4000-8000-'||lpad((i-1)::text,12,'0'))::uuid END,'Depth '||i);
 END LOOP;
END \$\$;
INSERT INTO public.library_folders(id,user_id,parent_folder_id,name) VALUES
 ('f3000000-0000-4000-8000-000000000001','$owner',NULL,'Subtree'),
 ('f3000000-0000-4000-8000-000000000002','$owner','f3000000-0000-4000-8000-000000000001','Leaf');
SQL
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
UPDATE public.library_folders SET parent_folder_id='f1000000-0000-4000-8000-000000000002' WHERE id='f1000000-0000-4000-8000-000000000001';
SELECT pg_sleep(2) /*folder-cycle-winner*/;
COMMIT;
SQL
winner=$!
wait_sleep folder-cycle-winner
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
UPDATE public.library_folders SET parent_folder_id='f1000000-0000-4000-8000-000000000001' WHERE id='f1000000-0000-4000-8000-000000000002';
COMMIT;
SQL
)"; then echo 'FAIL: concurrent moves created a cycle' >&2; exit 1; fi
[[ "$error" == *'descendants'* ]] || { echo 'FAIL: unexpected cycle contender error' >&2; exit 1; }
wait "$winner"
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
UPDATE public.library_folders SET parent_folder_id='f2000000-0000-4000-8000-000000000003' WHERE id='f3000000-0000-4000-8000-000000000001';
SELECT pg_sleep(2) /*folder-depth-winner*/;
COMMIT;
SQL
winner=$!
wait_sleep folder-depth-winner
if error="$(query <<SQL 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.library_folders(user_id,parent_folder_id,name) VALUES('$owner','f3000000-0000-4000-8000-000000000002','Sixth level');
COMMIT;
SQL
)"; then echo 'FAIL: concurrent insert exceeded depth five' >&2; exit 1; fi
[[ "$error" == *'5 levels'* ]] || { echo 'FAIL: unexpected depth contender error' >&2; exit 1; }
wait "$winner"
query <<SQL >/dev/null
INSERT INTO public.prompt_projects(id,user_id,name) VALUES('e1000000-0000-4000-8000-000000000001','$owner','Race source');
INSERT INTO public.saved_prompts(id,user_id,project_id,title,tags,lyrics,note,version_number) VALUES
 ('e2000000-0000-4000-8000-000000000001','$owner','e1000000-0000-4000-8000-000000000001','Child','','Original','',1),
 ('e2000000-0000-4000-8000-000000000002','$owner','e1000000-0000-4000-8000-000000000001','Parent A','','','',2),
 ('e2000000-0000-4000-8000-000000000003','$owner','e1000000-0000-4000-8000-000000000001','Parent B','','','',3);
UPDATE public.saved_prompts SET parent_prompt_id='e2000000-0000-4000-8000-000000000002' WHERE id='e2000000-0000-4000-8000-000000000001';
CREATE FUNCTION public.test_folder_copy_pause() RETURNS trigger LANGUAGE plpgsql AS \$\$
BEGIN IF NEW.duplicated_from_prompt_id='e2000000-0000-4000-8000-000000000001' THEN
 PERFORM pg_sleep(2) /*folder-copy-snapshot*/; END IF; RETURN NEW; END \$\$;
CREATE TRIGGER test_folder_copy_pause AFTER INSERT ON public.saved_prompts FOR EACH ROW EXECUTE FUNCTION public.test_folder_copy_pause();
SQL
query <<SQL >/dev/null &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.duplicate_prompt_project_to_folder('e1000000-0000-4000-8000-000000000001',NULL,'Race copy') /*folder-copy-snapshot*/;
COMMIT;
SQL
copy=$!
wait_sleep folder-copy-snapshot
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
UPDATE public.saved_prompts SET parent_prompt_id='e2000000-0000-4000-8000-000000000003',lyrics='Changed concurrently' WHERE id='e2000000-0000-4000-8000-000000000001';
COMMIT;
SQL
wait "$copy"
query <<SQL >/dev/null
DROP TRIGGER test_folder_copy_pause ON public.saved_prompts;
DROP FUNCTION public.test_folder_copy_pause();
DO \$\$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.saved_prompts c JOIN public.saved_prompts p ON p.id=c.parent_prompt_id JOIN public.prompt_projects pr ON pr.id=c.project_id WHERE pr.user_id='$owner' AND pr.name='Race copy' AND c.title='Child' AND c.lyrics='Original' AND p.title='Parent A' AND p.project_id=c.project_id) THEN RAISE EXCEPTION 'Mixed snapshot across duplicate passes'; END IF;
END \$\$;
DELETE FROM public.saved_prompts WHERE user_id='$owner';
DELETE FROM public.prompt_projects WHERE user_id='$owner';
DO \$\$ BEGIN
 WHILE EXISTS(SELECT 1 FROM public.library_folders WHERE user_id='$owner') LOOP
  DELETE FROM public.library_folders f WHERE f.user_id='$owner' AND NOT EXISTS(SELECT 1 FROM public.library_folders c WHERE c.parent_folder_id=f.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleanup found cycle'; END IF;
 END LOOP;
END \$\$;
DELETE FROM auth.users WHERE id='$owner';
SQL
echo 'PASS: concurrent folder cycles/depth blocked; duplicate retains one source snapshot'
