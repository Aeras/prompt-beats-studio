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
import { AiProviderHttpError } from "@/lib/ai-provider.server";
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
  if (err instanceof AiProviderHttpError) {
    return `The AI provider rejected this request (HTTP ${err.httpStatus}). Please try another model or contact support.`;
  }
  const raw = err instanceof Error ? err.message : "The generation failed.";
  if (raw === "The AI response was incomplete. Please try again.") return raw;
  if (raw === "The AI returned an incomplete or invalid response. Please try again.") return raw;
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
    const input = durableAiJobInput.parse(job.input_payload);
    const { data: marked, error: markerError } = await db
      .from("ai_generation_jobs")
      .update({ provider_started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "processing")
      .is("provider_started_at", null)
      .select("id")
      .maybeSingle();
    if (markerError || !marked)
      throw new Error("The generation could not be started. Please try again.");

    if (input.operation === "lyrics_section_edit") {
      const out = await runLyricsSectionEdit(input, job.user_id, job.generation_id);
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
        .eq("status", "processing");
      return { ran: true };
    }

    // The large shared Generator prompt remains untouched. For normal Advanced
    // Suno creations only, add one internal runtime instruction through the
    // existing Additional Instructions channel so the same provider call is
    // explicitly told to enrich Music Style from useful Producer's Note cues.
    const runtimeInput = withAdvancedSunoEnrichmentInstruction(input);
    const out = await runSongGeneration(runtimeInput, job.user_id, job.generation_id);
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

    let persistedResult: Record<string, unknown> = songResult;

    if (input.operation === "revision" && input.revision) {
      const revision = input.revision;
      const versionChangeMetadata = buildProjectRevisionVersionMetadata({
        revisionRequest: revision.revisionRequest,
        baseSnapshot: revision.baseSnapshot,
        desiredSnapshot: revision.desiredSnapshot,
        beforeLyrics: revision.baseVersion.lyrics,
        afterLyrics: out.result.lyrics,
      });

      if (!revision.projectId) {
        const { data: replaced, error: replaceError } = await db
          .from("saved_prompts")
          .update({
            title: out.result.title,
            tags: out.result.tags,
            lyrics: out.result.lyrics,
            note: out.result.note,
            theme: input.theme,
            genre: input.genre,
            mood: input.mood,
            language: input.language,
            generator_input_snapshot: revision.desiredSnapshot,
            revision_request: revision.revisionRequest,
            version_change_metadata: versionChangeMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", revision.basePromptId)
          .eq("user_id", job.user_id)
          .is("project_id", null)
          .select("id")
          .maybeSingle();
        if (replaceError || !replaced) {
          console.error(
            "[generation-job] standalone revision replace failed",
            job.id,
            replaceError?.message,
          );
          throw new Error("The standalone Prompt could not be replaced.");
        }
        persistedResult = out.result;
      } else {
        const { data: saved, error: saveError } = await db.rpc("create_prompt_revision_version", {
          _user_id: job.user_id,
          _job_id: job.id,
          _project_id: revision.projectId,
          _parent_prompt_id: revision.basePromptId,
          _revision_request: revision.revisionRequest,
          _generator_input_snapshot: revision.desiredSnapshot,
          _version_change_metadata: versionChangeMetadata,
          _title: out.result.title,
          _tags: out.result.tags,
          _lyrics: out.result.lyrics,
          _note: out.result.note,
          _theme: input.theme,
          _genre: input.genre,
          _mood: input.mood,
          _language: input.language,
        });
        if (saveError) {
          console.error("[generation-job] revision save failed", job.id, saveError.message);
          throw new Error("The revision version could not be saved.");
        }
        const meta = saved as {
          id?: string;
          project_id?: string;
          version_number?: number;
          parent_prompt_id?: string;
        } | null;
        if (!meta?.id || !meta.project_id || !meta.version_number || !meta.parent_prompt_id) {
          throw new Error("The revision version could not be saved.");
        }
        persistedResult = {
          ...out.result,
          revisionMeta: {
            savedPromptId: meta.id,
            projectId: meta.project_id,
            versionNumber: meta.version_number,
            parentPromptId: meta.parent_prompt_id,
          },
        };
      }
    }

    await db
      .from("ai_generation_jobs")
      .update({
        status: "completed",
        result: persistedResult,
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
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

// The start signal is issued by the database itself (pg_net, from
// `public.kick_generation_runner`), never by a browser-initiated request, so a
// generation's lifetime is fully independent of the client connection.
