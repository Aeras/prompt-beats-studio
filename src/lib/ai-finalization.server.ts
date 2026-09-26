import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

type RpcError = { message: string } | null;
type RpcResult<T> = PromiseLike<{ data: T; error: RpcError }>;

type InternalAiRpcClient = {
  rpc(
    name: "mark_auxiliary_ai_provider_started_internal",
    args: {
      _user_id: string;
      _operation: string;
      _request_key: string;
      _execution_token: string;
    },
  ): RpcResult<boolean>;
  rpc(
    name: "complete_auxiliary_ai_request_internal",
    args: {
      _user_id: string;
      _operation: string;
      _request_key: string;
      _execution_token: string;
      _result: Json;
    },
  ): RpcResult<undefined>;
  rpc(
    name: "fail_auxiliary_ai_request_internal",
    args: {
      _user_id: string;
      _operation: string;
      _request_key: string;
      _execution_token: string;
      _error: string;
    },
  ): RpcResult<undefined>;
  rpc(
    name: "mark_quality_check_provider_started_internal",
    args: { _user_id: string; _idempotency_key: string },
  ): RpcResult<undefined>;
  rpc(
    name: "release_quality_check_internal",
    args: { _user_id: string; _idempotency_key: string },
  ): RpcResult<undefined>;
  rpc(
    name: "consume_quality_check_internal",
    args: {
      _user_id: string;
      _idempotency_key: string;
      _quality_report: Json;
      _provider: string;
      _model: string;
    },
  ): RpcResult<string>;
};

// Production-generated Supabase types already contain these server-only RPCs,
// while the checked-in generated snapshot can lag a migration. Keep this
// boundary explicit and strongly typed without reintroducing `any`.
const internalAiRpc = supabaseAdmin as unknown as InternalAiRpcClient;

export async function markAuxiliaryAiProviderStarted(input: {
  userId: string;
  operation: string;
  requestKey: string;
  executionToken: string;
}) {
  const { data, error } = await internalAiRpc.rpc("mark_auxiliary_ai_provider_started_internal", {
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
  const { error } = await internalAiRpc.rpc("complete_auxiliary_ai_request_internal", {
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
  await internalAiRpc.rpc("fail_auxiliary_ai_request_internal", {
    _user_id: input.userId,
    _operation: input.operation,
    _request_key: input.requestKey,
    _execution_token: input.executionToken,
    _error: input.errorMessage,
  });
}

export async function markQualityCheckProviderStarted(userId: string, idempotencyKey: string) {
  const { error } = await internalAiRpc.rpc("mark_quality_check_provider_started_internal", {
    _user_id: userId,
    _idempotency_key: idempotencyKey,
  });
  if (error) {
    throw new Error("The quality check could not be started. Please try again.");
  }
}

export async function releaseQualityCheck(userId: string, idempotencyKey: string) {
  await internalAiRpc.rpc("release_quality_check_internal", {
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
  const { data, error } = await internalAiRpc.rpc("consume_quality_check_internal", {
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
