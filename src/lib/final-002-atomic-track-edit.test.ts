import { describe, expect, test } from "bun:test";

const migrationPath = "supabase/migrations/20260926112000_final_002_atomic_track_edit.sql";
const functionsPath = "src/lib/tracks.functions.ts";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("FINAL-002 atomic owner track edits", () => {
  test("visibility and explicit-lyrics fields are written inside edit_track_with_cleanup", async () => {
    const migration = await source(migrationPath);
    expect(migration).toContain("_prompt_is_public boolean");
    expect(migration).toContain("_lyrics_is_public boolean");
    expect(migration).toContain("_contains_explicit_lyrics boolean");
    expect(migration).toContain("prompt_is_public = _prompt_is_public");
    expect(migration).toContain("lyrics_is_public = _lyrics_is_public");
    expect(migration).toContain("contains_explicit_lyrics = _contains_explicit_lyrics");
    expect(migration).toContain("SELECT to_jsonb(t) INTO v_result");
  });

  test("server edit passes the fields to the RPC and does not perform a second tracks update", async () => {
    const functions = await source(functionsPath);
    const updateTrack = functions.slice(
      functions.indexOf("export const updateTrack"),
      functions.indexOf("export const discardUploads"),
    );

    expect(updateTrack).toContain("_prompt_is_public: data.prompt_is_public");
    expect(updateTrack).toContain("_lyrics_is_public: data.lyrics_is_public");
    expect(updateTrack).toContain("_contains_explicit_lyrics: data.contains_explicit_lyrics");
    expect(updateTrack).not.toContain('supabaseAdmin.from("tracks")');
    expect(updateTrack).not.toContain("visibilityError");
  });
});
