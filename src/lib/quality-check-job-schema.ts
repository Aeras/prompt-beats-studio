import { z } from "zod";

import {
  AI_TARGET_PLATFORMS,
  DEFAULT_AI_TARGET_PLATFORM,
} from "@/lib/ai-target-platforms";

export const durableQualityCheckInput = z.object({
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  theme: z.string().trim().min(3).max(500),
  genre: z.string().trim().min(1).max(500),
  mood: z.string().trim().min(1).max(120),
  language: z.string().trim().min(1).max(40),
  structure: z.string().trim().max(600).default(""),
  production: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(2000).default(""),
  result: z.object({
    title: z.string().trim().min(1).max(200),
    tags: z.string().trim().min(1).max(4000),
    lyrics: z.string().trim().min(1).max(12000),
    note: z.string().trim().min(1).max(6000),
  }),
  qualityCheckModel: z.string().trim().min(1).max(240).nullish(),
  generationId: z.string().uuid().nullish(),
});

const issueList = z.array(z.string().trim().min(1).max(600)).max(30);

export const correctionSchema = z.object({
  field: z.enum(["title", "tags", "lyrics", "note"]),
  sectionLabel: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v ?? ""),
  originalText: z.string().min(1).max(4000),
  occurrenceIndex: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((v) => v ?? 1),
  reason: z.string().trim().min(1).max(600),
  replacementText: z.string().min(1).max(4000),
});

const vocalInsertionSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(80),
  sectionOccurrenceIndex: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((v) => v ?? null),
  tag: z.string().trim().min(2).max(60),
});

export const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(800),
  actionType: z.enum(["add_to_music_style", "vocal_arrangement", "informational"]),
  value: z
    .string()
    .trim()
    .max(600)
    .nullish()
    .transform((v) => v ?? ""),
  arrangement: z
    .array(vocalInsertionSchema)
    .max(40)
    .nullish()
    .transform((v) => v ?? []),
});

const suggestionList = z
  .array(suggestionSchema)
  .max(12)
  .nullish()
  .transform((v) => v ?? []);

export const qualityReportSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  issues: issueList,
  languageIssues: issueList,
  grammarIssues: issueList,
  singabilityIssues: issueList,
  genreIssues: issueList,
  consistencyIssues: issueList,
  corrections: z
    .array(correctionSchema)
    .max(20)
    .nullish()
    .transform((v) => v ?? []),
  creativeSuggestions: suggestionList,
  vocalSuggestions: suggestionList,
  productionSuggestions: suggestionList,
});

export type DurableQualityCheckInput = z.infer<typeof durableQualityCheckInput>;
export type QualityReport = z.infer<typeof qualityReportSchema>;
