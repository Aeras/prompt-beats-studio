import { withFeatureAiDispatchAdmission } from "./global-ai-usage.server";
import { featureKeysForAiOperation } from "./ai-feature-access.server";
import type { AiOperation, NormalizedUsage } from "./ai-usage.server";
import { recordAiUsage } from "./ai-usage.server";
import { usageEvidence } from "./ai-usage-evidence";
import type { ModelCall, ModelResult, ModelCaller } from "./ai-provider.server";

export type ExecutionContext = {
  /** Server-owned durable identity for standalone research; never a client job ID. */
  executionId?: string;
  userId: string;
  operation: AiOperation;
  generationId?: string | null | undefined;
  jobId?: string;
  qualityActionId?: string;
  recoveryOnly?: boolean;
};
type Execution = {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  operation: AiOperation;
  generation_id: string | null;
  job_id: string | null;
  quality_action_id: string | null;
  remote_id: string | null;
  remote_provider: "openai" | "gemini" | null;
  result: ModelResult | null;
  observed_usage: NormalizedUsage | null;
};
type Rpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};
async function db(): Promise<Rpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Rpc;
}
async function write(name: string, args: Record<string, unknown>) {
  const reply = await (await db()).rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  if (reply.error) throw new Error("AI execution evidence could not be persisted.");
  return reply.data;
}
export async function beginExecution(
  id: string,
  context: ExecutionContext,
  provider: string,
  model: string,
) {
  await write("begin_ai_execution_internal", {
    _id: id,
    _user_id: context.userId,
    _operation: context.operation,
    _provider: provider,
    _model: model,
    _generation_id: context.generationId ?? null,
    _job_id: context.jobId ?? null,
    _quality_action_id: context.qualityActionId ?? null,
  });
}
export async function checkpointExecution(
  id: string,
  context: ExecutionContext,
  result: ModelResult,
) {
  await write("checkpoint_ai_execution_internal", {
    _id: id,
    _user_id: context.userId,
    _result: result,
  });
}
export async function observeExecution(id: string, userId: string, usage: NormalizedUsage | null) {
  if (usage)
    await write("observe_ai_execution_usage_internal", {
      _id: id,
      _user_id: userId,
      _usage: usage,
    });
}
export async function readExecution(context: ExecutionContext): Promise<Execution | null> {
  if (context.executionId)
    return (await write("read_ai_execution_by_id_internal", {
      _user_id: context.userId,
      _execution_id: context.executionId,
    })) as Execution | null;
  if (!context.jobId && !context.qualityActionId) return null;
  return (await write("read_ai_execution_internal", {
    _user_id: context.userId,
    _job_id: context.jobId ?? null,
    _quality_action_id: context.qualityActionId ?? null,
  })) as Execution | null;
}

/** A provider invocation is never retried here. Durable evidence precedes dispatch. */
export type ExecutionDependencies = {
  read?: typeof readExecution;
  begin?: typeof beginExecution;
  checkpoint?: typeof checkpointExecution;
  write?: typeof write;
  record?: typeof recordAiUsage;
  dispatchAdmission?: typeof withFeatureAiDispatchAdmission;
};
export function trackedCaller(
  raw: ModelCaller,
  provider: string,
  model: string,
  context: ExecutionContext,
  deps: ExecutionDependencies = {},
): ModelCaller {
  const persist = deps.record ?? recordAiUsage;
  const journalWrite = deps.write ?? write;
  const call: ModelCaller = async (input: ModelCall) => {
    const cached = await (deps.read ?? readExecution)(context);
    if (cached?.result) {
      call.executionId = cached.id;
      return cached.result;
    }
    if (context.recoveryOnly || cached)
      throw new Error("Provider execution is unresolved; automatic redispatch is forbidden.");
    const featureKeys = featureKeysForAiOperation(context.operation);
    return (deps.dispatchAdmission ?? withFeatureAiDispatchAdmission)(
      context.userId,
      featureKeys,
      async () => {
      input.abortSignal?.throwIfAborted();
      const id = context.executionId ?? crypto.randomUUID();
      call.executionId = id;
      await (deps.begin ?? beginExecution)(id, context, provider, model);
      // A cancel during the journal write must not result in another dispatch.
      if (input.abortSignal?.aborted) {
        await journalWrite("skip_ai_execution_internal", { _id: id, _user_id: context.userId });
        input.abortSignal.throwIfAborted();
      }
      let observedUsage: NormalizedUsage | null = null;
      try {
        const result = await raw({
          ...input,
          usageProvider: provider,
          onRemoteOperationCreated: async (remoteProvider, remoteId) => {
            await journalWrite("mark_ai_execution_remote_internal", {
              _id: id,
              _user_id: context.userId,
              _provider: remoteProvider,
              _remote_id: remoteId,
            });
            await input.onRemoteOperationCreated?.(remoteProvider, remoteId);
          },
          onUsageObserved: async (usage) => {
            observedUsage = usage;
            await journalWrite("observe_ai_execution_usage_internal", {
              _id: id,
              _user_id: context.userId,
              _usage: usage,
            });
            await input.onUsageObserved?.(usage);
          },
        });
        const receipt = {
          ...result,
          usage: result.usage
            ? { ...(observedUsage as NormalizedUsage | null), ...result.usage, executionId: id }
            : observedUsage,
        };
        observedUsage = receipt.usage;
        // Store recoverable provider output before any application/schema/cancel check.
        await (deps.checkpoint ?? checkpointExecution)(id, context, receipt);
        await persist({
          executionId: id,
          userId: context.userId,
          generationId: context.generationId ?? null,
          operation: context.operation,
          provider: result.provider,
          model: result.model,
          usage: receipt.usage,
          usageState: result.usage ? "final" : receipt.usage ? "partial" : "unknown",
          success: result.stopReason === "end_turn",
        });
        return receipt;
      } catch (error) {
        // Unknown is durable from beginExecution; never infer zero consumption.
        const errorUsage = usageEvidence(error, provider);
        if (errorUsage) {
          observedUsage = errorUsage;
          try {
            await journalWrite("observe_ai_execution_usage_internal", {
              _id: id,
              _user_id: context.userId,
              _usage: errorUsage,
            });
          } catch {
            // The independent settlement/outbox path must still receive an
            // observed provider receipt when the journal write is unavailable.
          }
        }
        await persist({
          executionId: id,
          userId: context.userId,
          generationId: context.generationId ?? null,
          operation: context.operation,
          provider,
          model,
          usage: observedUsage,
          usageState: observedUsage ? "partial" : "unknown",
          success: false,
        });
        throw error;
      }
    },
    );
  };
  return call;
}

export async function claimRecoveredJob(kind: "generate" | "quality_check", id: string) {
  return (await write("claim_ai_recovered_job_internal", { _kind: kind, _id: id })) as Record<
    string,
    unknown
  > | null;
}

export async function reconcileAiExecutions(executionId?: string): Promise<void> {
  if (!executionId) await write("reap_unjournaled_ai_jobs_internal", {});
  const rows = (await write(
    executionId
      ? "claim_ai_execution_recovery_by_id_internal"
      : "claim_ai_execution_recovery_internal",
    executionId ? { _id: executionId } : {},
  )) as Array<Execution & { lease_token: string }>;
  for (const row of rows) {
    try {
      let result = row.result;
      if (!result && row.remote_id && row.remote_provider) {
        const cancelled = await write("ai_execution_cancel_requested_internal", {
          _id: row.id,
          _user_id: row.user_id,
        });
        if (cancelled === true) {
          const { cancelPersistedBackgroundOperation } =
            await import("./cancel-persisted-ai-operation.server");
          await cancelPersistedBackgroundOperation(row.remote_provider, row.remote_id);
        }
        const { retrieveBackgroundResult } = await import("./ai-execution-retrieval.server");
        result = await retrieveBackgroundResult(row.remote_provider, row.remote_id, row.model);
      }
      if (result) {
        await checkpointExecution(
          row.id,
          { userId: row.user_id, operation: row.operation },
          result,
        );
      }
      const { recordAiUsage } = await import("./ai-usage.server");
      await recordAiUsage({
        executionId: row.id,
        userId: row.user_id,
        generationId: row.generation_id,
        operation: row.operation,
        provider: row.provider,
        model: row.model,
        usageState: result?.usage ? "final" : row.observed_usage ? "partial" : "unknown",
        usage: result?.usage ?? row.observed_usage,
        success: result?.stopReason === "end_turn",
      });
      if (row.job_id) {
        const { reconcileFailedGeneration } = await import("./generation-reconciliation.server");
        await reconcileFailedGeneration(row.job_id, row.user_id);
      }
    } catch {
      // Bounded durable retry; no provider create, credentials, text or raw errors logged.
      console.warn("[ai-recovery] execution remains unreconciled", row.id);
    } finally {
      await write("release_ai_execution_recovery_internal", {
        _id: row.id,
        _lease_token: row.lease_token,
      });
    }
  }
  if (executionId) return; // Targeted recovery never drains another queue.
  // Validate already stored, finally accounted failures even after automatic
  // recovery is exhausted. This queue never creates a provider request.
  const failures = (await write("claim_failed_generation_validation_internal", {})) as Array<{
    job_id: string;
    user_id: string;
  }>;
  for (const failure of failures) {
    try {
      const { reconcileFailedGeneration } = await import("./generation-reconciliation.server");
      await reconcileFailedGeneration(failure.job_id, failure.user_id);
    } catch {
      console.warn("[ai-recovery] stored failure validation remains pending", failure.job_id);
    }
  }
}
