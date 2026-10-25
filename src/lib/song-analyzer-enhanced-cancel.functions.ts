import { safeErrorType } from "@/lib/safe-diagnostics";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";

const cancelInputSchema = z.object({
  jobId: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .regex(/^[A-Za-z0-9_-]+$/),
  audioKey: z.string().trim().min(1).max(500),
});

function assertOwnedAnalyzerKey(key: string, userId: string) {
  if (!key.startsWith(`analyzer-temp/${userId}/`) || key.includes("..")) {
    throw new Error("Invalid Analyzer temporary audio reference.");
  }
}

async function requireEnhancedAnalyzerAccess(context: { supabase: any }) {
  await requireFeatureAccess(context.supabase, "song_analyzer");
  const { data, error } = await context.supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) {
    throw new Error("Enhanced Song Analyzer is currently restricted to Super Admin.");
  }
}

async function deleteTemporaryAudio(key: string) {
  const { deleteFromR2 } = await import("@/lib/r2.server");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await deleteFromR2(key);
      return;
    } catch (error) {
      if (attempt === 3) {
        console.error("[song-analyzer] failed to delete cancelled Analyzer temp audio", {
          key,
          errorType: safeErrorType(error),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}

export const cancelEnhancedStage0Job = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEnhancedAnalyzerAccess(context);
    assertOwnedAnalyzerKey(data.audioKey, context.userId);

    const endpointId = process.env["RUNPOD_MUSIC_ANALYSIS_ENDPOINT_ID"]?.trim();
    const apiKey = process.env["RUNPOD_API_KEY"]?.trim();
    if (!endpointId || !apiKey || !/^[A-Za-z0-9_-]+$/.test(endpointId)) {
      await deleteTemporaryAudio(data.audioKey);
      throw new Error("Enhanced Song Analyzer worker is not configured.");
    }

    let cancelAccepted = false;
    try {
      const response = await fetch(
        `https://api.runpod.ai/v2/${endpointId}/cancel/${encodeURIComponent(data.jobId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(30_000),
        },
      );

      // A completed/already-cancelled job can race this request. Cleanup is still
      // safe and the caller must stop polling either way.
      cancelAccepted = response.ok || response.status === 404 || response.status === 409;
      if (!cancelAccepted) {
        // Provider bodies can contain credentials or private audio metadata.
        console.warn("[song-analyzer] RunPod cancel request was not accepted", {
          status: response.status,
          category: "upstream_failure",
        });
      }
    } finally {
      await deleteTemporaryAudio(data.audioKey);
    }

    return { cancelled: cancelAccepted };
  });
