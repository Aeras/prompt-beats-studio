import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

// Provider execution and durable completion must remain server-authoritative.
const migration = "supabase/migrations/20260926090000_final_008_ai_finalization_authority.sql";

describe("FINAL-008 AI finalization authority", () => {
  test("legacy provider-start and finalization RPCs are no longer authenticated surfaces", async () => {
    const sql = await source(migration);
    for (const signature of [
      "mark_auxiliary_ai_provider_started(text, uuid, uuid)",
      "complete_auxiliary_ai_request(text, uuid, uuid, jsonb)",
      "fail_auxiliary_ai_request(text, uuid, uuid, text)",
      "mark_quality_check_provider_started(uuid)",
      "consume_quality_check(uuid, jsonb, text, text)",
      "release_quality_check(uuid)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature}`);
    }
    expect(sql).not.toContain("REVOKE ALL ON FUNCTION public.claim_auxiliary_ai_request");
    expect(sql).not.toContain("REVOKE ALL ON FUNCTION public.claim_quality_check");
  });

  test("internal transitions are explicit-user service-role-only functions", async () => {
    const sql = await source(migration);
    for (const signature of [
      "mark_auxiliary_ai_provider_started_internal(uuid, text, uuid, uuid)",
      "complete_auxiliary_ai_request_internal(uuid, text, uuid, uuid, jsonb)",
      "fail_auxiliary_ai_request_internal(uuid, text, uuid, uuid, text)",
      "mark_quality_check_provider_started_internal(uuid, uuid)",
      "consume_quality_check_internal(uuid, uuid, jsonb, text, text)",
      "release_quality_check_internal(uuid, uuid)",
    ]) {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}`);
      expect(sql).toContain("TO service_role;");
    }
    expect(sql).toContain("_user_id uuid");
  });

  test("auxiliary claims stay caller-bound but transitions use the server-only helper", async () => {
    const helper = await source("src/lib/ai-auxiliary-idempotency.server.ts");
    expect(helper).toContain('input.supabase.rpc("claim_auxiliary_ai_request"');
    expect(helper).toContain("markAuxiliaryAiProviderStarted({");
    expect(helper).toContain("completeAuxiliaryAiRequest({");
    expect(helper).toContain("failAuxiliaryAiRequest({");
    expect(helper).not.toContain('input.supabase.rpc("mark_auxiliary_ai_provider_started"');
    expect(helper).not.toContain('input.supabase.rpc("complete_auxiliary_ai_request"');
    expect(helper).not.toContain('input.supabase.rpc("fail_auxiliary_ai_request"');
  });

  test("every auxiliary server-function caller supplies the authenticated user id", async () => {
    for (const path of [
      "src/lib/song-setup-assistant.functions.ts",
      "src/lib/song-analyzer.functions.ts",
      "src/lib/inspiration-wall-ai.functions.ts",
      "src/lib/story-map-ai.functions.ts",
      "src/lib/song-universe-ai.functions.ts",
    ]) {
      const text = await source(path);
      const calls = text.split("executeDurableAuxiliaryAiRequest({").slice(1);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.slice(0, 240)).toContain("userId: context.userId");
      }
    }
  });

  test("Quality Check claim stays user-bound while provider/finalization uses server authority", async () => {
    const text = await source("src/lib/ai.functions.ts");
    expect(text).toContain('supabase.rpc("claim_quality_check"');
    expect(text).toContain('import("@/lib/ai-finalization.server")');
    expect(text).toContain("markQualityCheckProviderStarted(context.userId, data.idempotencyKey)");
    expect(text).toContain("releaseQualityCheck(context.userId, data.idempotencyKey)");
    expect(text).not.toContain('supabase.rpc("mark_quality_check_provider_started"');
    expect(text).not.toContain('supabase.rpc("consume_quality_check"');
    expect(text).not.toContain('supabase.rpc("release_quality_check"');
  });
});
