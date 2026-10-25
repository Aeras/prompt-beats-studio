import { readFileSync } from "node:fs";

// Local Docker only. Reproduce the catalog-verified old behavior, then upgrade
// with the exact new migration inside one rollback transaction; no history repair.
const project = process.argv[2];
if (!project || !/^[a-zA-Z0-9_-]+$/.test(project)) throw new Error("Local project ID required");
function historicalFunction(path: string, name: string) {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error("Historical fixture definition not found");
  return source.slice(start, end + 4);
}
const oldFolder = historicalFunction(
  "supabase/migrations/20260922184000_library_folders_foundation.sql",
  "validate_library_folder_hierarchy",
);
const oldDuplicate = historicalFunction(
  "supabase/migrations/20260922193000_library_folder_transactional_duplicate.sql",
  "duplicate_prompt_project_to_folder",
);
const migration = readFileSync(
  "supabase/migrations/20261025155332_reconcile_library_folder_integrity.sql",
  "utf8",
)
  .replace(/^BEGIN;\s*/, "")
  .replace(/\s*COMMIT;\s*$/, "");
const setup = `
INSERT INTO auth.users(id,email) VALUES ('ce000000-0000-4000-8000-000000000001','reproduce@example.invalid');
SELECT set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..3 LOOP
  INSERT INTO public.library_folders(id,user_id,parent_folder_id,name) VALUES
   (('ca000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,auth.uid(),CASE WHEN i=1 THEN NULL ELSE ('ca000000-0000-4000-8000-'||lpad((i-1)::text,12,'0'))::uuid END,'Chain '||i),
   (('cb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,auth.uid(),CASE WHEN i=1 THEN NULL ELSE ('cb000000-0000-4000-8000-'||lpad((i-1)::text,12,'0'))::uuid END,'Tree '||i);
 END LOOP;
END $$;
INSERT INTO public.prompt_projects(id,user_id,name) VALUES('cc000000-0000-4000-8000-000000000001',auth.uid(),'Source');
INSERT INTO public.saved_prompts(id,user_id,project_id,title,tags,lyrics,note,version_number,created_at) VALUES
 ('cd000000-0000-4000-8000-000000000001',auth.uid(),'cc000000-0000-4000-8000-000000000001','Child','','','',1,'2026-01-01'),
 ('cd000000-0000-4000-8000-000000000002',auth.uid(),'cc000000-0000-4000-8000-000000000001','Parent','','','',7,'2026-01-02');
UPDATE public.saved_prompts SET parent_prompt_id='cd000000-0000-4000-8000-000000000002' WHERE id='cd000000-0000-4000-8000-000000000001';
`;
const sql = `BEGIN;
DROP TRIGGER trg_serialize_library_folder_writes ON public.library_folders;
DROP FUNCTION public.serialize_library_folder_writes();
${oldFolder}
${oldDuplicate}
${setup}
SAVEPOINT before_drift;
UPDATE public.library_folders SET parent_folder_id='ca000000-0000-4000-8000-000000000003' WHERE id='cb000000-0000-4000-8000-000000000001';
DO $$ DECLARE p uuid; BEGIN
 p:=(public.duplicate_prompt_project_to_folder('cc000000-0000-4000-8000-000000000001',NULL,'Old copy')->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.saved_prompts WHERE project_id=p AND title='Child' AND parent_prompt_id IS NULL) THEN RAISE EXCEPTION 'Old lineage defect not reproduced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.library_folders WHERE id='cb000000-0000-4000-8000-000000000001' AND parent_folder_id='ca000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Old subtree defect not reproduced'; END IF;
END $$;
ROLLBACK TO before_drift;
RESET ROLE;
${migration}
SET LOCAL ROLE authenticated;
DO $$ DECLARE p uuid; rejected boolean:=false; BEGIN
 BEGIN UPDATE public.library_folders SET parent_folder_id='ca000000-0000-4000-8000-000000000003' WHERE id='cb000000-0000-4000-8000-000000000001';
 EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='Folder nesting cannot exceed 5 levels'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Forward upgrade failed to reject over-deep subtree'; END IF;
 p:=(public.duplicate_prompt_project_to_folder('cc000000-0000-4000-8000-000000000001',NULL,'New copy')->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.saved_prompts c JOIN public.saved_prompts pa ON pa.id=c.parent_prompt_id WHERE c.project_id=p AND pa.project_id=p AND c.title='Child' AND pa.title='Parent') THEN RAISE EXCEPTION 'Forward upgrade lost parent mapping'; END IF;
END $$;
ROLLBACK;
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN INSERT INTO public.library_folders(user_id,name) VALUES(gen_random_uuid(),'Unsupported snapshot');
 EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale transaction snapshot must fail closed'; END IF;
END $$;
ROLLBACK;`;
const result = Bun.spawnSync(
  [
    "docker",
    "exec",
    "-i",
    `supabase_db_${project}`,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { stdin: Buffer.from(sql), stdout: "pipe", stderr: "pipe" },
);
if (result.exitCode !== 0) {
  process.stderr.write(result.stderr);
  throw new Error("Local historical drift / forward-upgrade reproduction failed");
}
console.log(
  "PASS: both production-state defects reproduced; exact forward migration fixes both; transaction rolled back",
);
