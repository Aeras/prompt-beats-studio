import { safeErrorType } from "@/lib/safe-diagnostics";

import {
  AI_MODELS,
  AI_MODEL_IDS,
  DEFAULT_AI_MODEL,
  isAdminOnlyAiModel,
  type AiModelId,
} from "@/lib/ai-models";
export type RegistryReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type AiModelOperation = "generator" | "quality_check" | "ai_tools";

export type RegistryModel = {
  id: string | null;
  provider: string;
  providerModelId: AiModelId;
  displayName: string;
  status: "testing" | "enabled" | "disabled" | "deprecated" | "archived";
  accessPolicy: "admin_only" | "selected_users" | "all_users";
  generatorCompatible: boolean;
  generatorEnabled: boolean;
  generatorReasoningEffort: RegistryReasoningEffort | null;
  qualityCheckCompatible: boolean;
  qualityCheckEnabled: boolean;
  qualityCheckReasoningEffort: RegistryReasoningEffort | null;
};

type RegistryRow = {
  id: string;
  provider: string;
  provider_model_id: string;
  display_name: string;
  status: RegistryModel["status"];
  access_policy: RegistryModel["accessPolicy"];
  generator_compatible: boolean;
  generator_enabled: boolean;
  generator_reasoning_effort: RegistryReasoningEffort | null;
  quality_check_compatible: boolean;
  quality_check_enabled: boolean;
  quality_check_reasoning_effort: RegistryReasoningEffort | null;
};

function isRegistryNotMigrated(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01",
  );
}

function fallbackModel(id: AiModelId): RegistryModel | null {
  const catalog = AI_MODELS.find((model) => model.id === id);
  if (!catalog) return null;
  return {
    id: null,
    provider: catalog.provider,
    providerModelId: id,
    displayName: catalog.label,
    status: "enabled",
    accessPolicy: isAdminOnlyAiModel(id) ? "selected_users" : "all_users",
    generatorCompatible: true,
    generatorEnabled: true,
    generatorReasoningEffort: "medium",
    qualityCheckCompatible: true,
    qualityCheckEnabled: true,
    qualityCheckReasoningEffort: "high",
  };
}

function normalizeRow(row: RegistryRow): RegistryModel {
  return {
    id: row.id,
    provider: row.provider,
    providerModelId: row.provider_model_id,
    displayName: row.display_name,
    status: row.status,
    accessPolicy: row.access_policy,
    generatorCompatible: row.generator_compatible,
    generatorEnabled: row.generator_enabled,
    generatorReasoningEffort: row.generator_reasoning_effort,
    qualityCheckCompatible: row.quality_check_compatible,
    qualityCheckEnabled: row.quality_check_enabled,
    qualityCheckReasoningEffort: row.quality_check_reasoning_effort,
  };
}

export function isModelEligibleForOperation(model: RegistryModel, operation: AiModelOperation) {
  if (model.status !== "enabled" && model.status !== "testing") return false;
  if (operation === "quality_check") {
    return model.qualityCheckCompatible && model.qualityCheckEnabled;
  }
  return model.generatorCompatible && model.generatorEnabled;
}

export function reasoningForOperation(
  model: RegistryModel,
  operation: AiModelOperation,
): RegistryReasoningEffort | undefined {
  const value =
    operation === "quality_check"
      ? model.qualityCheckReasoningEffort
      : model.generatorReasoningEffort;
  return value ?? undefined;
}

export async function getInstalledRegistryModels(): Promise<RegistryModel[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select(
        "id,provider,provider_model_id,display_name,status,access_policy,generator_compatible,generator_enabled,generator_reasoning_effort,quality_check_compatible,quality_check_enabled,quality_check_reasoning_effort",
      );
    if (error) throw error;
    return ((data ?? []) as unknown as RegistryRow[]).map(normalizeRow);
  } catch (error) {
    if (isRegistryNotMigrated(error)) {
      console.warn("[ai-registry] registry table not migrated yet; using compatibility catalog");
      return AI_MODEL_IDS.map(fallbackModel).filter(
        (model): model is RegistryModel => model !== null,
      );
    }
    console.error("[ai-registry] registry lookup failed", { errorType: safeErrorType(error) });
    throw new Error("AI model registry is temporarily unavailable.");
  }
}

export async function getRegistryModel(modelId: string): Promise<RegistryModel | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select(
        "id,provider,provider_model_id,display_name,status,access_policy,generator_compatible,generator_enabled,generator_reasoning_effort,quality_check_compatible,quality_check_enabled,quality_check_reasoning_effort",
      )
      .eq("provider_model_id", modelId)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data as unknown as RegistryRow) : null;
  } catch (error) {
    if (isRegistryNotMigrated(error)) {
      console.warn("[ai-registry] registry table not migrated yet; using compatibility catalog");
      return fallbackModel(modelId);
    }
    console.error("[ai-registry] model lookup failed", { errorType: safeErrorType(error) });
    throw new Error("AI model registry is temporarily unavailable.");
  }
}

const settingKeyFor = (operation: AiModelOperation) => {
  if (operation === "generator") return "ai_generator_default_model";
  if (operation === "quality_check") return "ai_quality_check_default_model";
  return "ai_tools_default_model";
};

export async function getOperationDefaultModel(
  operation: AiModelOperation,
): Promise<RegistryModel> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", settingKeyFor(operation))
      .maybeSingle();
    const modelId = (data as { value?: { model?: string } } | null)?.value?.model;
    if (modelId) {
      const model = await getRegistryModel(modelId);
      if (model && isModelEligibleForOperation(model, operation)) return model;
    }

    // Migration/rollback compatibility: honor the legacy shared setting if the
    // operation-specific setting is not available yet.
    const { data: legacy } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_model")
      .maybeSingle();
    const legacyId = (legacy as { value?: { model?: string } } | null)?.value?.model;
    if (legacyId) {
      const model = await getRegistryModel(legacyId);
      if (model && isModelEligibleForOperation(model, operation)) return model;
    }
  } catch (error) {
    console.warn("[ai-registry] default lookup failed; using hard fallback", {
      errorType: safeErrorType(error),
    });
  }

  const fallback = await getRegistryModel(DEFAULT_AI_MODEL);
  if (!fallback || !isModelEligibleForOperation(fallback, operation)) {
    throw new Error("No valid AI default model is configured.");
  }
  return fallback;
}
