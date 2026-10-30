import { atlasHandoffSchema } from "./song-atlas.shared";
import { AI_DISABLED_MESSAGE } from "./global-ai-usage.server";
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
import type { Json } from "@/integrations/supabase/types";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { AI_TARGET_PLATFORMS, DEFAULT_AI_TARGET_PLATFORM } from "@/lib/ai-target-platforms";
import {
  assertGenerationInputLimits,
  assertGenerationRequestBudget,
} from "@/lib/generator-input-limits";
import {
  diffGeneratorSnapshots,
  generatorInputSnapshotSchema,
  revisionJobContextSchema,
} from "@/lib/generator-revision.shared";
import {
  lyricsSectionEditJobSchema,
  lyricsSectionEditOutputSchema,
  lyricsSectionEditRequestSchema,
} from "@/lib/lyrics-workspace.shared";
import { parseLyricsSections } from "@/lib/lyrics-sections";
import { songBlueprintSchema } from "@/lib/song-blueprint.shared";

const jobInput = z.object({
  idempotencyKey: z.string().guid(),
  atlasOrigin: atlasHandoffSchema.optional(),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  theme: z.string().trim().min(3).max(2000),
  genre: z.string().trim().min(1).max(8000),
  mood: z.string().trim().min(1).max(1000),
  language: z.string().trim().min(1).max(80),
  generationModel: z.string().trim().min(1).max(240).nullish(),
  promptVersion: z.enum(["v1", "v2", "v3", "v4_beta", "v5_beta_1"]).default("v1"),
  advanced: z.boolean().default(false),
  baseMusicStyle: z.string().trim().max(4000).default(""),
  instruments: z.string().trim().max(2000).default(""),
  structure: z.string().trim().max(600).default(""),
  songBlueprint: songBlueprintSchema,
  production: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(2000).default(""),
  operation: z.enum(["generate", "revision"]).default("generate"),
  revision: z
    .object({
      projectId: z.string().guid().nullable(),
      basePromptId: z.string().guid(),
      revisionRequest: z.string().trim().min(1).max(3000),
      desiredSnapshot: generatorInputSnapshotSchema,
    })
    .nullish(),
  inputSnapshot: generatorInputSnapshotSchema.nullish(),
});

const revisionMetaShape = z.object({
  savedPromptId: z.string().guid(),
  projectId: z.string().guid(),
  versionNumber: z.number().int().positive(),
  parentPromptId: z.string().guid(),
});

const songResultShape = z.object({
  title: z.string(),
  tags: z.string(),
  lyrics: z.string(),
  note: z.string(),
  revisionMeta: revisionMetaShape.optional(),
});

const sectionEditResultShape = z.object({
  sectionEdit: lyricsSectionEditOutputSchema,
});

const resultShape = z.union([songResultShape, sectionEditResultShape]);

/**
 * The original generation brief, persisted with the job. This is the
 * authoritative recovery source for Quality Check after a refresh or a
 * completely closed browser — never localStorage, never the result text.
 */
const songInputShape = z.object({
  promptVersion: z.enum(["v1", "v2", "v3", "v4_beta", "v5_beta_1"]).default("v1"),
  targetPlatform: z.enum(AI_TARGET_PLATFORMS).default(DEFAULT_AI_TARGET_PLATFORM),
  theme: z.string().default(""),
  genre: z.string().default(""),
  mood: z.string().default(""),
  language: z.string().default(""),
  structure: z.string().default(""),
  songBlueprint: songBlueprintSchema,
  production: z.string().default(""),
  instructions: z.string().default(""),
  operation: z.enum(["generate", "revision"]).default("generate"),
  revision: revisionJobContextSchema.nullish(),
  inputSnapshot: generatorInputSnapshotSchema.nullish(),
});

const inputShape = z.union([songInputShape, lyricsSectionEditJobSchema]);

export type GenerationContext = z.infer<typeof songInputShape>;
export type DurableGenerationJobInput = z.infer<typeof inputShape>;

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
  cancel_requested_at: string | null;
  cancellation_outcome: string | null;
};

export type GenerationJob = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  result: z.infer<typeof resultShape> | null;
  input: DurableGenerationJobInput | null;
  error: string | null;
  generationId: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
  cancelRequestedAt: string | null;
  cancellationOutcome: string | null;
};

const JOB_COLUMNS =
  "id,status,result,input_payload,error,generation_id,provider,model,created_at,cancel_requested_at,cancellation_outcome";

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
    cancelRequestedAt: row.cancel_requested_at,
    cancellationOutcome: row.cancellation_outcome,
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
    assertGenerationRequestBudget(data);
    if (data.atlasOrigin) {
      await requireFeatureAccess(context.supabase, "cultural_song_atlas");
      const { validateAtlasGenerationOrigin } = await import("./song-atlas-generation.server");
      await validateAtlasGenerationOrigin(data.atlasOrigin, context.supabase);
    }
    await requireFeatureAccess(context.supabase, "ai_generator");
    const supabase = context.supabase;
    const { getModelForUser } = await import("@/lib/ai-provider.server");
    const { data: isAdmin } = await supabase.rpc("current_user_is_admin_level");
    assertGenerationInputLimits(data, isAdmin === true);
    // prettier-ignore
    if (data.promptVersion === "v2" || data.promptVersion === "v3" || data.promptVersion === "v4_beta" || data.promptVersion === "v5_beta_1") {
      const { data: isSuperAdmin, error: roleError } = await supabase.rpc(
        "current_user_is_super_admin",
      );
      if (roleError || isSuperAdmin !== true || !data.advanced || data.operation !== "generate" || (data.promptVersion === "v5_beta_1" && data.inputSnapshot?.generatorMode !== "advanced")) {
        throw new Error(
          "Experimental prompt versions are restricted to Super Admin Advanced generation.",
        );
      }
    }
    const selectedModel = await getModelForUser(
      context.userId,
      data.generationModel ?? undefined,
      "generator",
    );

    const {
      idempotencyKey,
      advanced: _advanced,
      baseMusicStyle: _baseMusicStyle,
      instruments: _instruments,
      revision: clientRevision,
      ...basePayload
    } = data;

    let payload: Record<string, unknown> = {
      ...basePayload,
      generationModel: selectedModel,
      operation: "generate",
      revision: null,
    };

    if (data.operation === "revision") {
      if (!clientRevision) throw new Error("Revision context is required.");

      if (clientRevision.projectId) {
        const { data: project, error: projectError } = await supabase
          .from("prompt_projects")
          .select("id")
          .eq("id", clientRevision.projectId)
          .eq("user_id", context.userId)
          .maybeSingle();
        if (projectError) throw new Error(projectError.message);
        if (!project) throw new Error("Project not found.");
      }

      let basePromptQuery = supabase
        .from("saved_prompts")
        .select(
          "id, project_id, version_number, version_label, custom_name, title, theme, genre, mood, language, tags, lyrics, note, generator_input_snapshot",
        )
        .eq("id", clientRevision.basePromptId)
        .eq("user_id", context.userId);
      basePromptQuery = clientRevision.projectId
        ? basePromptQuery.eq("project_id", clientRevision.projectId)
        : basePromptQuery.is("project_id", null);
      const { data: basePrompt, error: baseError } = await basePromptQuery.maybeSingle();
      if (baseError) throw new Error(baseError.message);
      if (!basePrompt) throw new Error("Base version not found.");

      const parsedBaseSnapshot = generatorInputSnapshotSchema.safeParse(
        basePrompt.generator_input_snapshot,
      );
      const desiredSnapshot = generatorInputSnapshotSchema.parse({
        ...clientRevision.desiredSnapshot,
        generatorMode: "revision",
      });
      const revisionContext = revisionJobContextSchema.parse({
        projectId: clientRevision.projectId,
        basePromptId: clientRevision.basePromptId,
        revisionRequest: clientRevision.revisionRequest,
        baseVersion: {
          id: basePrompt.id,
          projectId: basePrompt.project_id,
          versionNumber: basePrompt.version_number,
          versionLabel: basePrompt.version_label,
          customName: basePrompt.custom_name,
          title: basePrompt.title ?? "",
          theme: basePrompt.theme ?? "",
          genre: basePrompt.genre ?? "",
          mood: basePrompt.mood ?? "",
          language: basePrompt.language ?? "",
          tags: basePrompt.tags ?? "",
          lyrics: basePrompt.lyrics ?? "",
          note: basePrompt.note ?? "",
        },
        baseSnapshot: parsedBaseSnapshot.success ? parsedBaseSnapshot.data : null,
        desiredSnapshot,
        changedFields: diffGeneratorSnapshots(
          parsedBaseSnapshot.success ? parsedBaseSnapshot.data : null,
          desiredSnapshot,
        ),
      });

      payload = {
        ...basePayload,
        generationModel: selectedModel,
        operation: "revision",
        revision: revisionContext,
      };
    }

    const { data: raw, error } = await supabase.rpc("start_generation_job", {
      _idempotency_key: idempotencyKey,
      _input: payload as Json,
    });
    if (error?.code === "PT423") throw new Error(AI_DISABLED_MESSAGE);
    if (error) throw new Error(`The generation could not be started (${error.message}).`);
    if (raw && (raw as { rate_limited?: boolean }).rate_limited) {
      return { rateLimited: true as const, job: null };
    }
    const job = toJob(raw as JobRow);
    return { rateLimited: false as const, job };
  });

export const startLyricsSectionEditJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lyricsSectionEditRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "lyrics_workspace");
    const supabase = context.supabase;
    const { getModelForUser } = await import("@/lib/ai-provider.server");
    const selectedModel = await getModelForUser(
      context.userId,
      data.generationModel ?? undefined,
      "generator",
    );

    let authoritative = {
      title: data.title,
      tags: data.tags,
      note: data.note,
      theme: data.theme,
      genre: data.genre,
      mood: data.mood,
      language: data.language,
      targetPlatform: data.targetPlatform,
      generatorInputSnapshot: data.generatorInputSnapshot,
    };

    if (data.projectId || data.basePromptId) {
      if (!data.projectId || !data.basePromptId) {
        throw new Error("Project and base version must be supplied together.");
      }
      const { data: project, error: projectError } = await supabase
        .from("prompt_projects")
        .select("id")
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (projectError) throw new Error(projectError.message);
      if (!project) throw new Error("Project not found.");

      const { data: basePrompt, error: baseError } = await supabase
        .from("saved_prompts")
        .select(
          "id, project_id, title, tags, note, theme, genre, mood, language, generator_input_snapshot",
        )
        .eq("id", data.basePromptId)
        .eq("project_id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (baseError) throw new Error(baseError.message);
      if (!basePrompt) throw new Error("Base version not found.");

      const snapshot = generatorInputSnapshotSchema.safeParse(basePrompt.generator_input_snapshot);
      authoritative = {
        title: basePrompt.title ?? "",
        tags: basePrompt.tags ?? "",
        note: basePrompt.note ?? "",
        theme: basePrompt.theme ?? "",
        genre: basePrompt.genre ?? "",
        mood: basePrompt.mood ?? "",
        language: (basePrompt.language ?? data.language).trim() || data.language,
        targetPlatform: snapshot.success ? snapshot.data.targetPlatform : data.targetPlatform,
        generatorInputSnapshot: snapshot.success ? snapshot.data : null,
      };
    }

    const sections = parseLyricsSections(data.fullLyrics);
    const selected = sections.find((section) => section.key === data.sectionKey);
    if (!selected) throw new Error("The selected lyric section no longer exists.");

    const payload = lyricsSectionEditJobSchema.parse({
      operation: "lyrics_section_edit",
      generationModel: selectedModel,
      sectionEdit: {
        fullLyrics: data.fullLyrics,
        sectionKey: selected.key,
        sectionLabel: selected.label,
        sectionOccurrence: selected.occurrence,
        selectedContent: selected.content,
        action: data.action,
        customInstruction: data.customInstruction,
        ...authoritative,
        projectId: data.projectId ?? null,
        basePromptId: data.basePromptId ?? null,
      },
    });

    const { data: raw, error } = await supabase.rpc("start_generation_job", {
      _idempotency_key: data.idempotencyKey,
      _input: payload as Json,
    });
    if (error?.code === "PT423") throw new Error(AI_DISABLED_MESSAGE);
    if (error) throw new Error(`The section edit could not be started (${error.message}).`);
    if (raw && (raw as { rate_limited?: boolean }).rate_limited) {
      return { rateLimited: true as const, job: null };
    }
    const job = toJob(raw as JobRow);
    if (
      job.input?.operation !== "lyrics_section_edit" ||
      job.input.sectionEdit.sectionKey !== payload.sectionEdit.sectionKey ||
      job.input.sectionEdit.fullLyrics !== payload.sectionEdit.fullLyrics
    ) {
      throw new Error("Another AI action is already in progress. Please wait for it to finish.");
    }
    return { rateLimited: false as const, job };
  });

/** Polls one job. Ownership is enforced by row-level security. */
export const getGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().guid() }).parse(input))
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
    return { job: toJob(row as unknown as JobRow) };
  });

/**
 * Recovers the newest active job after a refresh or a lost response.
 * Completed jobs are recovered by their remembered job id, which prevents an
 * older completed result from interrupting a new pre-generation planning step.
 * Dismissed jobs are never resurrected.
 */
export const getLatestGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const { data: rows } = await supabase
      .from("ai_generation_jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .in("status", ["pending", "processing"])
      .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    const row = ((rows ?? []) as unknown as JobRow[]).find((candidate) => {
      const parsed = inputShape.safeParse(candidate.input_payload);
      return parsed.success && parsed.data.operation !== "lyrics_section_edit";
    });
    return { job: row ? toJob(row) : null };
  });

export const getLatestLyricsSectionEditJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("ai_generation_jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", context.userId)
      .is("dismissed_at", null)
      .in("status", ["pending", "processing", "completed"])
      .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    const row = ((rows ?? []) as unknown as JobRow[]).find((candidate) => {
      const parsed = inputShape.safeParse(candidate.input_payload);
      return parsed.success && parsed.data.operation === "lyrics_section_edit";
    });
    return { job: row ? toJob(row) : null };
  });

/**
 * Forgets a job (Clear / dismiss). A pending job is cancelled so the runner
 * skips it; a job already claimed keeps running to completion but will never
 * be shown again. No creation is refunded and none is consumed.
 */
export const dismissGenerationJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().guid() }).parse(input))
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

/**
 * Requests real interruption of a generation job.
 * Unlike dismissGenerationJob, processing work is not merely hidden: the
 * runner observes the persisted flag and interrupts its provider transport.
 * Provider-side savings must not be assumed from this response alone.
 */
export const requestGenerationJobCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    // The RPC is introduced in this PR's migration; generated Supabase types
    // will be refreshed during the normal schema-type generation workflow.
    // Keep the RPC method bound to its Supabase client. Detaching this.rpc
    // loses the PostgREST client's internal context before any HTTP request.
    const rpcClient = context.supabase as unknown as {
      rpc: (
        name: "request_generation_job_cancellation",
        args: { _job_id: string },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data: result, error } = await rpcClient.rpc("request_generation_job_cancellation", {
      _job_id: data.jobId,
    });
    const parsed = z
      .enum(["REQUESTED", "ALREADY_REQUESTED", "CANCELLED_BEFORE_START", "ALREADY_FINAL"])
      .safeParse(result);
    if (error || !parsed.success)
      throw new Error("The generation cancellation request could not be saved.");
    if (parsed.data === "REQUESTED" || parsed.data === "ALREADY_REQUESTED") {
      // The remote operation may outlive the original worker. Cancel it through
      // the provider as well, using server-only credentials and ownership check.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: job } = await supabaseAdmin
        .from("ai_generation_jobs")
        .select("cancellation_remote_provider,cancellation_remote_id")
        .eq("id", data.jobId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (job) {
        const { cancelPersistedBackgroundOperation } =
          await import("@/lib/cancel-persisted-ai-operation.server");
        const outcome = await cancelPersistedBackgroundOperation(
          (job as any).cancellation_remote_provider,
          (job as any).cancellation_remote_id,
        );
        if (outcome === "cancelled_upstream_confirmed") {
          await (supabaseAdmin as any)
            .from("ai_generation_jobs")
            .update({
              status: "cancelled",
              cancellation_outcome: "cancelled_upstream_confirmed",
              result: null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", data.jobId)
            .eq("user_id", context.userId)
            .eq("status", "processing")
            .not("cancel_requested_at", "is", null);
        }
      }
    }
    return { outcome: parsed.data };
  });
