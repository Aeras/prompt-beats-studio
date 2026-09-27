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
    expect(code).toContain('MERT_EMBEDDING_CONTRACT = "promptbeats-mert95-similarity-v1"');
  });

  test("uses bounded network timeouts and idempotent collection initialization", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain("10_000");
    expect(code).toContain("if (exists)");
    expect(code).toContain("created: false");
    expect(code).toContain("created: true");
  });

  test("supports bounded nearest-neighbour queries without returning vectors", async () => {
    const code = await source("src/lib/qdrant-music-memory.functions.ts");
    expect(code).toContain(".length(MERT_VECTOR_SIZE)");
    expect(code).toContain(".max(50)");
    expect(code).toContain(`/points/query`);
    expect(code).toContain("with_payload: true");
    expect(code).toContain("with_vector: false");
  });

  test("ships a resumable FMA Large importer with the same embedding contract", async () => {
    const importer = await source("tools/fma_qdrant/ingest_fma_large.py");
    const contract = await source("tools/fma_qdrant/embedding_contract.json");
    expect(importer).toContain("RemoteZip");
    expect(importer).toContain("existing_ids");
    expect(importer).toContain("QDRANT_URL");
    expect(importer).toContain("QDRANT_API_KEY");
    expect(contract).toContain('"contract_id": "promptbeats-mert95-similarity-v1"');
    expect(contract).toContain('"vector_size": 768');
  });
});
