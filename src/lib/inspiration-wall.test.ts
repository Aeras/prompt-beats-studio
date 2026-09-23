import { describe, expect, test } from "bun:test";

import {
  INSPIRATION_WALL_CARD_TYPES,
  INSPIRATION_WALL_THEMES,
  inspirationWallArtisticLayoutSchema,
  inspirationWallCreativeDirectionSchema,
  inspirationWallImageObjectKey,
} from "@/lib/inspiration-wall.shared";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Inspiration Wall Phase 1 foundation", () => {
  test("keeps the four canonical themes and eight MVP card types", () => {
    expect(INSPIRATION_WALL_THEMES).toEqual([
      "whiteboard",
      "corkboard",
      "neon_studio",
      "clean_studio",
    ]);
    expect(INSPIRATION_WALL_CARD_TYPES).toEqual([
      "image",
      "note",
      "text_fragment",
      "word",
      "color",
      "scene",
      "constraint",
      "question",
    ]);
  });

  test("keeps artistic rotation inside the agreed safe range", () => {
    expect(inspirationWallArtisticLayoutSchema.parse({ rotation: -8 }).rotation).toBe(-8);
    expect(inspirationWallArtisticLayoutSchema.parse({ rotation: 8 }).rotation).toBe(8);
    expect(() => inspirationWallArtisticLayoutSchema.parse({ rotation: 8.1 })).toThrow();
    expect(() => inspirationWallArtisticLayoutSchema.parse({ rotation: -8.1 })).toThrow();
  });

  test("stores Creative Direction as structured editable fields", () => {
    const value = inspirationWallCreativeDirectionSchema.parse({
      coreTheme: "Night drive after a breakup",
      moodPalette: ["warm", "restless"],
      lyricalKeywords: ["streetlights", "last bus"],
      thingsToAvoid: ["happy ending"],
      openQuestions: ["Does the narrator go back?"],
    });
    expect(value.coreTheme).toBe("Night drive after a breakup");
    expect(value.moodPalette).toEqual(["warm", "restless"]);
    expect(value.thingsToAvoid).toEqual(["happy ending"]);
  });

  test("image object keys are namespaced by owner, wall and card", () => {
    expect(
      inspirationWallImageObjectKey({
        userId: "user-1",
        wallId: "wall-1",
        cardId: "card-1",
        fileName: "My photo 01.webp",
      }),
    ).toBe("user-1/wall-1/card-1/My-photo-01.webp");
  });

  test("migration enforces private owner-only data and a private 4 MB image bucket", async () => {
    const sql = await source("supabase/migrations/20260923190000_inspiration_wall_phase1.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.inspiration_walls");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.inspiration_wall_cards");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.inspiration_wall_track_links");
    expect(sql).toContain("ALTER TABLE public.inspiration_walls ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("auth.uid() = owner_id");
    expect(sql).toContain("Connected project does not belong to this user");
    expect(sql).toContain("Track is not an eligible owned upload");
    expect(sql).toContain("'inspiration-wall-images'");
    expect(sql).toContain("false,\n  4 * 1024 * 1024");
    expect(sql).toContain("ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });

  test("server functions require auth and feature access and keep image keys owner scoped", async () => {
    const functions = await source("src/lib/inspiration-wall.functions.ts");

    expect(functions).toContain(".middleware([requireSupabaseAuth])");
    expect(functions).toContain('requireFeatureAccess(context.supabase, "inspiration_wall")');
    expect(functions).toContain("assertOwnedImageKey");
    expect(functions).toContain('.eq("owner_id", context.userId)');
    expect(functions).toContain('.eq("source_type", "upload")');
    expect(functions).toContain('.eq("moderation_status", "active")');
  });

  test("feature access registry includes Inspiration Wall", async () => {
    const featureAccess = await source("src/lib/feature-access.functions.ts");
    expect(featureAccess).toContain('"inspiration_wall"');
  });
});
