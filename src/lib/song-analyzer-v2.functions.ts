import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "./ai-auxiliary-idempotency.server";
import { recordAiUsage } from "./ai-usage.server";
import { beginExecution, checkpointExecution, observeExecution } from "./ai-execution.server";
import {
  ANALYZER_RESPONSE_SCHEMA,
  requireAnalyzerAccess,
  resolveSongAnalyzerModel,
  SONG_ANALYZER_MAX_FILE_BYTES,
  songAnalysisResultSchema,
} from "./song-analyzer.functions";
import { stage0DspEvidenceSchema } from "./song-analyzer-dsp.shared";
import {
  analyzerAudioMimeSchema,
  analyzerV2ProvenanceSchema,
  essentiaOnlyEvidence,
} from "./song-analyzer-v2.shared";
import { runSingleCallAnalyzerV2 } from "./song-analyzer-v2.server";
import { analyzerV2AdminEnabled } from "./song-analyzer-v2-admin-options.server";

export const analyzeSongV2Input = z
  .object({
    version: z.literal("v2"),
    requestKey: auxiliaryRequestKeySchema,
    audioBase64: z.string().min(1).max(21_500_000),
    mimeType: analyzerAudioMimeSchema,
    model: z.string().trim().min(1).max(240),
    stage0Evidence: stage0DspEvidenceSchema,
  })
  .strict();

function v2RequestKey(key: string) {
  // Separate V1/V2 logical namespaces without new operations or schema/migrations.
  const bytes = createHash("sha256").update(`song-analyzer:v2:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const analyzeSongV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeSongV2Input.parse(input))
  .handler(async ({ data, context }) => {
    await requireAnalyzerAccess(context); // Same server-authoritative Analyzer access as V1.
    const stage0Evidence = essentiaOnlyEvidence(data.stage0Evidence);
    const bytes = Buffer.from(data.audioBase64, "base64");
    if (!bytes.length || bytes.byteLength > SONG_ANALYZER_MAX_FILE_BYTES)
      throw new Error("Analyzer V2: AUDIO_TOO_LARGE_OR_EMPTY (15 MB maximum).");
    if (bytes.toString("base64") !== data.audioBase64)
      throw new Error("Analyzer V2: INVALID_AUDIO_ENCODING.");
    const fingerprint = createHash("sha256")
      .update(data.model)
      .update("\0")
      .update(data.mimeType)
      .update("\0")
      .update(bytes)
      .digest("hex");
    const response = await executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      userId: context.userId,
      operation: "song_analyzer",
      requestKey: v2RequestKey(data.requestKey),
      execute: async (markProviderStarted) => {
        const model = await resolveSongAnalyzerModel(data.model);
        const secret =
          model.provider === "openai"
            ? "OPENAI_API_KEY"
            : model.provider === "openrouter"
              ? "OPENROUTER_API_KEY"
              : "GEMINI_API_KEY";
        const allowAdminOptIn = await analyzerV2AdminEnabled(model.provider, model.id);
        const executionId = crypto.randomUUID();
        const executionContext = { userId: context.userId, operation: "song_analysis" as const };
        const { result, usage } = await runSingleCallAnalyzerV2({
          allowAdminOptIn,
          model,
          apiKey: process.env[secret] ?? "",
          audioBase64: data.audioBase64,
          mimeType: data.mimeType,
          stage0Evidence,
          schema: ANALYZER_RESPONSE_SCHEMA,
          validator: songAnalysisResultSchema,
          markProviderStarted: async () => {
            await markProviderStarted(model.id);
            await beginExecution(executionId, executionContext, model.provider, model.id);
          },
          observeUsage: (usage) => observeExecution(executionId, context.userId, usage),
          recordUsage: (usage, success) =>
            recordAiUsage({
              executionId,
              userId: context.userId,
              provider: model.provider,
              model: model.id,
              operation: "song_analysis",
              usage,
              success,
            }),
        });
        await checkpointExecution(executionId, executionContext, {
          text: JSON.stringify(result),
          usage,
          stopReason: "end_turn",
          provider: model.provider,
          model: model.id,
        });
        const provenance = analyzerV2ProvenanceSchema.parse({
          version: "v2",
          provider: model.provider,
          model: model.id,
          label: (model.label || model.id).slice(0, 300),
          essentiaEngine: stage0Evidence.engine!.engineVersion,
          stage0Completed: true,
          providerCalls: 1,
          requestFingerprint: fingerprint,
          usage,
        });
        return {
          result: {
            ...result,
            generatorReady: { ...result.generatorReady, analyzerVersion: "v2" as const },
            detailedAnalysis: { ...result.detailedAnalysis, analyzerProvenance: provenance },
          },
          model: model.id,
          stage0Evidence,
          stageAEvidence: null,
          provenance,
        };
      },
    });
    // Reject stale/mismatched replay results rather than showing another file/model/version.
    if (
      response.provenance?.version !== "v2" ||
      response.provenance.requestFingerprint !== fingerprint
    )
      throw new Error("Analyzer V2: REQUEST_KEY_MISMATCH. Start a new analysis explicitly.");
    return response;
  });
