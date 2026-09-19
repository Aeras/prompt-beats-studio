/**
 * Client-facing API for durable song generation jobs.
 *
 * The browser never waits for the AI provider. It creates a job (one atomic
 * credit consumption), gets a `jobId` back immediately, and polls for the
 * result. Execution happens in `generation-jobs.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";

import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AI_TARGET_PLATFORMS,
  DEFAULT_AI_TARGET_PLATFORM,
} from "@/lib/ai-target-platforms";

const jobInput = z.object({
  idempotencyKey: z.string().uuid(),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  theme: z.string().trim().min(3),
  genre: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  language: z.string().trim().min(1).max(40),
  generationModel: z.string().trim().min(1).max(240).nullish(),
  advanced: z.boolean().default(false),
  baseMusicStyle: z.string().trim().default(""),
  instruments: z.string().trim().default(""),
  structure: z.string().trim().max(600).default(""),
  production: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(2000).default(""),
});

function assertGenerationInputLimits(
  input: z.infer<typeof jobInput>,
  isAdmin: boolean,
) {
  if (isAdmin) return;
  if (input.advanced) {
    if (input.theme.length > 500) throw new Error("Theme must be 500 characters or fewer.");
    if (!input.baseMusicStyle || input.baseMusicStyle.length > 150) throw new Error("Music Style must be 150 characters or fewer.");
    if (input.genre.length > 500) throw new Error("The composed music direction must be 500 characters or fewer.");
    if (input.mood.length > 120) throw new Error("Mood must be 120 characters or fewer.");
    if (input.instruments.length > 200) throw new Error("Instruments must be 200 characters or fewer.");
    return;
  }
  if (input.theme.length > 300) throw new Error("Theme must be 300 characters or fewer.");
  if (input.genre.length > 400) throw new Error("Music Style must be 400 characters or fewer.");
  if (input.mood.length > 60) throw new Error("Mood must be 60 characters or fewer.");
}

const resultShape = z.object({
  title: z.string(),
  tags: z.string(),
  lyrics: z.string(),
  note: z.string(),
});

/**
 * The original generation brief, persisted with the job. This is the
 * authoritative recovery source for Quality Check after a refresh or a
 * completely closed browser — never localStorage, never the result text.
 */
const inputShape = z.object({
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  theme: z.string().default(""),
  genre: z.string().default(""),
  mood: z.string().default(""),
  language: z.string().default(""),
  structure: z.string().default(""),
  production: z.string().default(""),
  instructions: z.string().default(""),
});

export type GenerationContext = z.infer<typeof inputShape>;

type JobRow = {
  id: string;
  status: string;
  result: unknown;
  input_payload: unknown;
  error: string | null;
  generation_id: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
};

export type GenerationJob = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  result: z.infer<typeof resultShape> | null;
  input: GenerationContext | null;
  error: string | null;
  generationId: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
};

const JOB_COLUMNS = "id,status,result,input_payload,error,generation_id,provider,model,created_at";

function toJob(row: JobRow): GenerationJob {
  const parsed = resultShape.safeParse(row.result);
  const input = inputShape.safeParse(row.input_payload);
  return {
    jobId: row.id,
    status: (row.status as GenerationJob["status"]) ?? "pending",
    result: parsed.success ? parsed.data : null,
    input: input.success ? input.data : null,
    error: row.error,
    generationId: row.generation_id,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

// Execution is signalled by the database (pg_net) the moment the job row is
// created, and re-signalled by a scheduled sweep. Nothing here starts work in
// the browser's request, so a generation cannot die with the connection.

/**
 * Creates (or re-returns) a generation job. The database routine consumes
 * exactly one creation atomically under a per-user lock, so double taps,
 * retries after a dropped response, and concurrent tabs can never spend two.
 */
export const startGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => jobInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { getModelForUser } = await import("@/lib/ai-provider.server");
    const { data: isAdmin } = await supabase.rpc("current_user_has_role", { _role: "admin" });
    assertGenerationInputLimits(data, isAdmin === true);
    await getModelForUser(context.userId, data.generationModel ?? undefined, "generator");
    const { idempotencyKey, advanced: _advanced, baseMusicStyle: _baseMusicStyle, instruments: _instruments, ...payload } = data;
    const { data: raw, error } = await supabase.rpc("start_generation_job", {
      _idempotency_key: idempotencyKey,
      _input: payload,
    });
    if (error) throw new Error(`The generation could not be started (${error.message}).`);
    if (raw && (raw as { rate_limited?: boolean }).rate_limited) {
      return { rateLimited: true as const, job: null };
    }
    const job = toJob(raw as JobRow);
    return { rateLimited: false as const, job };
  });

/** Polls one job. Ownership is enforced by row-level security. */
export const getGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: row } = await supabase
      .from("ai_generation_jobs")
      .select(JOB_COLUMNS)
      .eq("id", data.jobId)
      .maybeSingle();
    if (!row) return { job: null };
    // Never re-signals execution: the database owns starting and recovering
    // jobs, so polling can never cause a second provider call.
    return { job: toJob(row as JobRow) };
  });

/**
 * Recovers the newest recent job after a refresh or a lost response.
 * Dismissed jobs are never resurrected.
 */
export const getLatestGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const { data: row } = await supabase
      .from("ai_generation_jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .in("status", ["pending", "processing", "completed"])
      .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { job: row ? toJob(row as JobRow) : null };
  });

/**
 * Forgets a job (Clear / dismiss). A pending job is cancelled so the runner
 * skips it; a job already claimed keeps running to completion but will never
 * be shown again. No creation is refunded and none is consumed.
 */
export const dismissGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: result, error } = await supabase.rpc("dismiss_generation_job", {
      _job_id: data.jobId,
    });
    const parsed = z.enum(["CANCELLED", "DISMISSED", "ALREADY_FINAL"]).safeParse(result);
    if (error || !parsed.success) {
      throw new Error("The generation could not be dismissed. Please try again.");
    }
    return { outcome: parsed.data };
  });
