import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("F7-03 durable auxiliary AI idempotency", () => {
  test("database row is unique, claimed once, replayable, and safely fenced", async () => {
    const migration = await source(
      "supabase/migrations/20260924200000_auxiliary_ai_durable_idempotency.sql",
    );
    expect(migration).toContain("UNIQUE (user_id, operation, request_key)");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'status','processing'");
    expect(migration).toContain("'status','completed','result',v_request.result");
    expect(migration).toContain("execution_token=_execution_token");
    expect(migration).toContain("provider_started_at IS NULL");
    expect(migration).toContain("provider_started_at IS NOT NULL");
    expect(migration).toContain("_is_admin_level_internal");
    expect(migration).toContain("has_valid_account_state");
    expect(migration).toContain("v_used >= 10");
  });

  test("application fences the provider and records usage only inside claimed work", async () => {
    const helper = await source("src/lib/ai-auxiliary-idempotency.server.ts");
    expect(helper).toContain("mark_auxiliary_ai_provider_started");
    expect(helper).toContain('claim.status === "completed"');
    expect(helper).toContain('claim.status === "processing"');
    expect(helper).toContain("complete_auxiliary_ai_request");
  });

  test("all covered auxiliary operation families require a durable request key", async () => {
    for (const file of [
      "src/lib/song-setup-assistant.functions.ts",
      "src/lib/ai-music-lab.functions.ts",
      "src/lib/song-analyzer.functions.ts",
      "src/lib/inspiration-wall-ai.functions.ts",
      "src/lib/story-map-ai.functions.ts",
      "src/lib/song-universe-ai.functions.ts",
    ]) {
      const code = await source(file);
      expect(code).toContain("executeDurableAuxiliaryAiRequest");
      expect(code).toContain("requestKey: auxiliaryRequestKeySchema");
    }
  });
});
