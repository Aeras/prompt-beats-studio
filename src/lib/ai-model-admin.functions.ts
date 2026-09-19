import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusSchema = z.enum(["testing", "enabled", "disabled", "deprecated", "archived"]);
const accessPolicySchema = z.enum(["admin_only", "selected_users", "all_users"]);
const reasoningSchema = z.enum(["none", "low", "medium", "high", "xhigh", "max"]).nullable();
const pricingStatusSchema = z.enum(["verified", "unknown", "outdated"]);

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_has_role", { _role: "admin" });
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
  inputPricePerMillion: row.input_price_per_million == null ? null : Number(row.input_price_per_million),
  outputPricePerMillion: row.output_price_per_million == null ? null : Number(row.output_price_per_million),
  cachedInputPricePerMillion: row.cached_input_price_per_million == null ? null : Number(row.cached_input_price_per_million),
  cacheWritePricePerMillion: row.cache_write_price_per_million == null ? null : Number(row.cache_write_price_per_million),
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
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data as { value?: { model?: string } } | null)?.value?.model ?? null;
}

export const getAdminAiModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows, error }, generatorDefault, qualityDefault] = await Promise.all([
      supabaseAdmin
        .from("ai_models" as never)
        .select("*")
        .order("provider", { ascending: true })
        .order("display_name", { ascending: true }),
      readDefaultModel(supabaseAdmin, "ai_generator_default_model"),
      readDefaultModel(supabaseAdmin, "ai_quality_check_default_model"),
    ]);
    if (error) throw new Error(error.message);
    return {
      models: ((rows ?? []) as any[]).map(mapRow),
      generatorDefault,
      qualityDefault,
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
    const [generatorDefault, qualityDefault] = await Promise.all([
      readDefaultModel(supabaseAdmin, "ai_generator_default_model"),
      readDefaultModel(supabaseAdmin, "ai_quality_check_default_model"),
    ]);

    const disablingGenerator =
      row.provider_model_id === generatorDefault &&
      (data.status !== "enabled" || !data.generatorEnabled || !row.generator_compatible);
    const disablingQuality =
      row.provider_model_id === qualityDefault &&
      (data.status !== "enabled" || !data.qualityCheckEnabled || !row.quality_check_compatible);

    if (disablingGenerator) throw new Error("Select another Generator default before disabling this model.");
    if (disablingQuality) throw new Error("Select another Quality Check default before disabling this model.");

    if (data.pricingStatus === "verified" && (data.inputPricePerMillion == null || data.outputPricePerMillion == null)) {
      throw new Error("Verified pricing requires both input and output prices.");
    }

    const pricingChanged =
      Number(row.input_price_per_million ?? NaN) !== Number(data.inputPricePerMillion ?? NaN) ||
      Number(row.output_price_per_million ?? NaN) !== Number(data.outputPricePerMillion ?? NaN) ||
      Number(row.cached_input_price_per_million ?? NaN) !== Number(data.cachedInputPricePerMillion ?? NaN) ||
      Number(row.cache_write_price_per_million ?? NaN) !== Number(data.cacheWritePricePerMillion ?? NaN) ||
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
  operation: z.enum(["generator", "quality_check"]),
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
      .select("id,provider_model_id,status,generator_compatible,generator_enabled,quality_check_compatible,quality_check_enabled")
      .eq("provider_model_id", data.model)
      .maybeSingle();
    if (error || !row) throw new Error("AI model not found.");

    const model = row as any;
    const valid = data.operation === "generator"
      ? model.status === "enabled" && model.generator_compatible === true && model.generator_enabled === true
      : model.status === "enabled" && model.quality_check_compatible === true && model.quality_check_enabled === true;
    if (!valid) throw new Error("That model is not eligible for this default.");

    const key = data.operation === "generator"
      ? "ai_generator_default_model"
      : "ai_quality_check_default_model";

    const { error: updateError } = await supabaseAdmin.from("app_settings").upsert({
      key,
      value: { registryId: model.id, model: model.provider_model_id },
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    } as never, { onConflict: "key" });
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
    const { discoverProviderModels, testProviderModelsCompatibility } = await import("@/lib/ai-provider-registry.server");
    const discovery = await discoverProviderModels(data.providerId, installed);
    const requested = new Set(data.modelIds);
    const candidates = discovery.models.filter((model) => requested.has(model.id) && !model.installed && !model.deprecated);
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
    const {
      discoverProviderModels,
      testSingleProviderModelCompatibility,
    } = await import("@/lib/ai-provider-registry.server");
    const discovery = await discoverProviderModels(data.providerId, installed);
    const candidate = discovery.models.find((model) => model.id === data.modelId && !model.installed && !model.deprecated);
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
    if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not add AI model.");

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

function healthFromCompatibility(status: string) {
  if (status === "compatible" || status === "generator_only" || status === "quality_check_only") {
    return { healthStatus: "healthy" as const, success: true, errorCode: null as string | null };
  }
  if (status === "inconclusive") {
    return { healthStatus: "degraded" as const, success: false, errorCode: "inconclusive" };
  }
  return { healthStatus: "failing" as const, success: false, errorCode: "compatibility_failed" };
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
      await supabaseAdmin.from("ai_models" as never).update({
        last_checked_at: now,
        last_failure_at: now,
        last_error_code: "unsupported_provider",
        health_status: "degraded",
        updated_at: now,
      } as never).eq("id", data.id);
      return { ok: true, healthStatus: "degraded" as const, listed: null, compatibility: null };
    }

    const installed = await readInstalledForDiscovery(supabaseAdmin);
    try {
      const {
        discoverProviderModels,
        testSingleProviderModelCompatibility,
      } = await import("@/lib/ai-provider-registry.server");

      const discovery = await discoverProviderModels(providerId.data, installed);
      const discovered = discovery.models.find((candidate) => candidate.id === model.provider_model_id) ?? null;

      if (!discovered) {
        await supabaseAdmin.from("ai_models" as never).update({
          last_checked_at: now,
          last_failure_at: now,
          last_error_code: "not_listed_by_provider",
          health_status: "degraded",
          updated_at: now,
        } as never).eq("id", data.id);
        return { ok: true, healthStatus: "degraded" as const, listed: false, compatibility: null };
      }

      const compatibility = await testSingleProviderModelCompatibility(providerId.data, {
        ...discovered,
        installed: false,
      });
      const health = healthFromCompatibility(compatibility.status);

      await supabaseAdmin.from("ai_models" as never).update({
        deprecated: discovered.deprecated === true,
        last_checked_at: now,
        ...(health.success
          ? { last_success_at: now, last_error_code: null }
          : { last_failure_at: now, last_error_code: health.errorCode }),
        health_status: health.healthStatus,
        updated_at: now,
      } as never).eq("id", data.id);

      const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
        admin_user_id: context.userId,
        target_user_id: null,
        action: "UPDATE_AI_MODEL",
        details: {
          operation: "health_recheck",
          model: model.provider_model_id,
          provider: model.provider,
          listed: true,
          compatibility: compatibility.status,
          health_status: health.healthStatus,
        },
      });
      if (auditError) console.error("[admin] AI model health audit failed", auditError.message);

      return {
        ok: true,
        healthStatus: health.healthStatus,
        listed: true,
        compatibility: compatibility.status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_check_failed";
      await supabaseAdmin.from("ai_models" as never).update({
        last_checked_at: now,
        last_failure_at: now,
        last_error_code: message.slice(0, 160),
        health_status: "degraded",
        updated_at: now,
      } as never).eq("id", data.id);
      return { ok: true, healthStatus: "degraded" as const, listed: null, compatibility: null };
    }
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
    if (!providerModels.length) return { ok: true, checked: 0, healthy: 0, degraded: 0, failing: 0 };

    const installed = await readInstalledForDiscovery(supabaseAdmin);
    const now = new Date().toISOString();

    try {
      const {
        discoverProviderModels,
        testSingleProviderModelCompatibility,
      } = await import("@/lib/ai-provider-registry.server");
      const discovery = await discoverProviderModels(data.providerId, installed);

      let healthy = 0;
      let degraded = 0;
      let failing = 0;

      for (const model of providerModels) {
        const discovered = discovery.models.find((candidate) => candidate.id === model.provider_model_id) ?? null;
        if (!discovered) {
          degraded += 1;
          await supabaseAdmin.from("ai_models" as never).update({
            last_checked_at: now,
            last_failure_at: now,
            last_error_code: "not_listed_by_provider",
            health_status: "degraded",
            updated_at: now,
          } as never).eq("id", model.id);
          continue;
        }

        const compatibility = await testSingleProviderModelCompatibility(data.providerId, {
          ...discovered,
          installed: false,
        });
        const health = healthFromCompatibility(compatibility.status);
        if (health.healthStatus === "healthy") healthy += 1;
        else if (health.healthStatus === "failing") failing += 1;
        else degraded += 1;

        await supabaseAdmin.from("ai_models" as never).update({
          deprecated: discovered.deprecated === true,
          last_checked_at: now,
          ...(health.success
            ? { last_success_at: now, last_error_code: null }
            : { last_failure_at: now, last_error_code: health.errorCode }),
          health_status: health.healthStatus,
          updated_at: now,
        } as never).eq("id", model.id);
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
        },
      });
      if (auditError) console.error("[admin] AI provider health audit failed", auditError.message);

      return { ok: true, checked: providerModels.length, healthy, degraded, failing };
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_check_failed";
      for (const model of providerModels) {
        await supabaseAdmin.from("ai_models" as never).update({
          last_checked_at: now,
          last_failure_at: now,
          last_error_code: message.slice(0, 160),
          health_status: "degraded",
          updated_at: now,
        } as never).eq("id", model.id);
      }
      return { ok: true, checked: providerModels.length, healthy: 0, degraded: providerModels.length, failing: 0 };
    }
  });
