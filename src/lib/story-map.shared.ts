import { z } from "zod";

export const STORY_MAP_PROGRESSION_TYPES = [
  "narrative",
  "emotional",
  "relationship",
  "conceptual",
  "anthemic",
  "minimal",
] as const;

export const storyMapProgressionTypeSchema = z.enum(STORY_MAP_PROGRESSION_TYPES);
export type StoryMapProgressionType = z.infer<typeof storyMapProgressionTypeSchema>;

export const storyMapBeatSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(0).max(100),
  title: z.string().trim().min(1).max(120),
  whatHappens: z.string().trim().max(1200).default(""),
  emotion: z.string().trim().max(500).default(""),
  purpose: z.string().trim().max(700).default(""),
  narratorState: z.string().trim().max(700).default(""),
  keyImage: z.string().trim().max(500).default(""),
  reveal: z.string().trim().max(700).default(""),
  changeAfterBeat: z.string().trim().max(700).default(""),
  lyricAnchor: z.string().trim().max(500).default(""),
  suggestedSections: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  isKeyBeat: z.boolean().default(false),
});
export type StoryMapBeat = z.infer<typeof storyMapBeatSchema>;

export const storyMapDraftSchema = z.object({
  progressionType: storyMapProgressionTypeSchema,
  summary: z.string().trim().max(1500).default(""),
  narrator: z.string().trim().max(700).default(""),
  pointOfView: z.string().trim().max(400).default(""),
  startingState: z.string().trim().max(700).default(""),
  centralChange: z.string().trim().max(700).default(""),
  turningPoint: z.string().trim().max(700).default(""),
  resolution: z.string().trim().max(700).default(""),
  beats: z.array(storyMapBeatSchema).min(3).max(10),
});
export type StoryMapDraft = z.infer<typeof storyMapDraftSchema>;

export const storyMapRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  concept: z.string().trim().min(3).max(3000),
  theme: z.string().trim().max(500).nullable(),
  emotionalDirection: z.string().trim().max(700).nullable(),
  narrator: z.string().trim().max(700).nullable(),
  pointOfView: z.string().trim().max(400).nullable(),
  desiredEnding: z.string().trim().max(700).nullable(),
  progressionType: storyMapProgressionTypeSchema.nullable(),
  summary: z.string().trim().max(1500).nullable(),
  startingState: z.string().trim().max(700).nullable(),
  centralChange: z.string().trim().max(700).nullable(),
  turningPoint: z.string().trim().max(700).nullable(),
  resolution: z.string().trim().max(700).nullable(),
  projectId: z.string().uuid().nullable(),
  sourceProjectVersionId: z.string().uuid().nullable(),
  sourceLyricsUpdatedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  beats: z.array(storyMapBeatSchema),
});
export type StoryMapRecord = z.infer<typeof storyMapRecordSchema>;

export const storyMapAnalysisSchema = z.object({
  overall: z.string().trim().max(1800),
  observations: z
    .array(
      z.object({
        category: z.enum([
          "narrative_stagnation",
          "emotional_repetition",
          "missing_trigger",
          "missing_turning_point",
          "weak_escalation",
          "premature_resolution",
          "unclear_motivation",
          "unresolved_setup",
          "weak_ending_payoff",
          "chorus_disconnect",
          "section_redundancy",
          "point_of_view_drift",
          "timeline_confusion",
          "other",
        ]),
        evidence: z.string().trim().max(1000),
        suggestion: z.string().trim().max(1200),
        sectionLabel: z.string().trim().max(120).nullable().default(null),
      }),
    )
    .max(20),
  sectionSuggestions: z
    .array(
      z.object({
        sectionKey: z.string().trim().max(120),
        sectionLabel: z.string().trim().max(120),
        storyGoal: z.string().trim().max(700),
        issue: z.string().trim().max(900),
        suggestion: z.string().trim().max(1200),
      }),
    )
    .max(30),
});
export type StoryMapAnalysis = z.infer<typeof storyMapAnalysisSchema>;

export const STORY_MAP_SONG_SETUP_HANDOFF_KEY = "pb:story-map-song-setup";
export const storyMapSongSetupHandoffSchema = z
  .object({
    version: z.literal(1),
    storyMapId: z.string().uuid(),
    storyMapTitle: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    concept: z.string().trim().min(3).max(3000),
    progressionType: storyMapProgressionTypeSchema.nullable(),
    summary: z.string().trim().max(1500).nullable(),
    narrator: z.string().trim().max(700).nullable(),
    pointOfView: z.string().trim().max(400).nullable(),
    startingState: z.string().trim().max(700).nullable(),
    centralChange: z.string().trim().max(700).nullable(),
    turningPoint: z.string().trim().max(700).nullable(),
    resolution: z.string().trim().max(700).nullable(),
    beats: z.array(storyMapBeatSchema).min(1).max(10),
  })
  .strict();
export type StoryMapSongSetupHandoff = z.infer<typeof storyMapSongSetupHandoffSchema>;

export function buildStoryMapSongSetupDescription(
  handoff: StoryMapSongSetupHandoff,
  language: "en" | "el",
) {
  const el = language === "el";
  const lines = [
    `${el ? "Ιδέα" : "Concept"}: ${handoff.concept}`,
    handoff.progressionType
      ? `${el ? "Τύπος εξέλιξης" : "Progression type"}: ${handoff.progressionType}`
      : "",
    handoff.summary ? `${el ? "Σύνοψη" : "Summary"}: ${handoff.summary}` : "",
    handoff.narrator ? `${el ? "Αφηγητής" : "Narrator"}: ${handoff.narrator}` : "",
    handoff.pointOfView ? `${el ? "Οπτική γωνία" : "Point of view"}: ${handoff.pointOfView}` : "",
    handoff.startingState
      ? `${el ? "Αρχική κατάσταση" : "Starting state"}: ${handoff.startingState}`
      : "",
    handoff.centralChange
      ? `${el ? "Κεντρική αλλαγή" : "Central change"}: ${handoff.centralChange}`
      : "",
    handoff.turningPoint
      ? `${el ? "Σημείο καμπής" : "Turning point"}: ${handoff.turningPoint}`
      : "",
    handoff.resolution ? `${el ? "Κατάληξη" : "Resolution"}: ${handoff.resolution}` : "",
    `${el ? "Story Beats" : "Story Beats"}:\n${[...handoff.beats]
      .sort((a, b) => a.position - b.position)
      .map(
        (beat, index) =>
          `${index + 1}. ${beat.title}${beat.whatHappens ? ` — ${beat.whatHappens}` : ""}`,
      )
      .join("\n")}`,
  ].filter(Boolean);
  return lines.join("\n\n");
}
