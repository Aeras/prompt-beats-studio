import { z } from "zod";

export const INSPIRATION_WALL_THEMES = [
  "whiteboard",
  "corkboard",
  "neon_studio",
  "clean_studio",
] as const;
export type InspirationWallTheme = (typeof INSPIRATION_WALL_THEMES)[number];

export const INSPIRATION_WALL_CARD_TYPES = [
  "image",
  "note",
  "text_fragment",
  "word",
  "color",
  "scene",
  "constraint",
  "question",
] as const;
export type InspirationWallCardType = (typeof INSPIRATION_WALL_CARD_TYPES)[number];

export const inspirationWallThemeSchema = z.enum(INSPIRATION_WALL_THEMES);
export const inspirationWallCardTypeSchema = z.enum(INSPIRATION_WALL_CARD_TYPES);

export const inspirationWallCreativeDirectionSchema = z
  .object({
    coreTheme: z.string().trim().max(300).optional(),
    moodPalette: z.array(z.string().trim().max(160)).max(24).optional(),
    visualLanguage: z.array(z.string().trim().max(240)).max(24).optional(),
    narrativeAngle: z.string().trim().max(1200).optional(),
    musicalCharacter: z.string().trim().max(1200).optional(),
    productionTexture: z.string().trim().max(1200).optional(),
    vocalPersonality: z.string().trim().max(1200).optional(),
    lyricalKeywords: z.array(z.string().trim().max(120)).max(64).optional(),
    thingsToAvoid: z.array(z.string().trim().max(240)).max(32).optional(),
    contradictions: z.array(z.string().trim().max(500)).max(24).optional(),
    openQuestions: z.array(z.string().trim().max(500)).max(24).optional(),
  })
  .strict();
export type InspirationWallCreativeDirection = z.infer<
  typeof inspirationWallCreativeDirectionSchema
>;

export const inspirationWallArtisticLayoutSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    size: z.enum(["small", "medium", "large"]).optional(),
    rotation: z.number().finite().min(-8).max(8).optional(),
  })
  .strict();
export type InspirationWallArtisticLayout = z.infer<typeof inspirationWallArtisticLayoutSchema>;

export const inspirationWallStructuredLayoutSchema = z
  .object({
    order: z.number().int().min(0).optional(),
    span: z.enum(["normal", "wide"]).optional(),
  })
  .strict();
export type InspirationWallStructuredLayout = z.infer<typeof inspirationWallStructuredLayoutSchema>;

export type InspirationWallRecord = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  selected_theme: InspirationWallTheme;
  connected_project_id: string | null;
  creative_direction: InspirationWallCreativeDirection | null;
  created_at: string;
  updated_at: string;
};

export type InspirationWallCardRecord = {
  id: string;
  wall_id: string;
  type: InspirationWallCardType;
  title: string | null;
  body: string | null;
  color_value: string | null;
  image_object_key: string | null;
  is_pinned: boolean;
  sort_order: number;
  artistic_layout: InspirationWallArtisticLayout;
  structured_layout: InspirationWallStructuredLayout;
  created_at: string;
  updated_at: string;
};

export type InspirationWallTrackLinkRecord = {
  id: string;
  wall_id: string;
  owner_id: string;
  track_id: string;
  is_primary: boolean;
  created_at: string;
};

export function inspirationWallImageObjectKey(input: {
  userId: string;
  wallId: string;
  cardId: string;
  fileName: string;
}) {
  const safeFileName = input.fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  const fileName = safeFileName || "image";
  return `${input.userId}/${input.wallId}/${input.cardId}/${fileName}`;
}
