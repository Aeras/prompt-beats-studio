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
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const reply = await db.rpc(name, args);
    if (reply.error) throw new Error("inspiration_persistence_failed");
    return reply.data;
  };
  const job = await rpc("claim_music_inspiration_job", { _job_id: id, _lease_token: token });
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
      if (
        reply.error ||
        !reply.data ||
        reply.data.cancel_requested_at ||
        reply.data.status === "cancelled"
      )
        controller.abort();
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  };
  const interval = setInterval(() => void poll(), 1500);
  let uncertain = false;
  try {
    const request = inspirationRequestSchema.parse(job.request);
    const limits = INSPIRATION_LIMITS[request.depth];
    const elapsed =
      (deps.clock ?? Date.now)() - Date.parse(job.research_started_at ?? job.created_at);
    let signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, limits.timeoutMs - Math.max(0, elapsed))),
    ]);
    await poll();
    const documents: RetrievedInspirationDocument[] = await (deps.atlas ?? approvedAtlasEvidence)(
      request,
    );
    const dispatchesReply = await db
      .from("music_inspiration_dispatches")
      .select("*")
      .eq("job_id", id);
    if (dispatchesReply.error) throw new Error("inspiration_persistence_failed");
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
    // Recovery is bounded validation, not a fresh research budget. An old job
    // may still finalize an already obtained response after its dispatch window.
    if (savedReceipt) signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    signal.throwIfAborted();
    if (!savedReceipt && (deps.clock ?? Date.now)() - Date.parse(job.created_at) > 30 * 60 * 1000)
      throw new Error("research_queue_expired");
    const admit =
      deps.admitDispatch ?? (await import("./global-ai-usage.server")).requireGlobalAiUsage;
    const reserve = async (key: string, kind: string, cost: number, credits: number) => {
      signal.throwIfAborted();
      await (deps.authorizeModel ?? authorizeModel)(job.user_id, job.model);
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
    for (const [index, query] of inspirationQueries(request).entries()) {
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
        const found = await (deps.search ?? searchInspirationWeb)(query, signal);
        // Preserve observed consumption and source evidence before checking cancellation.
        await settle(key, "observed", found);
        uncertain = false;
        documents.push(...found.documents);
      } catch (error) {
        await settle(key, "unknown", { outcome: "unknown" });
        throw error;
      }
    }
    signal.throwIfAborted();
    let receipt: ModelResult;
    if (savedReceipt) {
      receipt = savedReceipt;
      await (deps.record ?? record)(job, receipt);
      await settle(job.execution_id, "observed", { executionId: job.execution_id });
    } else {
      if (journalReply.data || dispatches.some((d: any) => d.kind === "ai")) {
        uncertain = true;
        throw new Error("provider_outcome_unknown");
      }
      if (!documents.length) throw new Error("no_accessible_evidence");
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
      const compiled = await (deps.synthesize ?? synthesizeMusicInspiration)(
        request,
        documents,
        caller,
        signal,
      );
      receipt = compiled.receipt;
      await settle(job.execution_id, "observed", { executionId: job.execution_id });
      await patch({ provider_result: receipt });
      uncertain = false;
      signal.throwIfAborted();
      await patch({ result: compiled.result, status: "completed", error_code: null });
      return { ran: true };
    }
    // Stored response can be validated/finalized without a second provider call.
    const compiled = await (deps.synthesize ?? synthesizeMusicInspiration)(
      request,
      documents,
      async () => receipt,
      signal,
    );
    signal.throwIfAborted();
    await patch({
      provider_result: receipt,
      result: compiled.result,
      status: "completed",
      error_code: null,
    });
    return { ran: true };
  } catch (error) {
    const name = error instanceof Error ? error.message : "research_failed";
    const rejectedResponse =
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      [
        "research_request_mismatch",
        "research_response_incomplete",
        "Source metadata mismatch",
        "Quote is not an exact retrieved substring",
        "Supported claims require exact cited passages for every source",
      ].includes(name);
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
    const known = [
      "search_configuration_required",
      "research_budget_exceeded",
      "pricing_unverified",
      "no_accessible_evidence",
      "model_unavailable",
      "research_prompt_too_large",
      "research_queue_expired",
    ];
    await patch({
      status: controller.signal.aborted ? "cancelled" : uncertain ? "unknown" : "failed",
      error_code: controller.signal.aborted
        ? "cancelled"
        : uncertain
          ? "provider_outcome_unknown"
          : known.includes(name)
            ? name
            : "research_failed",
    });
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
