import {
  INSPIRATION_PLANNER,
  requireInspirationPlanner,
  requestInspirationPlan,
  parseInspirationPlannerReceipt,
} from "./music-inspiration-planner.server";
import { validateInspirationPlan, type InspirationPlan } from "./music-inspiration-planner.shared";
import {
  InspirationFailure,
  inspirationDiagnostic,
  encodeInspirationDiagnostic,
  logInspirationFailure,
  type InspirationStage,
  type InspirationDiagnostic,
} from "./music-inspiration-diagnostics.shared";
import { createHash } from "node:crypto";
import { z } from "zod";
import { inspirationRequestSchema } from "./music-inspiration.shared";
import {
  INSPIRATION_LIMITS,
  approvedAtlasEvidence,
  inspirationQueries,
  searchInspirationWeb,
  synthesizeMusicInspiration,
  type RetrievedInspirationDocument,
} from "./music-inspiration-research.server";
import type { ModelResult } from "./ai-provider.server";

type Database = {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: unknown }>;
};
const stableId = (job: string, stage: string) => {
  const h = createHash("sha256")
    .update(job + ":" + stage)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function database(): Promise<Database> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Database;
}
export type InspirationJobDependencies = {
  db?: Database;
  atlas?: typeof approvedAtlasEvidence;
  search?: typeof searchInspirationWeb;
  synthesize?: typeof synthesizeMusicInspiration;
  clock?: () => number;
  authorizePlanner?: typeof requireInspirationPlanner;
  plan?: typeof requestInspirationPlan;
  caller?: (
    model: string,
    provider: string,
    userId: string,
    executionId: string,
  ) => (input: import("./ai-provider.server").ModelCall) => Promise<ModelResult>;
  authorizeModel?: (userId: string, model: string) => Promise<void>;
  admitDispatch?: () => Promise<void>;
  record?: (job: any, receipt: ModelResult) => Promise<void>;
};
async function authorizeModel(userId: string, selected: string) {
  const { resolveAiModelForUser } = await import("./ai-provider.server");
  const { getRegistryModel } = await import("./ai-model-registry.server");
  const resolved = await resolveAiModelForUser(userId, "generator", selected);
  const row = await getRegistryModel(selected);
  if (!row?.id || row.status !== "enabled" || resolved.model !== selected)
    throw new Error("model_unavailable");
}
async function record(job: any, receipt: ModelResult) {
  const { recordAiUsage } = await import("./ai-usage.server");
  await recordAiUsage({
    executionId: job.execution_id,
    userId: job.user_id,
    provider: receipt.provider,
    model: receipt.model,
    operation: "music_inspiration",
    usage: receipt.usage,
    usageState: receipt.usage ? "final" : "unknown",
    success: receipt.stopReason === "end_turn",
  });
}
/** Lease + per-dispatch durable reservation. Unknown outcomes never automatically redispatch. */
export async function executeMusicInspirationJob(
  id: string,
  deps: InspirationJobDependencies = {},
): Promise<{ ran: boolean }> {
  z.string().uuid().parse(id);
  const db = deps.db ?? (await database());
  const token = crypto.randomUUID();
  let stage: InspirationStage = "claim";
  let pollFailure: InspirationDiagnostic | null = null;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const reply = await db.rpc(name, args);
    if (reply.error)
      throw new InspirationFailure(
        {
          ...inspirationDiagnostic(
            reply.error,
            name === "checkpoint_music_inspiration_job" && stage !== "result_persist"
              ? "job_persist"
              : stage,
          ),
          code: "database",
        },
        "inspiration_persistence_failed",
      );
    return reply.data;
  };
  let job: any;
  try {
    job = await rpc("claim_music_inspiration_job_v2", { _job_id: id, _lease_token: token });
  } catch (error) {
    logInspirationFailure(id, inspirationDiagnostic(error, "claim"));
    throw error;
  }
  if (!job) return { ran: false };
  const patch = (value: Record<string, unknown>) =>
    rpc("checkpoint_music_inspiration_job", { _job_id: id, _lease_token: token, _patch: value });
  const controller = new AbortController();
  let checking = false;
  const poll = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const reply = await db
        .from("music_inspiration_jobs")
        .select("cancel_requested_at,status")
        .eq("id", id)
        .eq("user_id", job.user_id)
        .maybeSingle();
      if (reply.error || !reply.data)
        pollFailure = { ...inspirationDiagnostic(reply.error, "job_persist"), code: "database" };
      if (
        reply.error ||
        !reply.data ||
        reply.data.cancel_requested_at ||
        reply.data.status === "cancelled"
      )
        controller.abort();
    } catch (error) {
      pollFailure = { ...inspirationDiagnostic(error, "job_persist"), code: "database" };
      controller.abort();
    } finally {
      checking = false;
    }
  };
  const interval = setInterval(() => void poll(), 1500);
  let uncertain = false;
  try {
    stage = "admission";
    const request = inspirationRequestSchema.parse(job.request);
    const limits = INSPIRATION_LIMITS[request.depth];
    const elapsed =
      (deps.clock ?? Date.now)() - Date.parse(job.research_started_at ?? job.created_at);
    let signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, limits.timeoutMs - Math.max(0, elapsed))),
    ]);
    await poll();
    stage = "sources";
    const documents: RetrievedInspirationDocument[] = await (deps.atlas ?? approvedAtlasEvidence)(
      request,
    );
    const dispatchesReply = await db
      .from("music_inspiration_dispatches")
      .select("*")
      .eq("job_id", id);
    if (dispatchesReply.error)
      throw new InspirationFailure(
        {
          ...inspirationDiagnostic(dispatchesReply.error, "recovery"),
          stage: "recovery",
          code: "database",
        },
        "inspiration_persistence_failed",
      );
    const dispatches = dispatchesReply.data ?? [];
    const journalReply = await db
      .from("ai_provider_executions")
      .select("result,observed_usage,state")
      .eq("id", job.execution_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (journalReply.error) throw new Error("inspiration_persistence_failed");
    const savedReceipt: ModelResult | null =
      journalReply.data?.result ?? job.provider_result ?? null;
    const plannerJournal =
      job.research_version === 2
        ? await db
            .from("ai_provider_executions")
            .select("result,state")
            .eq("id", job.planner_execution_id)
            .eq("user_id", job.user_id)
            .maybeSingle()
        : { data: null, error: null };
    if (plannerJournal.error)
      throw new InspirationFailure({
        ...inspirationDiagnostic(plannerJournal.error, "planner_persist"),
        code: "database",
      });
    const savedPlannerReceipt: ModelResult | null =
      plannerJournal.data?.result ?? job.planner_result ?? null;
    uncertain =
      dispatches.some((d: any) => d.state !== "observed") ||
      (!!journalReply.data && !savedReceipt) ||
      (!!plannerJournal.data && !savedPlannerReceipt);
    const dispatchDeadline =
      Date.parse(job.research_started_at ?? job.created_at) + limits.timeoutMs;
    // Recovery is bounded validation, not a fresh research budget. An old job
    // may still finalize an already obtained response after its dispatch window.
    if (savedReceipt || savedPlannerReceipt)
      signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    signal.throwIfAborted();
    if (!savedReceipt && (deps.clock ?? Date.now)() - Date.parse(job.created_at) > 30 * 60 * 1000)
      throw new Error("research_queue_expired");
    const admit =
      deps.admitDispatch ?? (await import("./global-ai-usage.server")).requireGlobalAiUsage;
    const reserve = async (key: string, kind: string, cost: number, credits: number) => {
      signal.throwIfAborted();
      if ((deps.clock ?? Date.now)() >= dispatchDeadline)
        throw new InspirationFailure(
          {
            stage:
              kind === "planner"
                ? "planner_request"
                : kind === "search"
                  ? "search_request"
                  : "ai_request",
            code: "timeout",
          },
          "research_dispatch_window_expired",
        );
      // A result-only recovery window must never extend a new paid dispatch deadline.
      signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(Math.max(1, dispatchDeadline - (deps.clock ?? Date.now)())),
      ]);
      stage = "authorization";
      await (deps.authorizeModel ?? authorizeModel)(job.user_id, job.model);
      if (job.research_version === 2)
        await (deps.authorizePlanner ?? requireInspirationPlanner)(job.user_id);
      await admit();
      return rpc("reserve_music_inspiration_dispatch", {
        _job_id: id,
        _lease_token: token,
        _dispatch_key: key,
        _kind: kind,
        _max_cost: cost,
        _max_credits: credits,
      });
    };
    const settle = (key: string, state: string, receipt: unknown) =>
      rpc("settle_music_inspiration_dispatch", {
        _job_id: id,
        _dispatch_key: key,
        _state: state,
        _receipt: receipt,
      });
    let researchPlan: InspirationPlan | undefined;
    let queries = job.research_version === 2 ? [] : inspirationQueries(request); // Version-1 recovery only.
    if (job.research_version === 2) {
      if (
        job.planner_provider !== INSPIRATION_PLANNER.provider ||
        job.planner_model !== INSPIRATION_PLANNER.model ||
        !job.planner_execution_id ||
        job.planner_execution_id === job.execution_id
      )
        throw new InspirationFailure({ stage: "planner_request", code: "configuration" });
      stage = "planner_request";
      const plannerDispatch = dispatches.find((d: any) => d.kind === "planner");
      let plannerReceipt = savedPlannerReceipt;
      if (!plannerReceipt) {
        if (plannerDispatch || plannerJournal.data) {
          uncertain = true;
          throw new InspirationFailure({ stage: "planner_request", code: "unknown_outcome" });
        }
        await (deps.authorizePlanner ?? requireInspirationPlanner)(job.user_id);
        if (!(await reserve(job.planner_execution_id, "planner", 0, 0))) {
          uncertain = true;
          throw new InspirationFailure({ stage: "planner_request", code: "unknown_outcome" });
        }
        uncertain = true;
        const caller = deps.caller
          ? deps.caller(
              job.planner_model,
              job.planner_provider,
              job.user_id,
              job.planner_execution_id,
            )
          : (await import("./ai-provider.server")).modelCaller(
              job.planner_model,
              job.planner_provider,
              {
                userId: job.user_id,
                operation: "music_inspiration",
                executionId: job.planner_execution_id,
              },
            );
        stage = "planner_request";
        plannerReceipt = await (deps.plan ?? requestInspirationPlan)(request, caller, signal);
      }
      // Record raw usage/evidence before application validation or cancellation can discard it.
      uncertain = true;
      if (
        plannerReceipt.provider !== job.planner_provider ||
        plannerReceipt.model !== job.planner_model
      )
        throw new InspirationFailure({
          stage: "planner_schema",
          code: "request_mismatch",
          field: plannerReceipt.provider !== job.planner_provider ? "provider" : "model",
        });
      await (deps.record ?? record)(
        { ...job, execution_id: job.planner_execution_id },
        plannerReceipt,
      );
      await settle(job.planner_execution_id, "observed", {
        executionId: job.planner_execution_id,
        provider_result: plannerReceipt,
      });
      uncertain = false;
      researchPlan = parseInspirationPlannerReceipt(plannerReceipt, request);
      if (job.research_plan) {
        const storedPlan = validateInspirationPlan(job.research_plan, request);
        if (JSON.stringify(storedPlan) !== JSON.stringify(researchPlan))
          throw new InspirationFailure({
            stage: "planner_schema",
            code: "request_mismatch",
            field: "request",
          });
      } else {
        stage = "planner_persist";
        uncertain = true;
        signal.throwIfAborted();
        await rpc("checkpoint_music_inspiration_plan", {
          _job_id: id,
          _lease_token: token,
          _plan: researchPlan,
        });
        uncertain = false;
      }
      queries = researchPlan.queries.map((q) => q.text);
    }
    for (const [index, query] of queries.entries()) {
      const key = stableId(id, "search:" + index);
      const existing = dispatches.find((d: any) => d.dispatch_key === key);
      if (existing?.state === "observed" && existing.receipt?.documents) {
        documents.push(...existing.receipt.documents);
        continue;
      }
      if (existing || savedReceipt) {
        uncertain = true;
        throw new Error("provider_outcome_unknown");
      }
      if (!(await reserve(key, "search", 0, 1))) {
        uncertain = true;
        throw new Error("provider_outcome_unknown");
      }
      uncertain = true;
      try {
        stage = "search_request";
        const found = await (deps.search ?? searchInspirationWeb)(query, signal);
        stage = "search_persist";
        // Preserve observed consumption and source evidence before checking cancellation.
        await settle(key, "observed", found);
        uncertain = false;
        documents.push(...found.documents);
      } catch (error) {
        const diagnostic = inspirationDiagnostic(error, stage);
        try {
          await settle(key, "unknown", { outcome: "unknown", diagnostic });
        } catch (secondary) {
          logInspirationFailure(id, inspirationDiagnostic(secondary, "search_persist"));
        }
        throw error;
      }
    }
    signal.throwIfAborted();
    let receipt: ModelResult;
    if (savedReceipt) {
      receipt = savedReceipt;
      stage = "usage_persist";
      await (deps.record ?? record)(job, receipt);
      await settle(job.execution_id, "observed", { executionId: job.execution_id });
    } else {
      if (journalReply.data || dispatches.some((d: any) => d.kind === "ai")) {
        uncertain = true;
        throw new Error("provider_outcome_unknown");
      }
      if (!documents.length)
        throw new InspirationFailure(
          { stage: "sources", code: "no_evidence" },
          "no_accessible_evidence",
        );
      if (!(await reserve(job.execution_id, "ai", 0, 0))) {
        uncertain = true;
        throw new Error("provider_outcome_unknown");
      }
      uncertain = true;
      const caller = deps.caller
        ? deps.caller(job.model, job.provider, job.user_id, job.execution_id)
        : (await import("./ai-provider.server")).modelCaller(job.model, job.provider, {
            userId: job.user_id,
            operation: "music_inspiration",
            executionId: job.execution_id,
          });
      // The tracked caller checkpoints raw result and usage even if parsing below fails.
      stage = "ai_request";
      const compiled = await (deps.synthesize ?? synthesizeMusicInspiration)(
        request,
        documents,
        caller,
        signal,
        researchPlan,
      );
      receipt = compiled.receipt;
      stage = "result_persist";
      await settle(job.execution_id, "observed", { executionId: job.execution_id });
      await patch({ provider_result: receipt });
      uncertain = false;
      signal.throwIfAborted();
      await patch({ result: compiled.result, status: "completed", error_code: null });
      return { ran: true };
    }
    // Stored response can be validated/finalized without a second provider call.
    stage = "ai_parse";
    const compiled = await (deps.synthesize ?? synthesizeMusicInspiration)(
      request,
      documents,
      async () => receipt,
      signal,
      researchPlan,
    );
    signal.throwIfAborted();
    stage = "result_persist";
    await patch({
      provider_result: receipt,
      result: compiled.result,
      status: "completed",
      error_code: null,
    });
    return { ran: true };
  } catch (error) {
    const diagnostic = pollFailure ?? inspirationDiagnostic(error, stage);
    logInspirationFailure(id, diagnostic);
    const name = error instanceof Error ? error.message : "research_failed";
    const rejectedResponse =
      (error instanceof InspirationFailure &&
        ["ai_parse", "ai_schema", "ai_evidence"].includes(error.diagnostic.stage)) ||
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      [
        "research_request_mismatch",
        "research_response_incomplete",
        "Source metadata mismatch",
        "Quote is not an exact retrieved substring",
        "Supported claims require exact cited passages for every source",
      ].includes(name);
    try {
      if (uncertain && rejectedResponse) {
        // A conclusively invalid stored response is an application failure, not
        // unknown execution. Retain it and its accounting; never erase/re-dispatch.
        const journal = await db
          .from("ai_provider_executions")
          .select("result")
          .eq("id", job.execution_id)
          .eq("user_id", job.user_id)
          .maybeSingle();
        if (!journal.error && journal.data?.result) {
          await (deps.record ?? record)(job, journal.data.result);
          await rpc("settle_music_inspiration_dispatch", {
            _job_id: id,
            _dispatch_key: job.execution_id,
            _state: "observed",
            _receipt: { executionId: job.execution_id, applicationRejected: true },
          });
          await patch({ provider_result: journal.data.result });
          uncertain = false;
        }
      }
    } catch (secondary) {
      uncertain = true;
      logInspirationFailure(id, inspirationDiagnostic(secondary, "usage_persist"));
    }
    const known = [
      "search_configuration_required",
      "research_budget_exceeded",
      "pricing_unverified",
      "no_accessible_evidence",
      "model_unavailable",
      "research_prompt_too_large",
      "research_queue_expired",
    ];
    try {
      await patch({
        status:
          controller.signal.aborted && !pollFailure
            ? "cancelled"
            : uncertain
              ? "unknown"
              : "failed",
        error_code:
          controller.signal.aborted && !pollFailure
            ? "cancelled"
            : known.includes(name) && !(error instanceof InspirationFailure)
              ? name
              : encodeInspirationDiagnostic(diagnostic),
      });
    } catch (secondary) {
      logInspirationFailure(id, inspirationDiagnostic(secondary, "job_persist"));
      throw secondary;
    }
    return { ran: true };
  } finally {
    clearInterval(interval);
    controller.abort();
  }
}
/** Existing authenticated runner sweep; no client polling ever dispatches work. */
export async function pendingMusicInspirationJobIds(): Promise<string[]> {
  const db = await database();
  const { data, error } = await db.rpc("pending_music_inspiration_job_ids");
  if (error) throw new Error("inspiration_recovery_unavailable");
  return (data ?? []).map((row: { id: string }) => row.id);
}
