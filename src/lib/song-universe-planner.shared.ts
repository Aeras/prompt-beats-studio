import { z } from "zod";
import { compatibleOffsetDateTimePattern } from "@/lib/validation-datetime";

import { songUniverseTypeSchema } from "@/lib/song-universe.shared";

export const songUniversePlannerContrastSchema = z.enum(["low", "balanced", "high"]);
export type SongUniversePlannerContrast = z.infer<typeof songUniversePlannerContrastSchema>;

export const songUniverseSummaryCompletenessSchema = z.enum([
  "complete",
  "good",
  "partial",
  "sparse",
]);
export type SongUniverseSummaryCompleteness = z.infer<typeof songUniverseSummaryCompletenessSchema>;

export const songUniverseEvidenceSourceSchema = z.enum([
  "deterministic_fact",
  "semantic_history",
  "story_state",
  "continuity_analysis",
  "project_summary",
  "user_instruction",
  "universe_rule",
]);

export const songUniversePlannerEvidenceSchema = z.object({
  id: z.string().min(1).max(120),
  statement: z.string().trim().min(1).max(1200),
  sourceType: songUniverseEvidenceSourceSchema,
  sourceRef: z.string().trim().max(300).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
});
export type SongUniversePlannerEvidence = z.infer<typeof songUniversePlannerEvidenceSchema>;

export const projectUniverseSummarySchema = z.object({
  projectId: z.string().guid(),
  projectTitle: z.string().trim().min(1).max(300),
  songTitle: z.string().trim().max(300).nullable().default(null),
  versionId: z.string().guid().nullable().default(null),
  versionNumber: z.number().int().nonnegative().nullable().default(null),
  theme: z.string().trim().max(2000).nullable().default(null),
  genre: z.string().trim().max(1000).nullable().default(null),
  style: z.string().trim().max(2000).nullable().default(null),
  mood: z.string().trim().max(1000).nullable().default(null),
  bpm: z.number().min(20).max(300).nullable().default(null),
  instruments: z.array(z.string().trim().max(300)).max(50).default([]),
  productionStyle: z.string().trim().max(2000).nullable().default(null),
  structure: z.array(z.string().trim().max(200)).max(100).default([]),
  hookType: z.string().trim().max(500).nullable().default(null),
  lyricsSummary: z.string().trim().max(5000).nullable().default(null),
  lyricsExcerpt: z.string().trim().max(6000).nullable().default(null),
  narrativeSummary: z.string().trim().max(5000).nullable().default(null),
  narratorPov: z.string().trim().max(500).nullable().default(null),
  majorImagery: z.array(z.string().trim().max(300)).max(50).default([]),
  settings: z.array(z.string().trim().max(300)).max(50).default([]),
  recurringMotifs: z.array(z.string().trim().max(300)).max(50).default([]),
  storyMapSummary: z.string().trim().max(5000).nullable().default(null),
  progressionType: z.string().trim().max(300).nullable().default(null),
  startingState: z.string().trim().max(2000).nullable().default(null),
  centralChange: z.string().trim().max(2000).nullable().default(null),
  turningPoint: z.string().trim().max(2000).nullable().default(null),
  resolution: z.string().trim().max(2000).nullable().default(null),
  unresolvedQuestions: z.array(z.string().trim().max(1000)).max(30).default([]),
  universeRole: z.string().trim().max(200).nullable().default(null),
  projectStatus: z.string().trim().max(100).nullable().default(null),
  intentionalOutlier: z.boolean().default(false),
  outlierPurpose: z.string().trim().max(1000).nullable().default(null),
  inheritedUniverseTraits: z.array(z.string().trim().max(200)).max(200).default([]),
  position: z.number().int().nonnegative(),
  availableSources: z.array(z.string().trim().max(100)).max(50).default([]),
  missingSources: z.array(z.string().trim().max(100)).max(50).default([]),
  sourceCompleteness: songUniverseSummaryCompletenessSchema.default("partial"),
  // Supabase/Postgres timestamptz values are valid ISO datetimes with explicit offsets
  // (for example +00:00), so accept both Z and offset forms at the Project Memory boundary.
  versionUpdatedAt: z.string().regex(compatibleOffsetDateTimePattern).nullable().default(null),
  storyMapUpdatedAt: z.string().regex(compatibleOffsetDateTimePattern).nullable().default(null),
  updatedAt: z.string().regex(compatibleOffsetDateTimePattern).nullable().default(null),
});
export type ProjectUniverseSummary = z.infer<typeof projectUniverseSummarySchema>;

export const songUniverseStoryStateSchema = z.object({
  canonFacts: z.array(z.string().trim().max(1200)).max(100).default([]),
  characters: z.array(z.string().trim().max(500)).max(100).default([]),
  relationships: z.array(z.string().trim().max(1000)).max(100).default([]),
  locations: z.array(z.string().trim().max(500)).max(100).default([]),
  timeline: z.array(z.string().trim().max(1200)).max(100).default([]),
  knownEvents: z.array(z.string().trim().max(1200)).max(100).default([]),
  resolvedEvents: z.array(z.string().trim().max(1200)).max(100).default([]),
  unresolvedEvents: z.array(z.string().trim().max(1200)).max(100).default([]),
  openQuestions: z.array(z.string().trim().max(1200)).max(100).default([]),
  discoveries: z.array(z.string().trim().max(1200)).max(100).default([]),
  currentEmotionalState: z.string().trim().max(2000).nullable().default(null),
  majorConflict: z.string().trim().max(2000).nullable().default(null),
  recurringSymbols: z.array(z.string().trim().max(500)).max(100).default([]),
  worldRules: z.array(z.string().trim().max(1200)).max(100).default([]),
  currentNarrativeStage: z.string().trim().max(1000).nullable().default(null),
  possibleNextStages: z.array(z.string().trim().max(1200)).max(30).default([]),
  desiredEnding: z.string().trim().max(3000).nullable().default(null),
});
export type SongUniverseStoryState = z.infer<typeof songUniverseStoryStateSchema>;

export const songUniverseUsageLevelSchema = z.enum([
  "unused",
  "light",
  "moderate",
  "heavy",
  "saturated",
]);

export const songUniverseUsageItemSchema = z.object({
  key: z.string().trim().min(1).max(300),
  count: z.number().min(0),
  weightedCount: z.number().min(0),
  totalComparable: z.number().int().min(0),
  level: songUniverseUsageLevelSchema,
  source: z.enum(["deterministic", "semantic"]),
});

export const songUniverseUsageProfileSchema = z.object({
  trackCount: z.number().int().nonnegative(),
  bpmRanges: z.array(songUniverseUsageItemSchema).max(30).default([]),
  moods: z.array(songUniverseUsageItemSchema).max(100).default([]),
  genres: z.array(songUniverseUsageItemSchema).max(100).default([]),
  structures: z.array(songUniverseUsageItemSchema).max(100).default([]),
  instruments: z.array(songUniverseUsageItemSchema).max(100).default([]),
  roles: z.array(songUniverseUsageItemSchema).max(100).default([]),
  themeFamilies: z.array(songUniverseUsageItemSchema).max(100).default([]),
  settingFamilies: z.array(songUniverseUsageItemSchema).max(100).default([]),
  motifFamilies: z.array(songUniverseUsageItemSchema).max(100).default([]),
});
export type SongUniverseUsageProfile = z.infer<typeof songUniverseUsageProfileSchema>;

export const songUniverseDuplicateRiskSchema = z.object({
  level: z.enum(["none", "low", "high"]),
  projectId: z.string().guid().nullable().default(null),
  projectTitle: z.string().trim().max(300).nullable().default(null),
  similarity: z.number().min(0).max(1).nullable().default(null),
  reason: z.string().trim().max(1200).default(""),
});
export type SongUniverseDuplicateRisk = z.infer<typeof songUniverseDuplicateRiskSchema>;

export const nextSongBriefSchema = z.object({
  strategyVersion: z.string().trim().min(1).max(100),
  universeType: songUniverseTypeSchema,
  targetRole: z.string().trim().max(200).nullable().default(null),
  contrastLevel: songUniversePlannerContrastSchema.default("balanced"),
  identityToPreserve: z.array(z.string().trim().max(1000)).max(30).default([]),
  mustRespect: z.array(z.string().trim().max(1000)).max(30).default([]),
  themesToExplore: z.array(z.string().trim().max(1000)).max(30).default([]),
  preferNotToRepeatThemes: z.array(z.string().trim().max(1000)).max(30).default([]),
  preferNotToRepeatMotifs: z.array(z.string().trim().max(1000)).max(30).default([]),
  mustAvoid: z.array(z.string().trim().max(1000)).max(30).default([]),
  recommendedMood: z.string().trim().max(1000).nullable().default(null),
  recommendedEnergy: z.string().trim().max(1000).nullable().default(null),
  recommendedBpmDirection: z.string().trim().max(1000).nullable().default(null),
  recommendedStructureDirection: z.string().trim().max(1000).nullable().default(null),
  recommendedHookDirection: z.string().trim().max(1000).nullable().default(null),
  recommendedPov: z.string().trim().max(1000).nullable().default(null),
  recommendedSettingDirection: z.string().trim().max(1000).nullable().default(null),
  storyState: songUniverseStoryStateSchema.nullable().default(null),
  narrativeState: z.string().trim().max(5000).nullable().default(null),
  storyProgression: z.string().trim().max(5000).nullable().default(null),
  eventsNotToRepeat: z.array(z.string().trim().max(1000)).max(30).default([]),
  openStoryQuestions: z.array(z.string().trim().max(1000)).max(30).default([]),
  nextNarrativeOpportunity: z.string().trim().max(3000).nullable().default(null),
  intentionalContrast: z.array(z.string().trim().max(1000)).max(30).default([]),
  continuityNotes: z.array(z.string().trim().max(1000)).max(30).default([]),
  creativeOpportunity: z.array(z.string().trim().max(1000)).max(30).default([]),
  portfolioBalanceNotes: z.array(z.string().trim().max(1000)).max(30).default([]),
  evidence: z.array(songUniversePlannerEvidenceSchema).max(50).default([]),
  reasoningSummary: z.string().trim().max(4000).default(""),
});
export type NextSongBrief = z.infer<typeof nextSongBriefSchema>;

export const songUniversePlannerEditableFieldSchema = z.enum([
  "themesToExplore",
  "recommendedMood",
  "recommendedEnergy",
  "recommendedBpmDirection",
  "recommendedStructureDirection",
  "recommendedHookDirection",
  "recommendedPov",
  "recommendedSettingDirection",
  "storyProgression",
  "nextNarrativeOpportunity",
]);
export type SongUniversePlannerEditableField = z.infer<
  typeof songUniversePlannerEditableFieldSchema
>;

export const songUniversePlannerInputSchema = z.object({
  universeType: songUniverseTypeSchema,
  currentSongIntent: z.string().trim().max(3000).nullable().default(null),
  targetRole: z.string().trim().max(200).nullable().default(null),
  plannedTrackCount: z.number().int().min(1).max(200).nullable().default(null),
  targetPosition: z.number().int().min(0).max(199).nullable().default(null),
  contrastLevel: songUniversePlannerContrastSchema.default("balanced"),
  pinnedFields: z.array(songUniversePlannerEditableFieldSchema).max(20).default([]),
});
export type SongUniversePlannerInput = z.infer<typeof songUniversePlannerInputSchema>;

export const SONG_UNIVERSE_PLANNER_PRECEDENCE = [
  "explicit_current_song_instruction",
  "must_respect_or_story_canon",
  "universe_dna_core",
  "approved_next_song_brief",
  "soft_planner_recommendation",
  "diversity_saturation_suggestion",
] as const;

export const SONG_UNIVERSE_PLANNER_PHILOSOPHY =
  "Creative Director + Project Memory + Diversity Planner + Narrative Continuity Engine";
