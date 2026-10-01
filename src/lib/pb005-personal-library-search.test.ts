import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-005 personal retrieval", () => {
  test("search is authenticated, user-owned and cross-object", async () => {
    const [server, migration] = await Promise.all([
      source("src/lib/personal-library-search.functions.ts"),
      source("supabase/migrations/20261001195500_pb005_personal_library_search.sql"),
    ]);

    expect(server).toContain("requireSupabaseAuth");
    expect(server).toContain('rpc(\n      "search_personal_library"');

    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("t.user_id = v_user_id");
    expect(migration).toContain("p.user_id = v_user_id");
    expect(migration).toContain("sp.user_id = v_user_id");
    expect(migration).toContain("sa.user_id = v_user_id");
    expect(migration).toContain("iw.owner_id = v_user_id");
    expect(migration).toContain("sm.user_id = v_user_id");
    expect(migration).toContain("su.owner_id = v_user_id");
  });

  test("feature-gated artifacts stay gated and moderated tracks stay active-only", async () => {
    const migration = await source(
      "supabase/migrations/20261001195500_pb005_personal_library_search.sql",
    );

    expect(migration).toContain("t.moderation_status = 'active'");
    expect(migration).toContain("current_user_can_use_feature('song_analyzer')");
    expect(migration).toContain("current_user_can_use_feature('inspiration_wall')");
    expect(migration).toContain("current_user_can_use_feature('story_map')");
    expect(migration).toContain("current_user_can_use_feature('song_universe')");
  });

  test("V1 supports explicit object types and recency without semantic search", async () => {
    const [server, migration] = await Promise.all([
      source("src/lib/personal-library-search.functions.ts"),
      source("supabase/migrations/20261001195500_pb005_personal_library_search.sql"),
    ]);

    for (const type of [
      "track",
      "project",
      "prompt",
      "version",
      "analysis",
      "inspiration_wall",
      "story_map",
      "song_universe",
    ]) {
      expect(server).toContain(`"${type}"`);
    }

    expect(server).toContain("recencyDays");
    expect(migration).toContain("_recency_days");
    expect(migration).toContain("ILIKE v_pattern");
    expect(migration).not.toContain("embedding");
    expect(migration).not.toContain("vector");
  });

  test("likes and favorites remain relationship semantics, not search object types", async () => {
    const server = await source("src/lib/personal-library-search.functions.ts");
    const typeBlock = server.slice(
      server.indexOf("PERSONAL_LIBRARY_SEARCH_TYPES"),
      server.indexOf("] as const"),
    );

    expect(typeBlock).not.toContain('"likes"');
    expect(typeBlock).not.toContain('"favorites"');
  });

  test("Library exposes the personal retrieval surface above its existing taxonomy", async () => {
    const library = await source("src/routes/library.tsx");

    expect(library).toContain(
      'import { PersonalLibrarySearch } from "@/components/promptbeats/PersonalLibrarySearch";',
    );
    expect(library).toContain("<PersonalLibrarySearch");
    expect(library.indexOf("<PersonalLibrarySearch")).toBeLessThan(
      library.indexOf("data-library-tab={item}"),
    );
  });
});
