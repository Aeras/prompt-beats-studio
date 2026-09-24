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

  test("auxiliary AI admission rejects immediate duplicate bursts", async () => {
    const migration = await source(
      "supabase/migrations/20260924190000_ai_usage_admission_step7_hardening.sql",
    );

    const duplicateGuard = migration.indexOf(
      "created_at > now() - interval '15 seconds'",
    );
    const providerBudget = migration.indexOf("v_used >= _limit_per_hour");
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(providerBudget).toBeGreaterThan(duplicateGuard);
  });

  test("AI Music Lab records every Lyria provider attempt", async () => {
    const usage = await source("src/lib/ai-usage.server.ts");
    const musicLab = await source("src/lib/ai-music-lab.functions.ts");

    expect(usage).toContain('"ai_music_lab_generation"');
    expect(musicLab).toContain("normalizedLyriaUsage");
    expect(musicLab).toContain('model: "lyria-3.5"');
    expect(musicLab).toContain('operation: "ai_music_lab_generation"');
    expect(musicLab).toContain("await recordAiUsage({");
    expect(musicLab).toContain("} finally {");
  });

  test("usage logging has a durable outbox and opportunistic reconciliation", async () => {
    const usage = await source("src/lib/ai-usage.server.ts");
    const migration = await source(
      "supabase/migrations/20260924190000_ai_usage_admission_step7_hardening.sql",
    );

    expect(usage).toContain('from("ai_usage_outbox" as never)');
    expect(usage).toContain('"flush_ai_usage_outbox" as never');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ai_usage_outbox");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.flush_ai_usage_outbox",
    );
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("INSERT INTO public.ai_usage_logs");
    expect(migration).toContain("DELETE FROM public.ai_usage_outbox");
  });
});
