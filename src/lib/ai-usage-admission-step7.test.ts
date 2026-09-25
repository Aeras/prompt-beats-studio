import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Step 7 AI usage and admission hardening", () => {
  test("failed started Quality Check attempts count toward cost admission", async () => {
    const migration = await source(
      "supabase/migrations/20260924190000_ai_usage_admission_step7_hardening.sql",
    );

    expect(migration).toContain("v_failed_started integer");
    expect(migration).toContain("status='failed'");
    expect(migration).toContain("provider_started_at>now()-interval '1 hour'");
    expect(migration).toContain("v_used+v_reserved+v_failed_started>=10");
  });

  test("auxiliary AI admission is durable and replayable rather than time-window deduped", async () => {
    const migration = await source(
      "supabase/migrations/20260924200000_auxiliary_ai_durable_idempotency.sql",
    );

    expect(migration).toContain("UNIQUE (user_id, operation, request_key)");
    expect(migration).toContain("status IN ('pending','processing','completed','failed')");
    expect(migration).toContain("provider_started_at IS NOT NULL");
    expect(migration).toContain("'status','completed','result',v_request.result");
    expect(migration).toContain("mark_auxiliary_ai_provider_started");
    expect(migration).toContain("FOR UPDATE");
  });

  test("usage logging has a durable outbox and opportunistic reconciliation", async () => {
    const usage = await source("src/lib/ai-usage.server.ts");
    const migration = await source(
      "supabase/migrations/20260924190000_ai_usage_admission_step7_hardening.sql",
    );

    expect(usage).toContain('from("ai_usage_outbox" as never)');
    expect(usage).toContain('"flush_ai_usage_outbox" as never');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ai_usage_outbox");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.flush_ai_usage_outbox");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("INSERT INTO public.ai_usage_logs");
    expect(migration).toContain("DELETE FROM public.ai_usage_outbox");
  });
});
