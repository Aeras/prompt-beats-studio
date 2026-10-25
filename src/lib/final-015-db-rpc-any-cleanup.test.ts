import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const criticalDbBoundaries = [
  "src/lib/moderation-cases.functions.ts",
  "src/lib/track-sharing.functions.ts",
  "src/lib/ai-finalization.server.ts",
  "src/lib/contact.functions.ts",
  "src/lib/runner-auth.server.ts",
] as const;

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("FINAL-015 typed database and RPC boundaries", () => {
  test("security-critical Supabase boundaries no longer bypass typing with any", async () => {
    for (const path of criticalDbBoundaries) {
      const contents = await source(path);
      expect(contents).not.toContain("as any");
      expect(contents).not.toContain(": any");
    }
  });

  test("critical public RPCs are represented in checked-in generated Supabase types", async () => {
    const types = await source("src/integrations/supabase/types.ts");
    for (const rpc of [
      "take_moderation_case",
      "get_moderation_case",
      "create_track_share_link",
      "get_track_share_by_token",
      "admit_contact_request",
    ]) {
      expect(types).toContain(`${rpc}:`);
    }
  });

  test("newer server-only AI RPCs use a narrow explicit adapter instead of any", async () => {
    const aiFinalization = await source("src/lib/ai-finalization.server.ts");
    expect(aiFinalization).toContain("type InternalAiRpcClient = {");
    expect(aiFinalization).toContain("supabaseAdmin as unknown as InternalAiRpcClient");
    for (const rpc of [
      "auxiliary_model_use_start_internal",
      "complete_auxiliary_ai_request_internal",
      "fail_auxiliary_ai_request_internal",
      "mark_quality_check_provider_started_internal",
      "release_quality_check_internal",
      "consume_quality_check_internal",
    ]) {
      expect(aiFinalization).toContain(`name: "${rpc}"`);
    }
  });

  test("generated router code remains outside the DB any guard", () => {
    expect(criticalDbBoundaries).not.toContain("src/routeTree.gen.ts");
  });
});
