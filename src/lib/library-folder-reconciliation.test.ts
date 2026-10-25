import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261025155332_reconcile_library_folder_integrity.sql",
  "utf8",
);
describe("library integrity forward reconciliation contract", () => {
  test("does not rewrite history, table grants, RLS or stored user content", () => {
    expect(migration).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?supabase_migrations/i,
    );
    expect(migration).not.toMatch(
      /(?:ALTER\s+TABLE|CREATE\s+POLICY|GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE))/i,
    );
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).not.toContain("SECURITY DEFINER");
  });
  test("keeps the callable RPC signature and authenticated invoker client", () => {
    expect(migration).toContain("_project_id uuid,_destination_folder_id uuid,_new_name text");
    expect(migration).toContain("TO authenticated,service_role");
    const server = readFileSync("src/lib/library-folders.functions.ts", "utf8");
    expect(server).toContain('"duplicate_prompt_project_to_folder"');
    expect(server).toContain(".middleware([requireSupabaseAuth])");
  });
  test("fences writers before tuple locks and fails closed on stale snapshots", () => {
    expect(migration).toContain("FOR EACH STATEMENT");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("USING ERRCODE='40001'");
    expect(migration).toContain("v_node_depth+v_subtree_height-1>5");
  });
  test("retains later branch metadata and one source snapshot across both passes", () => {
    expect(migration).toContain("branch_label");
    expect(migration).toContain("ARRAY[]::public.saved_prompts[]");
    expect(migration.match(/FOREACH v_source_prompt IN ARRAY v_versions LOOP/g)).toHaveLength(2);
    expect(migration).toContain("external or missing parent reference");
  });
});
