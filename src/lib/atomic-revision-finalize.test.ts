import { describe, expect, test } from "bun:test";

const migrationPath =
  "supabase/migrations/20261024173000_pb_aud_014_atomic_revision_finalize.sql";

describe("PB-AUD-014 atomic revision finalization contract", () => {
  test("locks the job before mutation and rejects cancellation", async () => {
    const sql = await Bun.file(migrationPath).text();
    const lock = sql.indexOf("FOR UPDATE;");
    const cancelled = sql.indexOf("v_job.cancel_requested_at IS NOT NULL");
    const insert = sql.indexOf("public.create_prompt_revision_version(");
    const standalone = sql.indexOf("UPDATE public.saved_prompts");
    const complete = sql.indexOf("SET status = 'completed'");
    expect(lock).toBeGreaterThan(-1);
    expect(cancelled).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(cancelled);
    expect(standalone).toBeGreaterThan(cancelled);
    expect(complete).toBeGreaterThan(insert);
    expect(sql).toContain("RAISE EXCEPTION 'Revision finalization lost the cancellation race'");
  });

  test("keeps privileged RPC restricted to service_role", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("TO service_role;");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  test("worker sends revision and job result through one RPC", async () => {
    const worker = await Bun.file("src/lib/generation-jobs.server.ts").text();
    expect(worker).toContain('"finalize_generation_revision_atomic"');
    expect(worker).toContain("_metadata: versionChangeMetadata");
    expect(worker).toContain("_result: songResult");
    expect(worker).toContain("_attempts: (job.attempts ?? 0) + 1");
  });
});
