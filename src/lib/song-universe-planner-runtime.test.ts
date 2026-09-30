import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Song Universe Next Song Planner runtime guards", () => {
  test("hard constraints use section-aware identity classification", async () => {
    const server = await source("src/lib/song-universe-planner.functions.ts");
    expect(server).toContain(".filter(shouldPreserveBibleItemAsIdentity)");
    expect(server).toContain('item.section !== "things_to_avoid"');
    expect(server).toContain('item.section !== "allowed_deviations"');
  });

  test("reduced fallback returns and persists structured diagnostics", async () => {
    const server = await source("src/lib/song-universe-planner.functions.ts");
    expect(server).toContain('"consistency_failure_after_retry"');
    expect(server).toContain('"duplicate_retry_failure"');
    expect(server).toContain('"json_parse_failure"');
    expect(server).toContain('"schema_validation_failure"');
    expect(server).toContain("fallback_diagnostics: fallbackReason");
    expect(server).toContain("fallbackReason,");
  });
});
