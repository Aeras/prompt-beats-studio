import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusSchema = z.enum(["testing", "enabled", "disabled", "deprecated", "archived"]);
const accessPolicySchema = z.enum(["admin_only", "selected_users", "all_users"]);
const reasoningSchema = z.enum(["none", "low", "medium", "high", "xhigh", "max"]).nullable();
const pricingStatusSchema = z.enum(["verified", "unknown", "outdated"]);

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_admin_level");
  if (error || data !== true) throw new Error("Not allowed");
}

export type AdminAiModel = {
  id: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  status: "testing" | "enabled" | "disabled" | "deprecated" | "archived";
  accessPolicy: "admin_only" | "selected_users" | "all_users";
  generatorCompatible: boolean;
  generatorEnabled: boolean;
  generatorReasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max" | null;
  qualityCheckCompatible: boolean;
  qualityCheckEnabled: boolean;
  qualityCheckReasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max" | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  cacheWritePricePerMillion: number | null;
  pricingCurrency: string;
  pricingStatus: "verified" | "unknown" | "outdated";
  pricingUpdatedAt: string | null;
  preview: boolean;
  deprecated: boolean;
  retirementDate: string | null;
  notes: string | null;
  discoveredAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  healthStatus: "healthy" | "degraded" | "failing" | "unknown";
};

const mapRow = (row: any): AdminAiModel => ({
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
  inputPricePerMillion:
    row.input_price_per_million == null ? null : Number(row.input_price_per_million),
  outputPricePerMillion:
    row.output_price_per_million == null ? null : Number(row.output_price_per_million),
  cachedInputPricePerMillion:
    row.cached_input_price_per_million == null ? null : Number(row.cached_input_price_per_million),
  cacheWritePricePerMillion:
    row.cache_write_price_per_million == null ? null : Number(row.cache_write_price_per_million),
  pricingCurrency: row.pricing_currency,
  pricingStatus: row.pricing_status,
  pricingUpdatedAt: row.pricing_updated_at,
  preview: row.preview === true,
  deprecated: row.deprecated === true,
  retirementDate: row.retirement_date,
  notes: row.notes,
  discoveredAt: row.discovered_at,
  lastCheckedAt: row.last_checked_at,
  lastSuccessAt: row.last_success_at,
  lastFailureAt: row.last_failure_at,
  lastErrorCode: row.last_error_code,
  healthStatus: row.health_status,
});

async function readDefaultModel(supabaseAdmin: any, key: string) {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data as { value?: { model?: string } } | null)?.value?.model ?? null;
}

export const getAdminAiModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows, error }, generatorDefault, qualityDefault, aiToolsDefault] =
      await Promise.all([
        supabaseAdmin
          .from("ai_models" as never)
          .select("*")
          .order("provider", { ascending: true })
          .order("display_name", { ascending: true }),
        readDefaultModel(supabaseAdmin, "ai_generator_default_model"),
        readDefaultModel(supabaseAdmin, "ai_quality_check_default_model"),
        readDefaultModel(supabaseAdmin, "ai_tools_default_model"),
      ]);
    if (error) throw new Error(error.message);
    return {
      models: ((rows ?? []) as any[]).map(mapRow),
      generatorDefault,
      qualityDefault,
      aiToolsDefault,
    };
  });

const modelUpdateInput = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  status: statusSchema,
  accessPolicy: accessPolicySchema,
  generatorEnabled: z.boolean(),
  qualityCheckEnabled: z.boolean(),
  generatorReasoningEffort: reasoningSchema,
  qualityCheckReasoningEffort: reasoningSchema,
  inputPricePerMillion: z.number().min(0).max(1_000_000).nullable(),
  outputPricePerMillion: z.number().min(0).max(1_000_000).nullable(),
  cachedInputPricePerMillion: z.number().min(0).max(1_000_000).nullable(),
  cacheWritePricePerMillion: z.number().min(0).max(1_000_000).nullable(),
  pricingStatus: pricingStatusSchema,
  notes: z.string().trim().max(2000).nullable(),
});

export const updateAdminAiModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => modelUpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: currentError } = await supabaseAdmin
      .from("ai_models" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (currentError || !current) throw new Error("AI model not found.");

    const row = current as any;
    const [generatorDefault, qualityDefault, aiToolsDefault] = await Promise.all([
      readDefaultModel(supabaseAdmin, "ai_generator_default_model"),
      readDefaultModel(supabaseAdmin, "ai_quality_check_default_model"),
      readDefaultModel(supabaseAdmin, "ai_tools_default_model"),
    ]);

    const isGeneratorDefault = row.provider_model_id === generatorDefault;
    const isQualityDefault = row.provider_model_id === qualityDefault;
    const isAiToolsDefault = row.provider_model_id === aiToolsDefault;
    const disablingGenerator =
      (isGeneratorDefault || isAiToolsDefault) &&
      (data.status !== "enabled" || !data.generatorEnabled || !row.generator_compatible);
    const disablingQuality =
      isQualityDefault &&
      (data.status !== "enabled" || !data.qualityCheckEnabled || !row.quality_check_compatible);

    if (disablingGenerator)
      throw new Error(
        isAiToolsDefault && !isGeneratorDefault
          ? "Select another AI Tools default before disabling this model."
          : "Select another Generator default before disabling this model.",
      );
    if (disablingQuality)
      throw new Error("Select another Quality Check default before disabling this model.");

    if (
      data.pricingStatus === "verified" &&
      (data.inputPricePerMillion == null || data.outputPricePerMillion == null)
    ) {
      throw new Error("Verified pricing requires both input and output prices.");
    }

    const pricingChanged =
      Number(row.input_price_per_million ?? NaN) !== Number(data.inputPricePerMillion ?? NaN) ||
      Number(row.output_price_per_million ?? NaN) !== Number(data.outputPricePerMillion ?? NaN) ||
      Number(row.cached_input_price_per_million ?? NaN) !==
        Number(data.cachedInputPricePerMillion ?? NaN) ||
      Number(row.cache_write_price_per_million ?? NaN) !==
        Number(data.cacheWritePricePerMillion ?? NaN) ||
      row.pricing_status !== data.pricingStatus;

    const { error } = await supabaseAdmin
      .from("ai_models" as never)
      .update({
        display_name: data.displayName,
        status: data.status,
        access_policy: data.accessPolicy,
        generator_enabled: data.generatorEnabled,
        quality_check_enabled: data.qualityCheckEnabled,
        generator_reasoning_effort: data.generatorReasoningEffort,
        quality_check_reasoning_effort: data.qualityCheckReasoningEffort,
        input_price_per_million: data.inputPricePerMillion,
        output_price_per_million: data.outputPricePerMillion,
        cached_input_price_per_million: data.cachedInputPricePerMillion,
        cache_write_price_per_million: data.cacheWritePricePerMillion,
        pricing_status: data.pricingStatus,
        pricing_updated_at: pricingChanged ? new Date().toISOString() : row.pricing_updated_at,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "UPDATE_AI_MODEL",
      details: {
        model: row.provider_model_id,
        status: data.status,
        access_policy: data.accessPolicy,
        generator_enabled: data.generatorEnabled,
        quality_check_enabled: data.qualityCheckEnabled,
        pricing_status: data.pricingStatus,
      },
    });
    if (auditError) console.error("[admin] AI model audit failed", auditError.message);

    return { ok: true };
  });

const defaultInput = z.object({
  operation: z.enum(["generator", "quality_check", "ai_tools"]),
  model: z.string().trim().min(1).max(200),
});

export const setAdminAiModelDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => defaultInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select(
        "id,provider_model_id,status,access_policy,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled",
      )
      .eq("provider_model_id", data.model)
      .maybeSingle();
    if (error || !row) throw new Error("AI model not found.");

    const model = row as any;
    const valid =
      data.operation === "quality_check"
        ? model.status === "enabled" &&
          model.quality_check_compatible === true &&
          model.quality_check_enabled === true
        : model.status === "enabled" &&
          model.generator_compatible === true &&
          model.generator_enabled === true;
    if (!valid) throw new Error("That model is not eligible for this default.");

    const key =
      data.operation === "generator"
        ? "ai_generator_default_model"
        : data.operation === "quality_check"
          ? "ai_quality_check_default_model"
          : "ai_tools_default_model";

    const { error: updateError } = await supabaseAdmin.from("app_settings").upsert(
      {
        key,
        value: { registryId: model.id, model: model.provider_model_id },
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as never,
      { onConflict: "key" },
    );
    if (updateError) throw new Error(updateError.message);

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "UPDATE_AI_MODEL_DEFAULT",
      details: { operation: data.operation, model: model.provider_model_id },
    });
    if (auditError) console.error("[admin] AI default audit failed", auditError.message);

    return { ok: true, model: model.provider_model_id };
  });

const providerIdSchema = z.enum([
  "openai",
  "gemini",
  "anthropic",
  "xai",
  "deepseek",
  "mistral",
  "groq",
  "openrouter",
  "together",
  "fireworks",
  "cerebras",
  "cohere",
  "nvidia",
]);

const providerCheckTimestamps = new Map<string, number>();

export const getDetectedAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { getDetectedAiProviders: detect } = await import("@/lib/ai-provider-registry.server");
    return { providers: detect() };
  });

export const checkAiProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ providerId: providerIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);

    const rateKey = `${context.userId}:${data.providerId}`;
    const now = Date.now();
    const previous = providerCheckTimestamps.get(rateKey) ?? 0;
    if (now - previous < 5_000) {
      throw new Error("Please wait a few seconds before checking this provider again.");
    }
    providerCheckTimestamps.set(rateKey, now);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select("provider,provider_model_id");
    if (error) throw new Error("Could not read installed AI models.");

    const { discoverProviderModels } = await import("@/lib/ai-provider-registry.server");
    return discoverProviderModels(
      data.providerId,
      ((rows ?? []) as any[]).map((row) => ({
        provider: String(row.provider),
        providerModelId: String(row.provider_model_id),
      })),
    );
  });

const compatibilityInput = z.object({
  providerId: providerIdSchema,
  modelIds: z.array(z.string().trim().min(1).max(240)).min(1).max(100),
});

async function readInstalledForDiscovery(supabaseAdmin: any) {
  const { data: rows, error } = await supabaseAdmin
    .from("ai_models" as never)
    .select("provider,provider_model_id");
  if (error) throw new Error("Could not read installed AI models.");
  return ((rows ?? []) as any[]).map((row) => ({
    provider: String(row.provider),
    providerModelId: String(row.provider_model_id),
  }));
}

export const runAiProviderCompatibilityTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => compatibilityInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const installed = await readInstalledForDiscovery(supabaseAdmin);
    const { discoverProviderModels, testProviderModelsCompatibility } =
      await import("@/lib/ai-provider-registry.server");
    const discovery = await discoverProviderModels(data.providerId, installed);
    const requested = new Set(data.modelIds);
    const candidates = discovery.models.filter(
      (model) => requested.has(model.id) && !model.installed && !model.deprecated,
    );
    if (!candidates.length) throw new Error("No testable candidate models were found.");
    return {
      provider: discovery.provider,
      results: await testProviderModelsCompatibility(data.providerId, candidates),
    };
  });

const addDiscoveredModelInput = z.object({
  providerId: providerIdSchema,
  modelId: z.string().trim().min(1).max(240),
});

export const addDiscoveredAiModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addDiscoveredModelInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // PromptBeats currently resolves model selections by provider_model_id, so
    // keep that identifier globally unique until model keys become composite.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id,provider,provider_model_id")
      .eq("provider_model_id", data.modelId)
      .maybeSingle();
    if (existingError) throw new Error("Could not verify whether this model is already installed.");
    if (existing) throw new Error("A model with this provider model ID is already installed.");

    const installed = await readInstalledForDiscovery(supabaseAdmin);
    const { discoverProviderModels, testSingleProviderModelCompatibility } =
      await import("@/lib/ai-provider-registry.server");
    const discovery = await discoverProviderModels(data.providerId, installed);
    const candidate = discovery.models.find(
      (model) => model.id === data.modelId && !model.installed && !model.deprecated,
    );
    if (!candidate) throw new Error("This model is no longer available as a candidate.");

    // Re-check the selected model server-side before installation so Add never
    // trusts a browser-carried compatibility result.
    const compatibility = await testSingleProviderModelCompatibility(data.providerId, candidate);
    if (
      compatibility.status !== "compatible" &&
      compatibility.status !== "generator_only" &&
      compatibility.status !== "quality_check_only"
    ) {
      throw new Error("This model did not pass the PromptBeats compatibility test.");
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("ai_models" as never)
      .insert({
        provider: data.providerId,
        provider_model_id: candidate.id,
        display_name: candidate.name || candidate.id,
        status: "testing",
        access_policy: "admin_only",
        generator_compatible: compatibility.generatorCompatible,
        generator_enabled: compatibility.generatorCompatible,
        generator_reasoning_effort: null,
        quality_check_compatible: compatibility.qualityCheckCompatible,
        quality_check_enabled: compatibility.qualityCheckCompatible,
        quality_check_reasoning_effort: null,
        structured_output_supported: null,
        reasoning_supported: null,
        usage_reporting_supported: null,
        context_window: candidate.contextWindow,
        pricing_status: "unknown",
        preview: false,
        deprecated: false,
        discovered_at: now,
        last_checked_at: now,
        last_success_at: now,
        health_status: "healthy",
        notes: "Added after PromptBeats compatibility test.",
        updated_at: now,
      } as never)
      .select("id,provider_model_id")
      .single();
    if (insertError || !inserted)
      throw new Error(insertError?.message ?? "Could not add AI model.");

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "ADD_AI_MODEL",
      details: {
        provider: data.providerId,
        model: candidate.id,
        compatibility: compatibility.status,
        generator_compatible: compatibility.generatorCompatible,
        quality_check_compatible: compatibility.qualityCheckCompatible,
      },
    });
    if (auditError) console.error("[admin] AI model add audit failed", auditError.message);

    return {
      ok: true,
      id: (inserted as any).id as string,
      model: (inserted as any).provider_model_id as string,
      compatibility,
    };
  });

const healthModelInput = z.object({
  id: z.string().uuid(),
});

type HealthState = "healthy" | "degraded" | "failing";

const HEALTH_PROBE_TIMEOUT_MS = 20_000;
const PROVIDER_HEALTH_CONCURRENCY = 2;

async function withHealthProbeTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("runtime_probe_timeout")),
          HEALTH_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function hadConsecutiveFailure(model: any): boolean {
  if (!model.last_failure_at) return false;
  if (!model.last_success_at) return true;
  return new Date(model.last_failure_at).getTime() > new Date(model.last_success_at).getTime();
}

async function runInstalledModelRuntimeProbe(
  model: any,
): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  try {
    const { modelCaller } = await import("@/lib/ai-provider.server");
    const call = modelCaller(String(model.provider_model_id), String(model.provider));
    const result = await withHealthProbeTimeout(
      call({
        system: "You are a PromptBeats health check. Return only a tiny JSON object.",
        prompt: 'Return exactly {"ok":true}.',
        maxTokens: 64,
        reasoningEffort:
          model.generator_reasoning_effort ?? model.quality_check_reasoning_effort ?? undefined,
      }),
    );
    if (result.stopReason !== "end_turn") {
      return { ok: false, errorCode: "incomplete_runtime_response" };
    }
    const text = result.text?.trim();
    if (!text) return { ok: false, errorCode: "empty_runtime_response" };

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, errorCode: "invalid_runtime_probe_json" };
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      (payload as { ok?: unknown }).ok !== true
    ) {
      return { ok: false, errorCode: "invalid_runtime_probe_payload" };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_probe_failed";
    return { ok: false, errorCode: message.slice(0, 160) };
  }
}

async function evaluateInstalledModelHealth(
  model: any,
  discovered: { deprecated: boolean } | null,
  discoveryAvailable: boolean,
): Promise<{ healthStatus: HealthState; success: boolean; errorCode: string | null }> {
  const runtime = await runInstalledModelRuntimeProbe(model);
  if (!runtime.ok) {
    return {
      healthStatus: hadConsecutiveFailure(model) ? "failing" : "degraded",
      success: false,
      errorCode: runtime.errorCode,
    };
  }

  if (!discoveryAvailable) {
    return {
      healthStatus: "degraded",
      success: true,
      errorCode: "provider_discovery_unavailable",
    };
  }

  if (!discovered) {
    return {
      healthStatus: "degraded",
      success: true,
      errorCode: "not_listed_by_provider",
    };
  }

  return {
    healthStatus: "healthy",
    success: true,
    errorCode: null,
  };
}

export const recheckAdminAiModelHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => healthModelInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("AI model not found.");

    const model = row as any;
    const providerId = providerIdSchema.safeParse(model.provider);
    const now = new Date().toISOString();

    if (!providerId.success) {
      await supabaseAdmin
        .from("ai_models" as never)
        .update({
          last_checked_at: now,
          last_failure_at: now,
          last_error_code: "unsupported_provider",
          health_status: "degraded",
          updated_at: now,
        } as never)
        .eq("id", data.id);
      return { ok: true, healthStatus: "degraded" as const, listed: null };
    }

    const installed = await readInstalledForDiscovery(supabaseAdmin);
    let discoveryAvailable = false;
    let discovered: any = null;

    try {
      const { discoverProviderModels } = await import("@/lib/ai-provider-registry.server");
      const discovery = await discoverProviderModels(providerId.data, installed);
      discoveryAvailable = true;
      discovered =
        discovery.models.find((candidate) => candidate.id === model.provider_model_id) ?? null;
    } catch (error) {
      console.warn("[admin] provider discovery unavailable during model health check", error);
    }

    const health = await evaluateInstalledModelHealth(model, discovered, discoveryAvailable);

    await supabaseAdmin
      .from("ai_models" as never)
      .update({
        ...(discovered ? { deprecated: discovered.deprecated === true } : {}),
        last_checked_at: now,
        ...(health.success ? { last_success_at: now } : { last_failure_at: now }),
        last_error_code: health.errorCode,
        health_status: health.healthStatus,
        updated_at: now,
      } as never)
      .eq("id", data.id);

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "UPDATE_AI_MODEL",
      details: {
        operation: "health_recheck",
        model: model.provider_model_id,
        provider: model.provider,
        listed: discoveryAvailable ? Boolean(discovered) : null,
        runtime_probe: health.success ? "passed" : "failed",
        health_status: health.healthStatus,
        error_code: health.errorCode,
      },
    });
    if (auditError) console.error("[admin] AI model health audit failed", auditError.message);

    return {
      ok: true,
      healthStatus: health.healthStatus,
      listed: discoveryAvailable ? Boolean(discovered) : null,
    };
  });

const healthProviderInput = z.object({
  providerId: providerIdSchema,
});

export const recheckAdminAiProviderHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => healthProviderInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select("*")
      .eq("provider", data.providerId);
    if (error) throw new Error("Could not read installed provider models.");

    const providerModels = (rows ?? []) as any[];
    if (!providerModels.length)
      return { ok: true, checked: 0, healthy: 0, degraded: 0, failing: 0 };

    const installed = await readInstalledForDiscovery(supabaseAdmin);
    const now = new Date().toISOString();
    let discoveryAvailable = false;
    let discoveredModels: any[] = [];

    try {
      const { discoverProviderModels } = await import("@/lib/ai-provider-registry.server");
      const discovery = await discoverProviderModels(data.providerId, installed);
      discoveryAvailable = true;
      discoveredModels = discovery.models;
    } catch (error) {
      console.warn("[admin] provider discovery unavailable during provider health check", error);
    }

    let healthy = 0;
    let degraded = 0;
    let failing = 0;

    for (let start = 0; start < providerModels.length; start += PROVIDER_HEALTH_CONCURRENCY) {
      const batch = providerModels.slice(start, start + PROVIDER_HEALTH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (model) => {
          const discovered = discoveryAvailable
            ? (discoveredModels.find((candidate) => candidate.id === model.provider_model_id) ??
              null)
            : null;
          const health = await evaluateInstalledModelHealth(model, discovered, discoveryAvailable);

          await supabaseAdmin
            .from("ai_models" as never)
            .update({
              ...(discovered ? { deprecated: discovered.deprecated === true } : {}),
              last_checked_at: now,
              ...(health.success ? { last_success_at: now } : { last_failure_at: now }),
              last_error_code: health.errorCode,
              health_status: health.healthStatus,
              updated_at: now,
            } as never)
            .eq("id", model.id);

          return health.healthStatus;
        }),
      );

      for (const healthStatus of results) {
        if (healthStatus === "healthy") healthy += 1;
        else if (healthStatus === "failing") failing += 1;
        else degraded += 1;
      }
    }

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "UPDATE_AI_MODEL",
      details: {
        operation: "provider_health_recheck",
        provider: data.providerId,
        checked: providerModels.length,
        healthy,
        degraded,
        failing,
        discovery_available: discoveryAvailable,
      },
    });
    if (auditError) console.error("[admin] AI provider health audit failed", auditError.message);

    return { ok: true, checked: providerModels.length, healthy, degraded, failing };
  });
