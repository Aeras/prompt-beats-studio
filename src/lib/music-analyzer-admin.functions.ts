import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const SETTINGS_KEY = "song_analyzer_extra_models";

const BUILTIN_ANALYZER_MODELS = [
  { provider: "gemini", providerModelId: "gemini-3.8-flash" },
  { provider: "gemini", providerModelId: "gemini-3.1-pro-preview" },
  { provider: "gemini", providerModelId: "gemini-4-argon" },
  { provider: "openai", providerModelId: "gpt-audio-1.5" },
] as const;

function installedAnalyzerModels(extras: ExtraAnalyzerModel[]) {
  return [
    ...BUILTIN_ANALYZER_MODELS,
    ...extras.map((model) => ({
      provider: model.provider,
      providerModelId: model.id,
    })),
  ];
}

type ExtraAnalyzerModel = {
  provider: string;
  id: string;
  label: string;
};

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_admin_level");
  if (error || data !== true) throw new Error("Not allowed");
}

async function readExtraModels(supabaseAdmin: any): Promise<ExtraAnalyzerModel[]> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error("Could not read Music Analyzer model settings.");
  const raw = (data as any)?.value?.models;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: any) => {
    const provider = typeof item?.provider === "string" ? item.provider.trim() : "";
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    return provider && id ? [{ provider, id, label: label || id }] : [];
  });
}

async function writeExtraModels(supabaseAdmin: any, models: ExtraAnalyzerModel[]) {
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({
      key: SETTINGS_KEY,
      value: { models },
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error("Could not save Music Analyzer model settings.");
}

export const getMusicAnalyzerAdminModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readAnalyzerV2AdminOptions } = await import("./song-analyzer-v2-admin-options.server");
    return { models: await readExtraModels(supabaseAdmin), v2Options: await readAnalyzerV2AdminOptions() };
  });

const providerCheckTimestamps = new Map<string, number>();

export const checkMusicAnalyzerProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ providerId: providerIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);

    const rateKey = context.userId + ":" + data.providerId;
    const now = Date.now();
    const previous = providerCheckTimestamps.get(rateKey) ?? 0;
    if (now - previous < 5_000) {
      throw new Error("Please wait a few seconds before checking this provider again.");
    }
    providerCheckTimestamps.set(rateKey, now);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const extras = await readExtraModels(supabaseAdmin);
    const installed = installedAnalyzerModels(extras);

    const { discoverProviderAudioTextModels } =
      await import("@/lib/ai-provider-registry.server");
    return discoverProviderAudioTextModels(data.providerId, installed);
  });

const addInput = z.object({
  providerId: providerIdSchema,
  modelId: z.string().trim().min(1).max(240),
});

export const addMusicAnalyzerModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const extras = await readExtraModels(supabaseAdmin);
    if (extras.some((model) => model.provider === data.providerId && model.id === data.modelId)) {
      return { ok: true, alreadyInstalled: true };
    }

    const installed = installedAnalyzerModels(extras);
    const { discoverProviderAudioTextModels } =
      await import("@/lib/ai-provider-registry.server");
    const discovery = await discoverProviderAudioTextModels(data.providerId, installed);
    const candidate = discovery.candidates.find(
      (model) => model.id === data.modelId && !model.deprecated && !model.installed,
    );
    if (!candidate) {
      throw new Error("This provider does not explicitly advertise this model as audio input → text output.");
    }
    if (!candidate.runtimeSupported) {
      throw new Error(candidate.runtimeNote);
    }

    // Ensure usage/cost logging has a registry row even though this model is
    // intentionally not enabled for the general Generator or Quality Check.
    // PromptBeats currently treats provider_model_id as globally unique in
    // runtime selection, so reject a cross-provider collision explicitly.
    const { data: existingRegistry, error: existingRegistryError } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id,provider")
      .eq("provider_model_id", candidate.id)
      .maybeSingle();
    if (existingRegistryError) {
      throw new Error("Could not validate the Music Analyzer model registry.");
    }
    if (existingRegistry && String((existingRegistry as any).provider) !== data.providerId) {
      throw new Error("That model ID is already registered under a different provider.");
    }

    if (!existingRegistry) {
      const nowIso = new Date().toISOString();
      const { error: registryError } = await supabaseAdmin.from("ai_models" as never).insert({
        provider: data.providerId,
        provider_model_id: candidate.id,
        display_name: candidate.name || candidate.id,
        status: "testing",
        access_policy: "admin_only",
        generator_compatible: false,
        generator_enabled: false,
        generator_reasoning_effort: null,
        quality_check_compatible: false,
        quality_check_enabled: false,
        quality_check_reasoning_effort: null,
        structured_output_supported: null,
        reasoning_supported: null,
        usage_reporting_supported: null,
        context_window: candidate.contextWindow,
        pricing_status: "unknown",
        preview: false,
        deprecated: false,
        discovered_at: nowIso,
        last_checked_at: nowIso,
        health_status: "unknown",
        notes: "Added specifically for PromptBeats Music Analyzer after explicit audio-input/text-output discovery.",
        updated_at: nowIso,
      } as never);
      if (registryError) {
        throw new Error("Could not register the Music Analyzer model for usage tracking.");
      }
    }

    const next = [
      ...extras,
      {
        provider: data.providerId,
        id: candidate.id,
        label: candidate.name || candidate.id,
      },
    ];
    await writeExtraModels(supabaseAdmin, next);

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: null,
      action: "ADD_MUSIC_ANALYZER_MODEL",
      details: {
        provider: data.providerId,
        model: candidate.id,
        input_modalities: candidate.inputModalities,
        output_modalities: candidate.outputModalities,
      },
    });
    if (auditError) console.error("[music-analyzer-admin] audit failed", auditError.message);

    return {
      ok: true,
      alreadyInstalled: false,
      model: {
        provider: data.providerId,
        id: candidate.id,
        label: candidate.name || candidate.id,
      },
    };
  });

const v2InstalledInput = z.object({
  providerId: z.enum(["gemini", "openai", "openrouter"]),
  modelId: z.string().trim().min(1).max(240),
  enabled: z.boolean(),
});

/** Admin-only explicit experimental permission; never mutates Generator or Quality Check model flags. */
export const setInstalledAnalyzerV2Enabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => v2InstalledInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const extras = await readExtraModels(supabaseAdmin);
    const installed = extras.some((model) => model.provider === data.providerId && model.id === data.modelId);
    if (!installed) throw new Error("The selected model is not installed in Music Analyzer.");
    const { updateAnalyzerV2AdminOption } = await import("./song-analyzer-v2-admin-options.server");
    return updateAnalyzerV2AdminOption(data.providerId, data.modelId, data.enabled);
  });
