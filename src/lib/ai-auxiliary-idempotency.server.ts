import { z } from "zod";

import type { AuxiliaryAiOperation } from "@/lib/ai-admission.server";

export const auxiliaryRequestKeySchema = z.string().uuid();

type Claim = {
  status?: "claimed" | "completed" | "processing" | "failed" | "rate_limited";
  executionToken?: string;
  result?: unknown;
  error?: string | null;
};

/**
 * Owns the database claim for one logical auxiliary-AI action.  The provider
 * is marked as started before `execute` runs, so a crash can fail safely but
 * can never cause the same request key to launch a second paid call.
 */
export async function executeDurableAuxiliaryAiRequest<T>(input: {
  supabase: any;
  operation: AuxiliaryAiOperation;
  requestKey: string;
  execute: (markProviderStarted: () => Promise<void>) => Promise<T>;
}): Promise<T> {
  const { data, error } = await input.supabase.rpc("claim_auxiliary_ai_request", {
    _operation: input.operation,
    _request_key: input.requestKey,
  });
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
  if (
    claim.status !== "claimed" ||
    !auxiliaryRequestKeySchema.safeParse(claim.executionToken).success
  )
    throw new Error("The AI request could not be claimed. Please try again.");

  const executionToken = claim.executionToken;
  try {
    let providerStarted = false;
    const markProviderStarted = async () => {
      if (providerStarted) return;
      const { data: marked, error: markError } = await input.supabase.rpc(
        "mark_auxiliary_ai_provider_started",
        {
          _operation: input.operation,
          _request_key: input.requestKey,
          _execution_token: executionToken,
        },
      );
      if (markError || marked !== true)
        throw new Error("The AI request could not start safely. Please try again.");
      providerStarted = true;
    };

    const result = await input.execute(markProviderStarted);
    const { error: completeError } = await input.supabase.rpc("complete_auxiliary_ai_request", {
      _operation: input.operation,
      _request_key: input.requestKey,
      _execution_token: executionToken,
      _result: result,
    });
    if (completeError)
      throw new Error("The AI result could not be saved safely. Please try again.");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "auxiliary_ai_failed";
    await input.supabase.rpc("fail_auxiliary_ai_request", {
      _operation: input.operation,
      _request_key: input.requestKey,
      _execution_token: executionToken,
      _error: message,
    });
    throw error;
  }
}
