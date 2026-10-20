/**
 * Client-facing API for durable Quality Check jobs.
 *
 * The browser persists a QC action and gets its id back immediately. Provider
 * execution happens through the database-triggered runner, never inside this
 * browser request. The browser only polls/re-recovers the persisted action.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  durableQualityCheckInput,
  qualityReportSchema,
  type DurableQualityCheckInput,
  type QualityReport,
} from "@/lib/quality-check-job-schema";

const statusSchema = z.enum(["pending", "processing", "completed", "failed"]);

const rawJobSchema = z.object({
  actionId: z.string().uuid(),
  status: statusSchema,
  qualityReport: z.unknown().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  error: z.string().nullish(),
  createdAt: z.string(),
});

export type QualityCheckJob = {
  actionId: string;
  status: z.infer<typeof statusSchema>;
  qualityReport: QualityReport | null;
  provider: string | null;
  model: string | null;
  error: string | null;
  createdAt: string;
};

function toJob(raw: unknown): QualityCheckJob {
  const parsed = rawJobSchema.parse(raw);
  const quality = parsed.qualityReport ? qualityReportSchema.safeParse(parsed.qualityReport) : null;
  return {
    actionId: parsed.actionId,
    status: parsed.status,
    qualityReport: quality?.success ? quality.data : null,
    provider: parsed.provider ?? null,
    model: parsed.model ?? null,
    error: parsed.error ?? null,
    createdAt: parsed.createdAt,
  };
}

const startInput = durableQualityCheckInput.extend({
  idempotencyKey: z.string().uuid(),
});

/**
 * Creates (or re-returns) one durable QC action. Model access is validated
 * before admission; the provider is still resolved again by the worker so a
 * permission change between admission and execution fails safely, uncharged.
 */
export const startQualityCheckJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "quality_check");
    if (data.qualityCheckVersion === "v2") {
      const { data: superAdmin, error: roleError } = await context.supabase.rpc(
        "current_user_is_super_admin",
      );
      if (roleError || superAdmin !== true) {
        throw new Error("Quality Check V2 is restricted to Super Admin.");
      }
    }
    const { getModelForUser } = await import("@/lib/ai-provider.server");
    await getModelForUser(context.userId, data.qualityCheckModel ?? undefined, "quality_check");

    const { idempotencyKey, ...payload } = data;
    const { data: raw, error } = await (context.supabase as any).rpc("start_quality_check_job", {
      _idempotency_key: idempotencyKey,
      _input: payload,
    });
    if (error) throw new Error("The quality check could not be started. Please try again.");
    if (
      raw &&
      typeof raw === "object" &&
      (raw as { rate_limited?: unknown }).rate_limited === true
    ) {
      return { rateLimited: true as const, job: null };
    }
    return { rateLimited: false as const, job: toJob(raw) };
  });

/** Polls one caller-owned QC action through the protected RPC projection. */
export const getQualityCheckJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ actionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await (context.supabase as any).rpc("get_quality_check_job", {
      _action_id: data.actionId,
    });
    if (error) throw new Error("The quality check status could not be loaded.");
    return { job: raw ? toJob(raw) : null };
  });

/**
 * Recovers the newest recent QC for the current generated song after refresh,
 * a lost start response or a mobile app/background transition.
 */
export const getLatestQualityCheckJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ generationId: z.string().uuid().nullish() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await (context.supabase as any).rpc(
      "get_latest_quality_check_job",
      { _generation_id: data.generationId ?? null },
    );
    if (error) throw new Error("The latest quality check could not be loaded.");
    return { job: raw ? toJob(raw) : null };
  });

export type QualityCheckJobInput = DurableQualityCheckInput;
