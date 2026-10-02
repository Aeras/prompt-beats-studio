import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up auxiliary AI registration", () => {
  test("TypeScript admission and database admission both know audio_revision_intent", async () => {
    const ts = await source("src/lib/ai-admission.server.ts");
    const sql = await source(
      "supabase/migrations/20261002112700_pb003_followup_audio_revision_intent_admission.sql",
    );
    expect(ts).toContain('"audio_revision_intent"');
    expect(sql).toContain("'audio_revision_intent'");
  });
});
