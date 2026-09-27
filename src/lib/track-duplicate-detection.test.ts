import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Track duplicate detection", () => {
  test("migration stores exact hashes, perceptual fingerprints, and protects exact duplicates", async () => {
    const sql = await source("supabase/migrations/20260927043000_track_duplicate_detection.sql");
    expect(sql).toContain("audio_content_hash text");
    expect(sql).toContain("audio_fingerprint text");
    expect(sql).toContain("tracks_user_audio_content_hash_unique");
    expect(sql).toContain("WHERE source_type = 'upload' AND audio_content_hash IS NOT NULL");
  });

  test("browser identity uses SHA-256 and a 64-bin audio fingerprint", async () => {
    const code = await source("src/lib/audio-identity.ts");
    expect(code).toContain('crypto.subtle.digest("SHA-256"');
    expect(code).toContain("const FINGERPRINT_BINS = 64");
    expect(code).toContain("decodeAudioData");
  });

  test("server checks exact and perceptual duplicates only inside the current user's library", async () => {
    const code = await source("src/lib/track-duplicate.functions.ts");
    expect(code).toContain('.eq("user_id", context.userId)');
    expect(code).toContain('.eq("audio_content_hash", data.contentHash)');
    expect(code).toContain("pearsonSimilarity");
    expect(code).toContain("best.score >= 0.992");
    expect(code).toContain("createUploadedTrackWithIdentity");
    expect(code).toContain('code === "23505"');
  });

  test("submission UI checks the audio before exposing the remaining metadata fields", async () => {
    const code = await source("src/components/promptbeats/StudioModal.tsx");
    const audioPicker = code.indexOf('id={`pb-audio-${r.key}`}');
    const gate = code.indexOf("{canContinue && (");
    const titleField = code.indexOf('placeholder={t("studio.trackTitle")}');
    expect(audioPicker).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(audioPicker);
    expect(titleField).toBeGreaterThan(gate);
    expect(code).toContain("checkTrackDuplicate");
    expect(code).toContain("computeAudioIdentity");
    expect(code).toContain("Το τραγούδι υπάρχει ήδη στη βιβλιοθήκη σου");
    expect(code).toContain("CheckCircle2");
  });
});
