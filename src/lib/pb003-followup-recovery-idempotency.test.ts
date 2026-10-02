import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up generation recovery", () => {
  test("canonical feedback id is the durable generation idempotency key", async () => {
    const route = await source("src/routes/audio-revision.tsx");
    expect(route).toContain("idempotencyKey: feedback.feedbackId");
    expect(route).not.toContain("idempotencyKey: generationKey.current");
  });
});
