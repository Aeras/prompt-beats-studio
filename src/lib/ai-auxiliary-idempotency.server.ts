import { withAiDispatchAdmission, AiUsageUnavailableError } from "./global-ai-usage.server";
import { auxiliaryModelContext, startAuxiliaryModel } from "./ai-auxiliary-model-context.server";
import { z } from "zod";

import type { AuxiliaryAiOperation } from "@/lib/ai-admission.server";
import { completeAuxiliaryAiRequest, failAuxiliaryAiRequest } from "@/lib/ai-finalization.server";

export const auxiliaryRequestKeySchema = z.string().guid();

type Claim = {
  status?: "claimed" | "completed" | "processing" | "failed" | "rate_limited";
  executionToken?: string;
  result?: unknown;
  error?: string | null;
};

/**
 * Owns the database claim for one logical auxiliary-AI action. The caller-bound
 * client may claim/read its own request, but provider-start/finalization is
 * committed only through service-role-only server helpers.
 */
export async function executeDurableAuxiliaryAiRequest<T>(input: {
  supabase: any;
  userId: string;
  operation: AuxiliaryAiOperation;
  requestKey: string;
  execute: (markProviderStarted: (model: string) => Promise<void>) => Promise<T>;
}): Promise<T> {
  const { data, error } = await input.supabase.rpc("claim_auxiliary_ai_request", {
    _operation: input.operation,
    _request_key: input.requestKey,
  });
  if (error?.code === "PT423") throw new AiUsageUnavailableError(true);
  if (error) throw new Error("The AI request could not be admitted. Please try again.");

  const claim = (data ?? {}) as Claim;
  if (claim.status === "completed") return claim.result as T;
  if (claim.status === "processing")
    throw new Error("This AI request is already processing. Please wait for it to finish.");
  if (claim.status === "rate_limited")
    throw new Error("Too many AI requests. Please try again later.");
  if (claim.status === "failed")
    throw new Error(
      claim.error || "This AI request already failed. Start a new request to try again.",
    );

  const executionTokenResult = auxiliaryRequestKeySchema.safeParse(claim.executionToken);
  if (claim.status !== "claimed" || !executionTokenResult.success) {
    throw new Error("The AI request could not be claimed. Please try again.");
  }

  const executionToken = executionTokenResult.data;
  return auxiliaryModelContext.run(
    {
      userId: input.userId,
      operation: input.operation,
      requestKey: input.requestKey,
      executionToken,
      uses: [],
    },
    async () => {
      try {
        return await withAiDispatchAdmission(async () => {
          const markProviderStarted = async (model: string) => {
            await startAuxiliaryModel(model);
          };
          const result = await input.execute(markProviderStarted);
          await completeAuxiliaryAiRequest({
            userId: input.userId,
            operation: input.operation,
            requestKey: input.requestKey,
            executionToken,
            result,
          });
          return result;
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : "auxiliary_ai_failed";
        await failAuxiliaryAiRequest({
          userId: input.userId,
          operation: input.operation,
          requestKey: input.requestKey,
          executionToken,
          errorMessage: message,
        });
        throw error;
      }
    },
  );
}
