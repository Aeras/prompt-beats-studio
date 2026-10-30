import { AI_DISABLED_MESSAGE, AI_UNAVAILABLE_MESSAGE } from "./global-ai-usage.server";
import { safeErrorType } from "@/lib/safe-diagnostics";
import { assertGenerationRequestBudget } from "@/lib/generator-input-limits";
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
 * - A claimed job is never re-claimed after the provider-start marker is set,
 *   so a retry can never duplicate a paid provider call. Only claims that
 *   never reached the provider are safely reaped.
 * - Only the service-role client (server-only) writes job state.
 */
import { durableAiJobInput, runLyricsSectionEdit, runSongGeneration } from "@/lib/ai.functions";
import { withAdvancedSunoEnrichmentInstruction } from "@/lib/advanced-suno-enrichment";
import { fitMusicStyleToPlatform } from "@/lib/music-style-limits";
import { buildProjectRevisionVersionMetadata } from "@/lib/project-version-history.shared";

/** Pre-provider claims are safe to reclaim after this shorter timeout. */
const STALE_UNSTARTED_MS = 15 * 60 * 1000;

type AdminClient = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "The generation failed.";
  if (raw === AI_DISABLED_MESSAGE || raw === AI_UNAVAILABLE_MESSAGE) return raw;
  if (raw === "The AI response was incomplete. Please try again.") return raw;
  if (raw === "The AI returned an incomplete or invalid response. Please try again.") return raw;
  if (raw === "The AI provider rate limit was reached. Please try later.") return raw;
  if (raw === "The AI provider rejected the request parameters. Please contact support.")
    return raw;
  if (raw === "The AI provider authentication was rejected. Please contact support.") return raw;
  if (raw === "The account is no longer available.") return raw;
  if (raw === "This account is not allowed to use AI services.") return raw;
  return "The AI provider is temporarily unavailable. Please try again later.";
}

/**
 * Executes one generation job. Idempotent: returns immediately when the job is
 * not in `pending` (already claimed, completed or failed).
 */
export async function executeGenerationJob(jobId: string): Promise<{ ran: boolean }> {
  const db = await admin();
  let { data: claimed } = await db
    .from("ai_generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  let recovering = false;
  if (!claimed) {
    const { claimRecoveredJob } = await import("./ai-execution.server");
    claimed = await claimRecoveredJob("generate", jobId);
    recovering = !!claimed;
  }
  if (!claimed) return { ran: false };

  const job = claimed as {
    id: string;
    user_id: string;
    generation_id: string | null;
    input_payload: unknown;
    attempts: number;
  };
  const executionContext = {
    userId: job.user_id,
    operation: "generate" as const,
    generationId: job.generation_id,
    jobId: job.id,
    recoveryOnly: recovering,
  };

  // Database-backed cancellation works across server instances. The watcher
  // signals the in-flight transport, but a socket abort is NOT necessarily an
  // authoritative upstream cancellation.
  const cancellationController = new AbortController();
  let upstreamCancellationOutcome: string | null = null;
  const recordRemoteOperation = async (provider: "openai" | "gemini", remoteId: string) => {
    const { error } = await db
      .from("ai_generation_jobs")
      .update({ cancellation_remote_id: remoteId, cancellation_remote_provider: provider })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw new Error("Could not persist cancellation remote operation ID.");
  };
  const recordUpstreamCancellation = async (outcome: string) => {
    upstreamCancellationOutcome =
      outcome === "cancelled_upstream_confirmed"
        ? "cancelled_upstream_confirmed"
        : "connection_aborted_unconfirmed";
  };
  let cancellationCheckInFlight = false;
  const checkCancellation = async () => {
    if (cancellationCheckInFlight || cancellationController.signal.aborted) return;
    cancellationCheckInFlight = true;
    try {
      const { data } = await db
        .from("ai_generation_jobs")
        .select("cancel_requested_at")
        .eq("id", job.id)
        .maybeSingle();
      if ((data as { cancel_requested_at?: string | null } | null)?.cancel_requested_at)
        cancellationController.abort(new Error("Generation cancellation requested."));
    } catch {
      // A polling error must never turn into a false cancellation success.
    } finally {
      cancellationCheckInFlight = false;
    }
  };
  const cancellationTimer = setInterval(() => {
    void checkCancellation();
  }, 750);
  try {
    assertGenerationRequestBudget(job.input_payload);
    const input = durableAiJobInput.parse(job.input_payload);
    // Defense in depth: durable jobs can also be created via the raw RPC.
    // Re-verify the existing Super Admin + Advanced new-song restriction
    // for all experimental prompt versions before any provider call.
    if (
      input.operation !== "lyrics_section_edit" &&
      (input.promptVersion === "v2" ||
        input.promptVersion === "v3" ||
        input.promptVersion === "v4_beta" ||
        input.promptVersion === "v5_beta_1")
    ) {
      const { data: isSuperAdmin, error: roleError } = await db.rpc("_has_role_internal", {
        _user_id: job.user_id,
        _role: "super_admin",
      });
      if (
        roleError ||
        isSuperAdmin !== true ||
        input.operation !== "generate" ||
        input.inputSnapshot?.generatorMode !== "advanced"
      ) {
        throw new Error(
          "Experimental prompt versions are restricted to Super Admin Advanced generation.",
        );
      }
    }
    const { data: marked, error: markerError } = recovering
      ? { data: { id: job.id }, error: null }
      : await db
          .from("ai_generation_jobs")
          .update({ provider_started_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("status", "processing")
          .is("provider_started_at", null)
          .is("cancel_requested_at", null)
          .select("id")
          .maybeSingle();
    if (markerError || !marked)
      throw new Error("The generation could not be started. Please try again.");

    if (input.operation === "lyrics_section_edit") {
      const out = await runLyricsSectionEdit(
        input,
        job.user_id,
        job.generation_id,
        cancellationController.signal,
        recordUpstreamCancellation,
        recordRemoteOperation,
        executionContext,
      );
      await db
        .from("ai_generation_jobs")
        .update({
          status: "completed",
          result: { sectionEdit: out.result },
          provider: out.provider,
          model: out.model,
          error: null,
          attempts: (job.attempts ?? 0) + 1,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .is("cancel_requested_at", null);
      // A cancellation arriving between provider completion and the guarded
      // result write must not strand a section-edit job in processing.
      await db
        .from("ai_generation_jobs")
        .update({
          status: "cancelled",
          cancellation_outcome: upstreamCancellationOutcome ?? "connection_aborted_unconfirmed",
          result: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .not("cancel_requested_at", "is", null);
      return { ran: true };
    }

    // The large shared Generator prompt remains untouched. For normal Advanced
    // Suno creations only, add one internal runtime instruction through the
    // existing Additional Instructions channel so the same provider call is
    // explicitly told to enrich Music Style from useful Producer's Note cues.
    const runtimeInput = withAdvancedSunoEnrichmentInstruction(input);
    const out = await runSongGeneration(
      runtimeInput,
      job.user_id,
      job.generation_id,
      cancellationController.signal,
      recordUpstreamCancellation,
      recordRemoteOperation,
      executionContext,
    );
    const enforceAdvancedSunoStyleLimit =
      input.operation === "generate" &&
      input.targetPlatform === "suno" &&
      input.inputSnapshot?.generatorMode === "advanced";
    const fittedTags = enforceAdvancedSunoStyleLimit
      ? fitMusicStyleToPlatform(out.result.tags, input.targetPlatform)
      : out.result.tags;
    const songResult =
      fittedTags === out.result.tags ? out.result : { ...out.result, tags: fittedTags };

    if (fittedTags.length !== out.result.tags.length) {
      console.warn("[generation-job] Suno Advanced Music Style capped", {
        jobId: job.id,
        before: out.result.tags.length,
        after: fittedTags.length,
      });
    }

    // Revision persistence and job completion must share one database transaction.
    // The RPC locks the job row, so cancellation cannot interleave between a
    // saved-prompt write and the completed status transition.
    if (input.operation === "revision" && input.revision) {
      await checkCancellation();
      if (cancellationController.signal.aborted)
        throw new Error("Generation cancellation requested.");

      const revision = input.revision;
      const versionChangeMetadata = buildProjectRevisionVersionMetadata({
        revisionRequest: revision.revisionRequest,
        baseSnapshot: revision.baseSnapshot,
        desiredSnapshot: revision.desiredSnapshot,
        beforeLyrics: revision.baseVersion.lyrics,
        afterLyrics: out.result.lyrics,
      });
      const { data: finalized, error: finalizeError } = await db.rpc(
        "finalize_generation_revision_atomic",
        {
          _job_id: job.id,
          _user_id: job.user_id,
          _project_id: revision.projectId,
          _parent_prompt_id: revision.basePromptId,
          _revision_request: revision.revisionRequest,
          _snapshot: revision.desiredSnapshot,
          _metadata: versionChangeMetadata,
          _title: out.result.title,
          _tags: out.result.tags,
          _lyrics: out.result.lyrics,
          _note: out.result.note,
          _theme: input.theme,
          _genre: input.genre,
          _mood: input.mood,
          _language: input.language,
          _provider: out.provider,
          _model: out.model,
          _result: songResult,
          _attempts: (job.attempts ?? 0) + 1,
        },
      );
      if (finalizeError || !finalized) {
        throw new Error("The revision could not be finalized.");
      }
    } else {
      await checkCancellation();
      if (cancellationController.signal.aborted)
        throw new Error("Generation cancellation requested.");
      await db
        .from("ai_generation_jobs")
        .update({
          status: "completed",
          result: songResult,
          provider: out.provider,
          model: out.model,
          error: null,
          attempts: (job.attempts ?? 0) + 1,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .is("cancel_requested_at", null);
    }
  } catch (err) {
    // Resolve a cancellation/marker race even if the periodic poll has not yet
    // observed the user request. A failed provider-start marker can mean that
    // cancellation won the database race.
    await checkCancellation();
    if (!cancellationController.signal.aborted)
      console.error("[generation-job] failed", {
        jobId: job.id,
        errorType: safeErrorType(err),
      });
    await db
      .from("ai_generation_jobs")
      .update({
        status: cancellationController.signal.aborted ? "cancelled" : "failed",
        ...(cancellationController.signal.aborted
          ? {
              cancellation_outcome: upstreamCancellationOutcome ?? "connection_aborted_unconfirmed",
            }
          : {}),
        error: safeErrorMessage(err),
        attempts: (job.attempts ?? 0) + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    try {
      const { reconcileFailedGeneration } = await import("./generation-reconciliation.server");
      await reconcileFailedGeneration(job.id, job.user_id);
    } catch {
      // Keep the recovery/accounting guard; retry reconciliation without AI dispatch.
      console.warn("[generation-job] reconciliation pending", { jobId: job.id });
    }
  } finally {
    clearInterval(cancellationTimer);
  }

  // A completed provider call can race a user cancellation. Never publish a
  // normal result when cancellation was recorded while the call was active.
  await db
    .from("ai_generation_jobs")
    .update({
      status: "cancelled",
      cancellation_outcome: upstreamCancellationOutcome ?? "connection_aborted_unconfirmed",
      result: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .not("cancel_requested_at", "is", null);

  return { ran: true };
}

/**
 * Automatically reclaims only jobs that never reached the provider-execution
 * commit marker. Provider-committed work is intentionally excluded: its
 * operational reconciliation requires worker/process termination to be
 * established before the service-only reconciliation function is used.
 */
export async function reapStaleJobs(): Promise<number> {
  const db = await admin();
  const cutoff = new Date(Date.now() - STALE_UNSTARTED_MS).toISOString();
  const { data } = await db
    .from("ai_generation_jobs")
    .update({
      status: "failed",
      error: "The generation could not be started. Please try again.",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .is("provider_started_at", null)
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
  const { data: recovery } = await db.rpc("recoverable_ai_job_ids_internal", {
    _kind: "generate",
    _limit: limit,
  });
  return [
    ...new Set([
      ...((data as { id: string }[] | null) ?? []).map((r) => r.id),
      ...((recovery as string[] | null) ?? []),
    ]),
  ].slice(0, limit);
}

// The start signal is issued by the database itself (pg_net, from
// `public.kick_generation_runner`), never by a browser-initiated request, so a
// generation's lifetime is fully independent of the client connection.
