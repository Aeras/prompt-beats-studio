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
    expect(code).toContain("queryMusicMemoryByVector");
  });

  test("accepts the canonical query embedding from the enhanced worker and uses it for reference memory", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    const stage0 = await source("src/lib/song-analyzer-dsp.shared.ts");
    expect(enhanced).toContain("similarity_embedding: similarityVectorSchema.nullable().optional()");
    expect(enhanced).toContain("queryMusicMemoryByVector");
    expect(enhanced).toContain("REFERENCE_MEMORY_LIMIT = 12");
    expect(stage0).toContain("referenceMemory:");
    expect(stage0).toContain('z.literal("promptbeats-mert95-similarity-v1")');
  });

  test("hardens reference memory against duplicate artists and metadata-empty neighbours", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    expect(enhanced).toContain("REFERENCE_MEMORY_QUERY_LIMIT = 48");
    expect(enhanced).toContain("candidates.filter(hasUsefulStyleMetadata)");
    expect(enhanced).toContain("seenArtists.has(artistKey)");
    expect(enhanced).toContain("deduplicated.slice(0, REFERENCE_MEMORY_LIMIT)");
  });

  test("exposes structured genre consensus instead of treating raw neighbours as votes", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    const stage0 = await source("src/lib/song-analyzer-dsp.shared.ts");
    expect(enhanced).toContain("buildGenreConsensus(matches)");
    expect(enhanced).toContain("consensusStrength");
    expect(enhanced).toContain("Per-match titles, artists, labels and cosine scores are diagnostic/debug context only and must not be used as votes");
    expect(enhanced).toContain("Cosine score is embedding proximity, not genre probability");
    expect(stage0).toContain("genreConsensus:");
    expect(stage0).toContain("consensusStrength:");
  });

  test("keeps raw audio evidence authoritative over retrieval", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    expect(enhanced).toContain("Stage A must IGNORE referenceMemory");
    expect(enhanced).toContain("must never introduce a new genre family");
    expect(enhanced).toContain("Even strong consensus cannot override contradictory direct audio evidence");
    expect(enhanced).toContain("weak/insufficient consensus should not change the primary style classification at all");
  });

  test("keeps old persisted reference-memory payloads parseable", async () => {
    const stage0 = await source("src/lib/song-analyzer-dsp.shared.ts");
    expect(stage0).toContain("candidateCount: z.number().int().nonnegative().optional()");
    expect(stage0).toContain("genreConsensus: z.array(referenceMemoryGenreConsensusSchema).max(10).optional()");
    expect(stage0).toContain('consensusStrength: z.enum(["insufficient", "weak", "moderate", "strong"]).optional()');
  });

  test("keeps the existing analyze_fused worker request backward compatible", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    expect(enhanced).toContain('action: "analyze_fused"');
    expect(enhanced).not.toContain("include_similarity_embedding: true");
    expect(enhanced).not.toContain("similarity_embedding_contract:");
  });

  test("keeps retrieval non-fatal and explicitly reports when the worker vector is unavailable", async () => {
    const enhanced = await source("src/lib/song-analyzer-enhanced.functions.ts");
    expect(enhanced).toContain("Qdrant reference-memory lookup failed; continuing without it");
    expect(enhanced).toContain("Enhanced worker did not return the canonical MERT similarity embedding");
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
