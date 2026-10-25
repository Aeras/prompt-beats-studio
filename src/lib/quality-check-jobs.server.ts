import { safeErrorType } from "@/lib/safe-diagnostics";
/**
 * Durable execution layer for Quality Check jobs.
 *
 * The browser only admits/polls an action. This worker is invoked by the same
 * database-owned runner used for durable song generation, so mobile
 * backgrounding, refreshes and lost browser connections cannot cancel a QC.
 */
import { flushDurableQualityUsage, runDurableQualityCheck } from "@/lib/quality-check-core.server";
import { durableQualityCheckInput } from "@/lib/quality-check-job-schema";

const STALE_UNSTARTED_MS = 15 * 60 * 1000;
const STALE_PENDING_MS = 30 * 60 * 1000;

type AdminClient = {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

function safeFailureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw.includes("not allowed to use AI services"))
    return "This account is not allowed to use AI services.";
  if (raw.includes("account is no longer available")) return "The account is no longer available.";
  return "Quality check unavailable. Please try again.";
}

async function finalizePersistedResult(db: AdminClient, actionId: string): Promise<string> {
  const { data, error } = await db.rpc("finalize_quality_check_job", {
    _action_id: actionId,
  });
  if (error || typeof data !== "string") {
    throw new Error("The quality check result could not be finalized.");
  }
  return data;
}

/**
 * Executes exactly one QC provider request. Idempotent/recovery behavior:
 * - completed/failed actions are terminal;
 * - pending is atomically claimed once;
 * - a processing action with a persisted valid report only re-runs finalization;
 * - a provider-started action with no persisted report is NEVER auto-retried,
 *   because the external request may already have been billable.
 */
export async function executeQualityCheckJob(actionId: string): Promise<{ ran: boolean }> {
  const db = await admin();

  const { data: existing, error: readError } = await db
    .from("ai_quality_check_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();

  if (readError) throw new Error("The quality check job could not be read by the worker.");

  if (!existing || existing.status === "completed") {
    return { ran: false };
  }
  let recovered: Record<string, unknown> | null = null;
  if (existing.status === "failed") {
    const { claimRecoveredJob } = await import("./ai-execution.server");
    recovered = await claimRecoveredJob("quality_check", actionId);
    if (!recovered) return { ran: false };
  }

  if (
    existing.status === "processing" &&
    existing.quality_report &&
    existing.provider &&
    existing.model
  ) {
    await finalizePersistedResult(db, actionId);
    return { ran: true };
  }

  if (existing.status === "processing") {
    // provider_started_at means a request may already be in flight. Never issue
    // a duplicate provider call from a recovery run.
    const { claimRecoveredJob } = await import("./ai-execution.server");
    recovered = await claimRecoveredJob("quality_check", actionId);
    if (!recovered) return { ran: false };
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = recovered
    ? { data: recovered, error: null }
    : await db
        .from("ai_quality_check_actions")
        .update({
          status: "processing",
          started_at: now,
          updated_at: now,
          error: null,
        })
        .eq("id", actionId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

  if (claimError) throw new Error("The quality check job could not be claimed by the worker.");
  if (!claimed) return { ran: false };

  const action = claimed as {
    id: string;
    user_id: string;
    input_payload: unknown;
  };

  const cancellationController = new AbortController();
  let cancellationCheckInFlight = false;
  let upstreamCancellationOutcome: string | null = null;
  const checkCancellation = async () => {
    if (cancellationCheckInFlight || cancellationController.signal.aborted) return;
    cancellationCheckInFlight = true;
    try {
      const { data } = await db
        .from("ai_quality_check_actions")
        .select("cancel_requested_at")
        .eq("id", action.id)
        .maybeSingle();
      if ((data as { cancel_requested_at?: string | null } | null)?.cancel_requested_at)
        cancellationController.abort(new Error("Quality Check cancellation requested."));
    } finally {
      cancellationCheckInFlight = false;
    }
  };
  const cancellationTimer = setInterval(() => {
    void checkCancellation().catch(() => {});
  }, 750);
  const remoteCreated = async (provider: "openai" | "gemini", remoteId: string) => {
    const { error } = await db
      .from("ai_quality_check_actions")
      .update({ cancellation_remote_id: remoteId, cancellation_remote_provider: provider })
      .eq("id", action.id)
      .eq("status", "processing");
    if (error) throw new Error("Could not persist QC cancellation remote ID.");
  };
  const cancellationReported = async (outcome: string) => {
    upstreamCancellationOutcome =
      outcome === "cancelled_upstream_confirmed"
        ? "cancelled_upstream_confirmed"
        : "connection_aborted_unconfirmed";
  };

  let providerCommitted = false;
  let payload: ReturnType<typeof durableQualityCheckInput.parse>;
  try {
    payload = durableQualityCheckInput.parse(action.input_payload);
  } catch (err) {
    console.error("[quality-job] invalid payload", { actionId, errorType: safeErrorType(err) });
    await db
      .from("ai_quality_check_actions")
      .update({
        status: "failed",
        error: "The quality check input was invalid. Please try again.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionId)
      .eq("status", "processing")
      .is("provider_started_at", null);
    clearInterval(cancellationTimer);
    return { ran: true };
  }

  try {
    if (payload.qualityCheckVersion !== "v1") {
      const { data: roles, error: roleError } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", action.user_id)
        .eq("role", "super_admin")
        .limit(1);
      if (roleError || !roles?.length) {
        throw new Error("Quality Check V2 authorization failed.");
      }
    }
    const out = await runDurableQualityCheck(
      payload,
      action.user_id,
      async ({ provider, model }) => {
        if (recovered) {
          providerCommitted = true;
          return;
        }
        const startedAt = new Date().toISOString();
        const { data: marked, error } = await db
          .from("ai_quality_check_actions")
          .update({
            provider_started_at: startedAt,
            provider,
            model,
            updated_at: startedAt,
          })
          .eq("id", action.id)
          .eq("status", "processing")
          .is("provider_started_at", null)
          .is("cancel_requested_at", null)
          .select("id")
          .maybeSingle();
        if (error || !marked) {
          throw new Error("The quality check provider could not be started safely.");
        }
        providerCommitted = true;
      },
      cancellationController.signal,
      cancellationReported,
      remoteCreated,
      {
        userId: action.user_id,
        operation: "quality_check",
        qualityActionId: action.id,
        generationId: payload.generationId,
        recoveryOnly: !!recovered,
      },
    );
    await checkCancellation();
    if (cancellationController.signal.aborted)
      throw new Error("Quality Check cancellation requested.");

    if (!out.quality) {
      try {
        await flushDurableQualityUsage(action.user_id, payload.generationId ?? null, out.records);
      } catch (usageError) {
        console.error("[quality-job] usage logging failed", {
          actionId,
          errorType: safeErrorType(usageError),
        });
      }

      await db
        .from("ai_quality_check_actions")
        .update({
          status: "failed",
          error: out.failureReason
            ? `Quality check could not complete (${out.failureReason}${out.schemaFailureDetails ? `: ${out.schemaFailureDetails}` : ""}). Please try again later.`
            : "Quality check unavailable. Please try again.",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", actionId)
        .eq("status", "processing");
      return { ran: true };
    }

    // Persist the validated provider result BEFORE charging/finalizing. If the
    // final transaction fails, a runner retry can finish from this stored result
    // without making a second provider request.
    const { data: persisted, error: persistError } = await db
      .from("ai_quality_check_actions")
      .update({
        quality_report: out.quality,
        provider: out.provider,
        model: out.model,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionId)
      .eq("status", "processing")
      .is("cancel_requested_at", null)
      .select("id")
      .maybeSingle();

    if (persistError || !persisted) {
      throw new Error("The quality check result could not be persisted safely.");
    }

    const consumedId = await finalizePersistedResult(db, actionId);

    try {
      await flushDurableQualityUsage(
        action.user_id,
        payload.generationId ?? consumedId,
        out.records,
      );
    } catch (usageError) {
      // Usage analytics must never turn a completed, charged QC into a user
      // failure or cause another provider request.
      console.error("[quality-job] usage logging failed", {
        actionId,
        errorType: safeErrorType(usageError),
      });
    }

    return { ran: true };
  } catch (err) {
    await checkCancellation().catch(() => {});
    if (cancellationController.signal.aborted) {
      // The provider transport is interrupted; only the native provider
      // acknowledgement may authorize confirmed-upstream classification.
      await db
        .from("ai_quality_check_actions")
        .update({
          status: "cancelled",
          cancellation_outcome: upstreamCancellationOutcome ?? "connection_aborted_unconfirmed",
          quality_report: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", actionId)
        .eq("status", "processing");
      return { ran: true };
    }
    console.error("[quality-job] failed", { actionId, errorType: safeErrorType(err) });

    if (!providerCommitted) {
      // We know no external provider call was committed, so failing the action
      // is safe and leaves it uncharged.
      await db
        .from("ai_quality_check_actions")
        .update({
          status: "failed",
          error: safeFailureMessage(err),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", actionId)
        .eq("status", "processing")
        .is("provider_started_at", null);
    }
    // After provider_started_at we deliberately leave ambiguous work processing
    // unless a validated report was already persisted. Automatic retry here
    // could duplicate a billable provider request.
    return { ran: true };
  } finally {
    clearInterval(cancellationTimer);
  }
}

/** Fails only work that provably never reached a provider. */
export async function reapStaleQualityChecks(): Promise<number> {
  const db = await admin();
  const now = new Date().toISOString();
  let changed = 0;

  const { data: staleProcessing } = await db
    .from("ai_quality_check_actions")
    .update({
      status: "failed",
      error: "The quality check could not be started. Please try again.",
      completed_at: now,
      updated_at: now,
    })
    .eq("status", "processing")
    .is("provider_started_at", null)
    .lt("started_at", new Date(Date.now() - STALE_UNSTARTED_MS).toISOString())
    .select("id");
  changed += (staleProcessing as { id: string }[] | null)?.length ?? 0;

  const { data: stalePending } = await db
    .from("ai_quality_check_actions")
    .update({
      status: "failed",
      error: "The quality check could not be started. Please try again.",
      completed_at: now,
      updated_at: now,
    })
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - STALE_PENDING_MS).toISOString())
    .select("id");
  changed += (stalePending as { id: string }[] | null)?.length ?? 0;

  return changed;
}

/**
 * Returns work a sweep may safely execute: fresh pending actions plus
 * processing actions whose provider result is already persisted and therefore
 * require finalization only.
 */
export async function recoverableQualityActionIds(limit = 5): Promise<string[]> {
  const db = await admin();
  const ids = new Set<string>();

  const { data: pending } = await db
    .from("ai_quality_check_actions")
    .select("id")
    .eq("status", "pending")
    .gt("created_at", new Date(Date.now() - STALE_PENDING_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  for (const row of (pending as { id: string }[] | null) ?? []) ids.add(row.id);

  if (ids.size < limit) {
    const { data: finalizable } = await db
      .from("ai_quality_check_actions")
      .select("id")
      .eq("status", "processing")
      .not("quality_report", "is", null)
      .order("updated_at", { ascending: true })
      .limit(limit - ids.size);
    for (const row of (finalizable as { id: string }[] | null) ?? []) ids.add(row.id);
  }

  const { data: recovery } = await db.rpc("recoverable_ai_job_ids_internal", {
    _kind: "quality_check",
    _limit: limit,
  });
  for (const id of (recovery as string[] | null) ?? []) ids.add(id);
  return [...ids].slice(0, limit);
}
