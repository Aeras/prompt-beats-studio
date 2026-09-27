import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Qdrant music memory POC", () => {
  test("keeps Qdrant credentials server-side and feature-gated", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain('process.env["QDRANT_URL"]');
    expect(code).toContain('process.env["QDRANT_API_KEY"]');
    expect(code).toContain('requireFeatureAccess(context.supabase, "song_analyzer")');
    expect(code).not.toContain("VITE_QDRANT");
  });

  test("uses the official Qdrant REST authentication pattern", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain('"api-key": config.apiKey');
    expect(code).toContain('qdrantRequest("/collections"');
  });

  test("initializes a dedicated 768-dimensional cosine collection for MERT", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain('MUSIC_MEMORY_COLLECTION = "promptbeats_music_memory_v1"');
    expect(code).toContain("MERT_VECTOR_SIZE = 768");
    expect(code).toContain('distance: "Cosine"');
  });

  test("uses bounded network timeouts and idempotent collection initialization", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain("10_000");
    expect(code).toContain("if (exists)");
    expect(code).toContain("created: false");
    expect(code).toContain("created: true");
  });
});
