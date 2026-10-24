import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeDurableAuxiliaryAiRequest } from "@/lib/ai-auxiliary-idempotency.server";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";
import {
  audioRevisionIntentProposalSchema,
  requestAudioRevisionIntentTranslationSchema,
} from "@/lib/audio-revision-intent.shared";
import { assertCurrentAudioRevisionSource } from "@/lib/audio-revision-source.server";
import { validateAudioRevisionSectionSuggestions } from "@/lib/audio-revision-section-validation";

const TRANSLATION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    keep: { type: "STRING" },
    change: { type: "STRING" },
    revisionBrief: { type: "STRING" },
    sectionSuggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          structureIndex: { type: "INTEGER", nullable: true },
          sectionLabel: { type: "STRING", nullable: true },
          instruction: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["structureIndex", "sectionLabel", "instruction", "confidence"],
      },
    },
  },
  required: ["keep", "change", "revisionBrief", "sectionSuggestions"],
};

const SYSTEM_PROMPT = `You are the PromptBeats Revision Intent Translator.
Your task is proposal-only: translate a creator's natural-language revision request into reviewable revision suggestions.

Rules:
- Preserve what the user actually asked for. Do not invent audio facts or claim to have heard the track.
- Never auto-apply or imply that a revision has been executed.
- Return only JSON matching the requested schema.
- KEEP describes what should remain unchanged.
- CHANGE describes what should change.
- REVISION BRIEF is a concise overall direction.
- Section suggestions may target only the supplied canonical structure indexes.
- For every section suggestion, copy the exact canonical section label supplied for that index. Never fuzzy-map or invent a different occurrence.
- If you cannot identify a section confidently, use null for structureIndex/sectionLabel and explain the request in instruction.
- Confidence is a number from 0 to 1.
- Do not reference Analyzer, QC, Lyrics Review, audio evidence, or unrelated project history.`;

function canonicalSections(structure: string[]) {
  const seen = new Map<string, number>();
  return structure.map((label, index) => {
    const key = label.trim().toLocaleLowerCase();
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { index, label, occurrence };
  });
}

export const translateAudioRevisionIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestAudioRevisionIntentTranslationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "ai_generator");
    await assertCurrentAudioRevisionSource({
      supabase: context.supabase,
      userId: context.userId,
      projectId: data.projectId,
      versionId: data.versionId,
      trackId: data.trackId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: intent, error: intentError } = await (supabaseAdmin as any)
      .from("project_audio_revision_intents")
      .select("id, project_id, source_version_prompt_id, source_track_id, user_request, status")
      .eq("id", data.intentId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (intentError) throw new Error(intentError.message);
    if (
      !intent ||
      intent.project_id !== data.projectId ||
      intent.source_version_prompt_id !== data.versionId ||
      intent.source_track_id !== data.trackId ||
      intent.status !== "draft"
    ) {
      throw new Error("Revision intent not found for this source.");
    }
    if (!String(intent.user_request ?? "").trim()) {
      throw new Error("Write what you want to change before asking AI to interpret it.");
    }

    const { data: sourceVersion, error: sourceError } = await (supabaseAdmin as any)
      .from("saved_prompts")
      .select("id, generator_input_snapshot")
      .eq("id", data.versionId)
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    const snapshot = generatorInputSnapshotSchema.safeParse(
      sourceVersion?.generator_input_snapshot,
    );
    if (!snapshot.success || snapshot.data.songStructure.length === 0) {
      throw new Error(
        "The source version does not have canonical structure context for AI interpretation.",
      );
    }

    return executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "audio_revision_intent",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const structure = snapshot.data.songStructure;
        const prompt = `USER REVISION REQUEST:\n${String(intent.user_request).trim()}\n\nCANONICAL SOURCE STRUCTURE:\n${canonicalSections(
          structure,
        )
          .map((section) => `${section.index}: ${section.label} (occurrence ${section.occurrence})`)
          .join(
            "\n",
          )}\n\nTranslate the request into concise reviewable Keep / Change / Revision Brief suggestions. Section suggestions must use only the canonical indexes and exact labels above.`;

        const { modelCaller, resolveAiModelForUser } = await import("@/lib/ai-provider.server");
        const { recordAiUsage } = await import("@/lib/ai-usage.server");
        const resolved = await resolveAiModelForUser(context.userId, "ai_tools", data.model);
        const caller = modelCaller(resolved.model, resolved.provider, {
          userId: context.userId,
          operation: "audio_revision_intent",
        });
        let result: Awaited<ReturnType<typeof caller>> | null = null;

        try {
          await markProviderStarted();
          result = await caller({
            system: SYSTEM_PROMPT,
            prompt,
            maxTokens: 1800,
            schema: TRANSLATION_SCHEMA,
          });
          await recordAiUsage({
            executionId: caller.executionId,
            userId: context.userId,
            provider: result.provider,
            model: result.model,
            operation: "audio_revision_intent",
            usage: result.usage,
            success: result.stopReason === "end_turn",
          });
          if (result.stopReason !== "end_turn") {
            throw new Error("The AI interpretation did not finish. Please try again.");
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(result.text);
          } catch {
            throw new Error(
              "The AI interpretation returned an invalid response. Please try again.",
            );
          }
          const proposal = audioRevisionIntentProposalSchema.parse(parsed);
          const sections = validateAudioRevisionSectionSuggestions(structure, proposal);
          return {
            proposal,
            resolvedSections: sections.resolved,
            unresolvedSections: sections.unresolved,
            model: result.model,
          };
        } catch (error) {
          if (!result) {
            await recordAiUsage({
              executionId: caller.executionId,
              userId: context.userId,
              provider: resolved.provider,
              model: resolved.model,
              operation: "audio_revision_intent",
              usage: null,
              success: false,
            });
          }
          throw error;
        }
      },
    });
  });
