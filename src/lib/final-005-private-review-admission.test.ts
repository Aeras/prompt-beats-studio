import { describe, expect, test } from "bun:test";

const migrationPath =
  "supabase/migrations/20260926113000_final_005_private_review_join_admission.sql";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("FINAL-005 private review join admission", () => {
  test("uses a keyed network fingerprint and durable admission before reviewer creation", async () => {
    const functions = await source("src/lib/private-review.functions.ts");

    expect(functions).toContain('createHmac("sha256", secretKey)');
    expect(functions).toContain('request?.headers.get("cf-connecting-ip")');
    expect(functions).toContain('rpc(\n      "admit_private_review_join"');
    expect(functions.indexOf('"admit_private_review_join"')).toBeLessThan(
      functions.indexOf('"join_private_review_session"'),
    );
  });

  test("records invalid PIN outcomes durably without exposing the admission RPCs to browsers", async () => {
    const functions = await source("src/lib/private-review.functions.ts");
    const migration = await source(migrationPath);

    expect(functions).toContain('"record_private_review_pin_failure"');
    expect(functions).toContain("Too many attempts. Please wait before trying again.");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.private_review_join_admissions");
    expect(migration).toContain("pin_failure_count integer NOT NULL DEFAULT 0");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admit_private_review_join(text, text)",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.record_private_review_pin_failure(text, text)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admit_private_review_join(text, text) TO service_role",
    );
  });

  test("serializes session and network buckets and enforces both local and distributed caps", async () => {
    const migration = await source(migrationPath);

    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_network_attempts >= 60");
    expect(migration).toContain("v_network_failures >= 12");
    expect(migration).toContain("v_session_attempts >= 300");
    expect(migration).toContain("v_session_failures >= 80");
    expect(migration).toContain("bucket_start < v_bucket - interval '48 hours'");
  });
});
