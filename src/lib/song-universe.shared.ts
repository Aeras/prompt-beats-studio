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

export const songUniverseRecurrenceSchema = z.enum([
  "always",
  "frequent",
  "occasional",
  "rare",
  "one_off",
]);
export type SongUniverseRecurrence = z.infer<typeof songUniverseRecurrenceSchema>;

export const songUniversePlannerContrastSettingSchema = z.enum(["low", "balanced", "high"]);
export type SongUniversePlannerContrastSetting = z.infer<
  typeof songUniversePlannerContrastSettingSchema
>;

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
  recurrence: songUniverseRecurrenceSchema.default("occasional"),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type SongUniverseBibleItem = z.infer<typeof songUniverseBibleItemSchema>;

export const songUniverseCreativeBibleSchema = z.object({
  items: z.array(songUniverseBibleItemSchema).max(200).default([]),
});
export type SongUniverseCreativeBible = z.infer<typeof songUniverseCreativeBibleSchema>;

export const songUniverseStoryBibleSchema = z.object({
  canonFacts: z.array(z.string().trim().max(1200)).max(100).default([]),
  characters: z.array(z.string().trim().max(500)).max(100).default([]),
  relationships: z.array(z.string().trim().max(1000)).max(100).default([]),
  locations: z.array(z.string().trim().max(500)).max(100).default([]),
  worldRules: z.array(z.string().trim().max(1200)).max(100).default([]),
  recurringSymbols: z.array(z.string().trim().max(500)).max(100).default([]),
  desiredEnding: z.string().trim().max(3000).nullable().default(null),
  tone: z.string().trim().max(1000).nullable().default(null),
  audience: z.string().trim().max(1000).nullable().default(null),
});
export type SongUniverseStoryBible = z.infer<typeof songUniverseStoryBibleSchema>;

export const emptySongUniverseStoryBible = (): SongUniverseStoryBible =>
  songUniverseStoryBibleSchema.parse({});

export type SongUniverseJsonValue =
  | string
  | number
  | boolean
  | null
  | SongUniverseJsonValue[]
  | { [key: string]: SongUniverseJsonValue };

const songUniverseJsonValueSchema: z.ZodType<SongUniverseJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(songUniverseJsonValueSchema),
    z.record(songUniverseJsonValueSchema),
  ]),
);

export const songUniverseContextSnapshotSchema = z.object({
  universeId: z.string().uuid(),
  universeTitle: z.string().trim().min(1).max(160),
  capturedAt: z.string().datetime(),
  selectedItemIds: z.array(z.string()).max(200),
  inheritedItems: z.array(songUniverseBibleItemSchema).max(200),
  universeType: songUniverseTypeSchema.nullable().optional().default(null),
  historyFingerprint: z.string().max(200).nullable().optional().default(null),
  plannerPlanId: z.string().uuid().nullable().optional().default(null),
  plannerStrategyVersion: z.string().max(100).nullable().optional().default(null),
  plannerSchemaVersion: z.string().max(100).nullable().optional().default(null),
  approvedNextSongBrief: z.record(songUniverseJsonValueSchema).nullable().optional().default(null),
  plannedTrackCount: z.number().int().min(1).max(200).nullable().optional().default(null),
  targetPosition: z.number().int().min(0).max(199).nullable().optional().default(null),
  targetRole: z.string().trim().max(200).nullable().optional().default(null),
});
export type SongUniverseContextSnapshot = z.infer<typeof songUniverseContextSnapshotSchema>;

const songUniverseSongSetupHandoffV1Schema = z
  .object({
    version: z.literal(1),
    universeId: z.string().uuid(),
    universeTitle: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    selectedItems: z.array(songUniverseBibleItemSchema).min(1).max(200),
    contextSnapshot: songUniverseContextSnapshotSchema,
  })
  .strict();

const songUniverseSongSetupHandoffV2Schema = z
  .object({
    version: z.literal(2),
    universeId: z.string().uuid(),
    universeTitle: z.string().trim().min(1).max(160),
    universeType: songUniverseTypeSchema,
    projectId: z.string().uuid().nullable(),
    selectedItems: z.array(songUniverseBibleItemSchema).max(200),
    approvedNextSongBrief: z.record(songUniverseJsonValueSchema),
    contextSnapshot: songUniverseContextSnapshotSchema,
  })
  .strict();

export const songUniverseSongSetupHandoffSchema = z.union([
  songUniverseSongSetupHandoffV1Schema,
  songUniverseSongSetupHandoffV2Schema,
]);
export type SongUniverseSongSetupHandoff = z.infer<typeof songUniverseSongSetupHandoffSchema>;

// Keep the storage key stable so already-open Generator tabs and v1 handoffs remain compatible.
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
  plannedTrackCount: number | null;
  arcDirection: string | null;
  storyBible: SongUniverseStoryBible;
  plannerContrast: SongUniversePlannerContrastSetting;
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
  outlierPurpose: string | null;
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

const IDENTITY_SECTIONS = new Set<SongUniverseBibleSection>([
  "core_concept",
  "musical_identity",
  "production_identity",
  "vocal_identity",
  "language_writing_identity",
]);

export function songUniverseBibleItemKind(section: SongUniverseBibleSection) {
  if (section === "things_to_avoid") return "constraint" as const;
  if (section === "allowed_deviations") return "deviation" as const;
  return IDENTITY_SECTIONS.has(section) ? ("identity" as const) : ("palette" as const);
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildSongUniverseContextText(
  handoff: SongUniverseSongSetupHandoff,
  language: "en" | "el" = "en",
) {
  const el = language === "el";
  const strengthLabel: Record<SongUniverseStrength, string> = el
    ? { core: "Βασικό", flexible: "Ευέλικτο", experimental: "Πειραματικό" }
    : { core: "Core", flexible: "Flexible", experimental: "Experimental" };
  const recurrenceLabel: Record<SongUniverseRecurrence, string> = el
    ? {
        always: "Πάντα",
        frequent: "Συχνά",
        occasional: "Επιλεκτικά",
        rare: "Σπάνια",
        one_off: "Μία φορά",
      }
    : {
        always: "Always",
        frequent: "Frequent",
        occasional: "Selective",
        rare: "Rare",
        one_off: "One-off",
      };
  const kindLabel = el
    ? { identity: "Ταυτότητα", palette: "Παλέτα", constraint: "Περιορισμός", deviation: "Απόκλιση" }
    : { identity: "Identity", palette: "Palette", constraint: "Constraint", deviation: "Deviation" };
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
      const kind = songUniverseBibleItemKind(item.section);
      lines.push(
        `- [${kindLabel[kind]} · ${strengthLabel[item.strength]} · ${recurrenceLabel[item.recurrence]}] ${item.content}`,
      );
    }
  }

  if (handoff.version === 2) {
    const brief = handoff.approvedNextSongBrief;
    const addList = (headingEl: string, headingEn: string, value: unknown) => {
      const items = asStringArray(value);
      if (!items.length) return;
      lines.push("", `${el ? headingEl : headingEn}:`);
      for (const item of items) lines.push(`- ${item}`);
    };
    const addValue = (headingEl: string, headingEn: string, value: unknown) => {
      const text = asOptionalString(value);
      if (!text) return;
      lines.push("", `${el ? headingEl : headingEn}:`, text);
    };

    lines.push(
      "",
      el ? "ΕΓΚΕΚΡΙΜΕΝΗ ΚΑΤΕΥΘΥΝΣΗ ΕΠΟΜΕΝΟΥ ΤΡΑΓΟΥΔΙΟΥ" : "APPROVED NEXT SONG DIRECTION",
    );
    addList("Διατήρησε", "Preserve", brief["identityToPreserve"]);
    addList("Υποχρεωτικά σεβάσου", "Must respect", brief["mustRespect"]);
    addList("Εξερεύνησε", "Explore", brief["themesToExplore"]);
    addList(
      "Προτίμησε να μην επαναλάβεις — θέματα",
      "Prefer not to repeat — themes",
      brief["preferNotToRepeatThemes"],
    );
    addList(
      "Προτίμησε να μην επαναλάβεις — μοτίβα",
      "Prefer not to repeat — motifs",
      brief["preferNotToRepeatMotifs"],
    );
    addList("Απέφυγε υποχρεωτικά", "Must avoid", brief["mustAvoid"]);
    addValue("Προτεινόμενη διάθεση", "Recommended mood", brief["recommendedMood"]);
    addValue("Προτεινόμενη ενέργεια", "Recommended energy", brief["recommendedEnergy"]);
    addValue("Κατεύθυνση BPM", "BPM direction", brief["recommendedBpmDirection"]);
    addValue("Κατεύθυνση δομής", "Structure direction", brief["recommendedStructureDirection"]);
    addValue("Κατεύθυνση hook", "Hook direction", brief["recommendedHookDirection"]);
    addValue("Οπτική / POV", "Point of view", brief["recommendedPov"]);
    addValue("Κατεύθυνση σκηνικού", "Setting direction", brief["recommendedSettingDirection"]);
    addValue("Κατάσταση αφήγησης", "Narrative state", brief["narrativeState"]);
    addValue("Εξέλιξη ιστορίας", "Story progression", brief["storyProgression"]);
    addList("Γεγονότα που δεν επαναλαμβάνονται", "Events not to repeat", brief["eventsNotToRepeat"]);
    addValue(
      "Επόμενη αφηγηματική ευκαιρία",
      "Next narrative opportunity",
      brief.nextNarrativeOpportunity,
    );
    addList("Σκόπιμη αντίθεση", "Intentional contrast", brief.intentionalContrast);
    addList("Δημιουργικές ευκαιρίες", "Creative opportunities", brief.creativeOpportunity);
  }

  lines.push(
    "",
    el
      ? "ΣΕΙΡΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑΣ: οι ρητές οδηγίες του τρέχοντος τραγουδιού υπερισχύουν από τις προτάσεις του Universe. Οι κανόνες mustRespect / Story Canon και τα πραγματικά Things to Avoid είναι δεσμευτικοί. Οι οδηγίες preferNotToRepeat και saturation είναι δημιουργικές συστάσεις, όχι απαγορεύσεις. Διατήρησε την καλλιτεχνική ταυτότητα χωρίς να επαναλαμβάνεις το περιεχόμενο των προηγούμενων τραγουδιών."
      : "PRECEDENCE: explicit current-song instructions override Universe recommendations. mustRespect / Story Canon and genuine Things to Avoid are binding. preferNotToRepeat and saturation guidance are creative recommendations, not prohibitions. Preserve the artistic identity without repeating previous-song content.",
  );
  return lines.join("\n");
}