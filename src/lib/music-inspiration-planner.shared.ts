import { z } from "zod";
import { inspirationRequestSchema, type InspirationRequest } from "./music-inspiration.shared";

export const INSPIRATION_RESEARCH_TOPICS = [
  "genre_era",
  "instruments_techniques",
  "rhythm_tempo",
  "harmony_melody",
  "vocals",
  "structure_arrangement",
  "production_sound",
  "sources_credits",
] as const;
const language = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/\p{Cc}/u.test(v), "Control characters forbidden");
export const inspirationPlanSchema = z
  .object({
    version: z.literal(1),
    request: inspirationRequestSchema,
    entities: z
      .array(
        z
          .object({
            name: text(200),
            role: z.enum(["target", "reference", "intent"]),
            kind: z.enum(["artist", "band", "song", "style", "technique"]),
            aliases: z.array(text(200)).max(4),
          })
          .strict(),
      )
      .max(12),
    sourceLanguages: z
      .array(z.object({ code: language, reason: text(250) }).strict())
      .min(1)
      .max(5),
    queries: z
      .array(
        z
          .object({
            text: text(500),
            language,
            topics: z.array(z.enum(INSPIRATION_RESEARCH_TOPICS)).min(1).max(8),
            reason: text(250),
          })
          .strict(),
      )
      .min(2)
      .max(5),
    ambiguities: z.array(text(500)).max(8),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const expected = plan.request.depth === "extended" ? 5 : 2;
    if (plan.queries.length !== expected)
      ctx.addIssue({ code: "custom", path: ["queries"], message: "Exact search count required" });
    const languages = new Set(plan.sourceLanguages.map((l) => l.code));
    if (
      languages.size !== plan.sourceLanguages.length ||
      plan.queries.some((q) => !languages.has(q.language))
    )
      ctx.addIssue({
        code: "custom",
        path: ["sourceLanguages"],
        message: "Query language must have a unique justified source language",
      });
    if (
      new Set(plan.queries.map((q) => q.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ")))
        .size !== plan.queries.length
    )
      ctx.addIssue({ code: "custom", path: ["queries"], message: "Duplicate query" });
    const topics = new Set(plan.queries.flatMap((q) => q.topics));
    if (INSPIRATION_RESEARCH_TOPICS.some((t) => !topics.has(t)))
      ctx.addIssue({
        code: "custom",
        path: ["queries"],
        message: "All eight topics require coverage",
      });
  });
export type InspirationPlan = z.infer<typeof inspirationPlanSchema>;
export function validateInspirationPlan(
  raw: unknown,
  request: InspirationRequest,
): InspirationPlan {
  const plan = inspirationPlanSchema.parse(raw);
  if (JSON.stringify(plan.request) !== JSON.stringify(inspirationRequestSchema.parse(request)))
    throw new Error("planner_request_mismatch");
  return plan;
}
