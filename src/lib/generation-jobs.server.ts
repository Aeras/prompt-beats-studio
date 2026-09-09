/**
 * Durable execution layer for song generation.
 *
 * A generation job lives in `public.ai_generation_jobs`. The provider call
 * happens here, in a request that is NOT the browser's Generate request, so a
 * mobile disconnect, backgrounding or refresh can never lose the generation.
 *
 * Safety rules implemented here:
 * - The provider is called at most once per job: a job is claimed with a
 *   conditional `pending -> processing` update, which is atomic in Postgres.
 * - A claimed job is never re-claimed, so a retry can never duplicate a paid
 *   provider call. Jobs stuck in `processing` are reaped as `failed`.
 * - Only the service-role client (server-only) writes job state.
 */
import { runSongGeneration, generateJobInput } from "@/lib/ai.functions";

/** A processing job older than this is considered lost infrastructure-wise. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;

type AdminClient = { from: (t: string) => any };

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "The generation failed.";
  // Never leak provider credentials or internal endpoints to the client.
  return raw.replace(/[A-Za-z0-9_-]{24,}/g, "***").slice(0, 400);
}

/**
 * Executes one generation job. Idempotent: returns immediately when the job is
 * not in `pending` (already claimed, completed or failed).
 */
export async function executeGenerationJob(jobId: string): Promise<{ ran: boolean }> {
  const db = await admin();
  const { data: claimed } = await db
    .from("ai_generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (!claimed) return { ran: false };

  const job = claimed as {
    id: string;
    user_id: string;
    generation_id: string | null;
    input_payload: unknown;
    attempts: number;
  };

  try {
    const input = generateJobInput.parse(job.input_payload);
    const out = await runSongGeneration(input, job.user_id, job.generation_id);
    await db
      .from("ai_generation_jobs")
      .update({
        status: "completed",
        result: out.result,
        provider: out.provider,
        model: out.model,
        error: null,
        attempts: (job.attempts ?? 0) + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
  } catch (err) {
    console.error("[generation-job] failed", job.id, err);
    await db
      .from("ai_generation_jobs")
      .update({
        status: "failed",
        error: safeErrorMessage(err),
        attempts: (job.attempts ?? 0) + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
  }

  return { ran: true };
}

/**
 * Marks jobs that were claimed but never finished (worker eviction, timeout) as
 * failed. It never re-issues a provider call for them: that could duplicate a
 * paid generation. The user retries explicitly instead.
 */
export async function reapStaleJobs(): Promise<number> {
  const db = await admin();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data } = await db
    .from("ai_generation_jobs")
    .update({
      status: "failed",
      error: "The generation did not finish in time. Please try again.",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("started_at", cutoff)
    .select("id");
  return (data as { id: string }[] | null)?.length ?? 0;
}

/** Job ids still waiting for a worker (safe to (re)start — nothing was called yet). */
export async function pendingJobIds(limit = 5): Promise<string[]> {
  const db = await admin();
  const { data } = await db
    .from("ai_generation_jobs")
    .select("id")
    .eq("status", "pending")
    .is("dismissed_at", null)
    .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

// The start signal is issued by the database itself (pg_net, from
// `public.kick_generation_runner`), never by a browser-initiated request, so a
// generation's lifetime is fully independent of the client connection.
