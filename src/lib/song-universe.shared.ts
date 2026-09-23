import { z } from "zod";

export const songUniverseTypeSchema = z.enum([
  "album",
  "ep",
  "song_series",
  "creative_era",
  "other",
]);
export type SongUniverseType = z.infer<typeof songUniverseTypeSchema>;

export const songUniverseStatusSchema = z.enum([
  "planning",
  "writing",
  "production",
  "review",
  "complete",
  "archived",
]);
export type SongUniverseStatus = z.infer<typeof songUniverseStatusSchema>;

export const songUniverseStrengthSchema = z.enum(["core", "flexible", "experimental"]);
export type SongUniverseStrength = z.infer<typeof songUniverseStrengthSchema>;

export const songUniverseProjectStatusSchema = z.enum([
  "idea",
  "draft",
  "in_progress",
  "review",
  "final",
]);
export type SongUniverseProjectStatus = z.infer<typeof songUniverseProjectStatusSchema>;

export const SONG_UNIVERSE_BIBLE_SECTIONS = [
  "core_concept",
  "emotional_palette",
  "lyrical_themes",
  "recurring_motifs",
  "musical_identity",
  "production_identity",
  "vocal_identity",
  "language_writing_identity",
  "structural_tendencies",
  "things_to_avoid",
  "allowed_deviations",
] as const;

export const songUniverseBibleSectionSchema = z.enum(SONG_UNIVERSE_BIBLE_SECTIONS);
export type SongUniverseBibleSection = z.infer<typeof songUniverseBibleSectionSchema>;

export const songUniverseBibleItemSchema = z.object({
  id: z.string().min(1).max(120),
  section: songUniverseBibleSectionSchema,
  content: z.string().trim().min(1).max(2000),
  strength: songUniverseStrengthSchema.default("flexible"),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type SongUniverseBibleItem = z.infer<typeof songUniverseBibleItemSchema>;

export const songUniverseCreativeBibleSchema = z.object({
  items: z.array(songUniverseBibleItemSchema).max(200).default([]),
});
export type SongUniverseCreativeBible = z.infer<typeof songUniverseCreativeBibleSchema>;

export const songUniverseContextSnapshotSchema = z.object({
  universeId: z.string().uuid(),
  universeTitle: z.string().trim().min(1).max(160),
  capturedAt: z.string().datetime(),
  selectedItemIds: z.array(z.string()).max(200),
  inheritedItems: z.array(songUniverseBibleItemSchema).max(200),
});
export type SongUniverseContextSnapshot = z.infer<typeof songUniverseContextSnapshotSchema>;

export const songUniverseSongSetupHandoffSchema = z
  .object({
    version: z.literal(1),
    universeId: z.string().uuid(),
    universeTitle: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    selectedItems: z.array(songUniverseBibleItemSchema).min(1).max(200),
    contextSnapshot: songUniverseContextSnapshotSchema,
  })
  .strict();
export type SongUniverseSongSetupHandoff = z.infer<typeof songUniverseSongSetupHandoffSchema>;

export const SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY = "pb:song-universe-song-setup:v1";

export type SongUniverseRecord = {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  universeType: SongUniverseType;
  status: SongUniverseStatus;
  creativeBible: SongUniverseCreativeBible;
  initialDirection: string | null;
  coverObjectKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SongUniverseProjectRecord = {
  id: string;
  universeId: string;
  projectId: string;
  projectName: string;
  position: number;
  universeRole: string | null;
  projectStatus: SongUniverseProjectStatus;
  intentionalOutlier: boolean;
  inheritedTraits: string[];
  contextSnapshot: SongUniverseContextSnapshot | null;
  contextSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SongUniverseAnalysis = {
  summary: string;
  strongContinuity: string[];
  possibleRepetition: string[];
  underusedDirections: string[];
  diversityNotes: string[];
  motifUsage: Array<{
    motif: string;
    usage: "heavy" | "moderate" | "light" | "unused";
    note: string;
  }>;
  intentionalOutliers: string[];
  opportunities: string[];
};

export const songUniverseAnalysisSchema = z.object({
  summary: z.string().trim().max(3000).default(""),
  strongContinuity: z.array(z.string().trim().max(1000)).max(20).default([]),
  possibleRepetition: z.array(z.string().trim().max(1000)).max(20).default([]),
  underusedDirections: z.array(z.string().trim().max(1000)).max(20).default([]),
  diversityNotes: z.array(z.string().trim().max(1000)).max(20).default([]),
  motifUsage: z
    .array(
      z.object({
        motif: z.string().trim().max(200),
        usage: z.enum(["heavy", "moderate", "light", "unused"]),
        note: z.string().trim().max(1000).default(""),
      }),
    )
    .max(50)
    .default([]),
  intentionalOutliers: z.array(z.string().trim().max(1000)).max(20).default([]),
  opportunities: z.array(z.string().trim().max(1000)).max(20).default([]),
});

export function buildSongUniverseContextText(
  handoff: Pick<SongUniverseSongSetupHandoff, "universeTitle" | "selectedItems">,
  language: "en" | "el" = "en",
) {
  const el = language === "el";
  const strengthLabel: Record<SongUniverseStrength, string> = el
    ? { core: "Βασικό", flexible: "Ευέλικτο", experimental: "Πειραματικό" }
    : { core: "Core", flexible: "Flexible", experimental: "Experimental" };
  const sectionLabel: Record<SongUniverseBibleSection, string> = el
    ? {
        core_concept: "Κεντρική ιδέα",
        emotional_palette: "Συναισθηματική παλέτα",
        lyrical_themes: "Στιχουργικά θέματα",
        recurring_motifs: "Επαναλαμβανόμενα μοτίβα",
        musical_identity: "Μουσική ταυτότητα",
        production_identity: "Ταυτότητα παραγωγής",
        vocal_identity: "Φωνητική ταυτότητα",
        language_writing_identity: "Γλώσσα / ύφος γραφής",
        structural_tendencies: "Δομικές τάσεις",
        things_to_avoid: "Προς αποφυγή",
        allowed_deviations: "Επιτρεπόμενες αποκλίσεις",
      }
    : {
        core_concept: "Core concept",
        emotional_palette: "Emotional palette",
        lyrical_themes: "Lyrical themes",
        recurring_motifs: "Recurring motifs",
        musical_identity: "Musical identity",
        production_identity: "Production identity",
        vocal_identity: "Vocal identity",
        language_writing_identity: "Language / writing identity",
        structural_tendencies: "Structural tendencies",
        things_to_avoid: "Things to avoid",
        allowed_deviations: "Allowed deviations",
      };

  const grouped = new Map<SongUniverseBibleSection, SongUniverseBibleItem[]>();
  for (const item of handoff.selectedItems.filter((item) => item.enabled)) {
    const items = grouped.get(item.section) ?? [];
    items.push(item);
    grouped.set(item.section, items);
  }

  const lines = [
    el
      ? `ΠΛΑΙΣΙΟ SONG UNIVERSE — ${handoff.universeTitle}`
      : `SONG UNIVERSE CONTEXT — ${handoff.universeTitle}`,
  ];
  for (const section of SONG_UNIVERSE_BIBLE_SECTIONS) {
    const items = grouped.get(section);
    if (!items?.length) continue;
    lines.push("", `${sectionLabel[section]}:`);
    for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      lines.push(`- [${strengthLabel[item.strength]}] ${item.content}`);
    }
  }
  lines.push(
    "",
    el
      ? "Οι ρητές οδηγίες του τρέχοντος τραγουδιού υπερισχύουν πάντα από το Universe context. Διατήρησε κοινή ταυτότητα χωρίς να αντιγράφεις τα άλλα τραγούδια."
      : "Explicit instructions for the current song always override Universe context. Preserve shared identity without copying the other songs.",
  );
  return lines.join("\n");
}
