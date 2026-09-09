/**
 * Client-facing API for durable song generation jobs.
 *
 * The browser never waits for the AI provider. It creates a job (one atomic
 * credit consumption), gets a `jobId` back immediately, and polls for the
 * result. Execution happens in `generation-jobs.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const jobInput = z.object({
  idempotencyKey: z.string().uuid(),
  theme: z.string().trim().min(3).max(300),
  genre: z.string().trim().min(1).max(400),
  mood: z.string().trim().min(1).max(60),
  language: z.string().trim().min(1).max(40),
});

const resultShape = z.object({
  title: z.string(),
  tags: z.string(),
  lyrics: z.string(),
  note: z.string(),
});

type JobRow = {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
  generation_id: string | null;
  created_at: string;
};

export type GenerationJob = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  result: z.infer<typeof resultShape> | null;
  error: string | null;
  generationId: string | null;
  createdAt: string;
};

function toJob(row: JobRow): GenerationJob {
  const parsed = resultShape.safeParse(row.result);
  return {
    jobId: row.id,
    status: (row.status as GenerationJob["status"]) ?? "pending",
    result: parsed.success ? parsed.data : null,
    error: row.error,
    generationId: row.generation_id,
    createdAt: row.created_at,
  };
}

function currentOrigin(): string | null {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return null;
  }
}

/** Fire-and-forget start signal; failures are irrelevant because polling re-kicks. */
async function signalRunner(jobId: string) {
  const origin = currentOrigin();
  if (!origin) return;
  const { kickRunner } = await import("@/lib/generation-jobs.server");
  await kickRunner(origin, jobId);
}

/**
 * Creates (or re-returns) a generation job. The database routine consumes
 * exactly one creation atomically under a per-user lock, so double taps,
 * retries after a dropped response, and concurrent tabs can never spend two.
 */
export const startGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => jobInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { idempotencyKey, ...payload } = data;
    const { data: raw, error } = await supabase.rpc("start_generation_job", {
      _idempotency_key: idempotencyKey,
      _input: payload,
    });
    if (error) throw new Error(`The generation could not be started (${error.message}).`);
    if (raw && (raw as { rate_limited?: boolean }).rate_limited) {
      return { rateLimited: true as const, job: null };
    }
    const job = toJob(raw as JobRow);
    if (job.status === "pending") await signalRunner(job.jobId);
    return { rateLimited: false as const, job };
  });

/** Polls one job. Ownership is enforced by row-level security. */
export const getGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: row } = await supabase
      .from("ai_generation_jobs")
      .select("id,status,result,error,generation_id,created_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!row) return { job: null };
    const job = toJob(row as JobRow);
    // Recovery: a job nobody picked up is safe to (re)start — the provider has
    // not been called yet. Claimed jobs are never restarted here.
    if (job.status === "pending" && Date.now() - new Date(job.createdAt).getTime() > 3000) {
      await signalRunner(job.jobId);
    }
    return { job };
  });

/** Recovers the newest recent job after a refresh or a lost response. */
export const getLatestGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data: row } = await supabase
      .from("ai_generation_jobs")
      .select("id,status,result,error,generation_id,created_at")
      .eq("user_id", context.userId)
      .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { job: row ? toJob(row as JobRow) : null };
  });

/**
 * Runs the job in a request of its own. The browser calls this without
 * awaiting it, so the generation is not tied to the Generate interaction.
 * Claiming is atomic, so this can never duplicate a provider call.
 */
export const runGenerationJobNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: row } = await supabase
      .from("ai_generation_jobs")
      .select("id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!row) return { ran: false };
    const { executeGenerationJob } = await import("@/lib/generation-jobs.server");
    return await executeGenerationJob(data.jobId);
  });
