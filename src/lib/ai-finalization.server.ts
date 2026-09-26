import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export async function markAuxiliaryAiProviderStarted(input: {
  userId: string;
  operation: string;
  requestKey: string;
  executionToken: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("mark_auxiliary_ai_provider_started_internal", {
    _user_id: input.userId,
    _operation: input.operation,
    _request_key: input.requestKey,
    _execution_token: input.executionToken,
  });
  if (error || data !== true) {
    throw new Error("The AI request could not start safely. Please try again.");
  }
}

export async function completeAuxiliaryAiRequest(input: {
  userId: string;
  operation: string;
  requestKey: string;
  executionToken: string;
  result: unknown;
}) {
  const { error } = await supabaseAdmin.rpc("complete_auxiliary_ai_request_internal", {
    _user_id: input.userId,
    _operation: input.operation,
    _request_key: input.requestKey,
    _execution_token: input.executionToken,
    _result: input.result as Json,
  });
  if (error) {
    throw new Error("The AI result could not be saved safely. Please try again.");
  }
}

export async function failAuxiliaryAiRequest(input: {
  userId: string;
  operation: string;
  requestKey: string;
  executionToken: string;
  errorMessage: string;
}) {
  await supabaseAdmin.rpc("fail_auxiliary_ai_request_internal", {
    _user_id: input.userId,
    _operation: input.operation,
    _request_key: input.requestKey,
    _execution_token: input.executionToken,
    _error: input.errorMessage,
  });
}

export async function markQualityCheckProviderStarted(userId: string, idempotencyKey: string) {
  const { error } = await supabaseAdmin.rpc("mark_quality_check_provider_started_internal", {
    _user_id: userId,
    _idempotency_key: idempotencyKey,
  });
  if (error) {
    throw new Error("The quality check could not be started. Please try again.");
  }
}

export async function releaseQualityCheck(userId: string, idempotencyKey: string) {
  await supabaseAdmin.rpc("release_quality_check_internal", {
    _user_id: userId,
    _idempotency_key: idempotencyKey,
  });
}

export async function consumeQualityCheck(input: {
  userId: string;
  idempotencyKey: string;
  qualityReport: Json;
  provider: string;
  model: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("consume_quality_check_internal", {
    _user_id: input.userId,
    _idempotency_key: input.idempotencyKey,
    _quality_report: input.qualityReport,
    _provider: input.provider,
    _model: input.model,
  });
  if (error) {
    throw new Error("The action could not be recorded. Please try again.");
  }
  return data;
}
