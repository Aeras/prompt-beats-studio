import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compatibleUtcDateTimePattern } from "@/lib/validation-datetime";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiProviderId, DiscoveredProviderModel } from "@/lib/ai-provider-registry.server";

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

const checkOneInput = z.object({ id: z.string().guid() });
const saveSourceInput = z.object({
  id: z.string().guid(),
  pricingSource: z
    .enum(["provider_metadata", "official_docs", "verified_catalog", "unverified"])
    .nullable(),
  pricingSourceUrl: z.string().url().max(1000).nullable(),
  pricingCheckedAt: z.string().regex(compatibleUtcDateTimePattern).nullable(),
});

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_admin_level");
  if (error || data !== true) throw new Error("Not allowed");
}

type PricingValues = {
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  cacheWritePricePerMillion: number | null;
};

type PricingSource = "provider_metadata" | "official_docs" | "verified_catalog" | "unverified";

type PricingResolution = PricingValues & {
  status: "verified" | "partial" | "unverified";
  source: PricingSource;
  sourceUrl: string | null;
  checkedAt: string;
  note: string;
};

const OFFICIAL_PRICING_URLS: Partial<Record<AiProviderId, string>> = {
  openai: "https://developers.openai.com/api/docs/pricing",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing",
  anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
  xai: "https://docs.x.ai/developers/models",
};

function officialPricingUrl(provider: AiProviderId, modelId: string) {
  if (provider === "xai" && /^grok-[a-z0-9.-]+$/i.test(modelId)) {
    return `https://docs.x.ai/developers/models/${encodeURIComponent(modelId)}`;
  }
  return OFFICIAL_PRICING_URLS[provider] ?? null;
}

// Reviewed fallback values are only used when live official documentation cannot
// be parsed reliably. The response is explicitly labelled verified_catalog.
const VERIFIED_PRICING_CATALOG: Record<string, PricingValues> = {
  "gemini-3-flash-preview": {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 3,
    cachedInputPricePerMillion: 0.05,
    cacheWritePricePerMillion: null,
  },
  "gemini-3.6-flash": {
    inputPricePerMillion: 0.75,
    outputPricePerMillion: 3.75,
    cachedInputPricePerMillion: 0.075,
    cacheWritePricePerMillion: null,
  },
  "gemini-3.8-flash": {
    inputPricePerMillion: 0.75,
    outputPricePerMillion: 3.75,
    cachedInputPricePerMillion: 0.075,
    cacheWritePricePerMillion: null,
  },
  "gemini-3.1-pro-preview": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 12,
    cachedInputPricePerMillion: 0.2,
    cacheWritePricePerMillion: null,
  },
  "claude-sonnet-5": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cachedInputPricePerMillion: 0.2,
    cacheWritePricePerMillion: 2.5,
  },
  "claude-opus-5": {
    inputPricePerMillion: 5,
    outputPricePerMillion: 25,
    cachedInputPricePerMillion: 0.5,
    cacheWritePricePerMillion: 6.25,
  },
  "claude-fable-5": {
    inputPricePerMillion: 10,
    outputPricePerMillion: 50,
    cachedInputPricePerMillion: 1,
    cacheWritePricePerMillion: 12.5,
  },
  "grok-4.6": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 6,
    cachedInputPricePerMillion: 0.5,
    cacheWritePricePerMillion: null,
  },
  "grok-4.7": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 6,
    cachedInputPricePerMillion: 0.5,
    cacheWritePricePerMillion: null,
  },
  "gpt-5.6-luna": {
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 1.2,
    cachedInputPricePerMillion: 0.02,
    cacheWritePricePerMillion: 0.25,
  },
  "gpt-5.6-terra": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 12,
    cachedInputPricePerMillion: 0.2,
    cacheWritePricePerMillion: 2.5,
  },
  "gpt-5.6-sol": {
    inputPricePerMillion: 4,
    outputPricePerMillion: 20,
    cachedInputPricePerMillion: 0.4,
    cacheWritePricePerMillion: 5,
  },
  "gpt-6-astra": {
    inputPricePerMillion: 10,
    outputPricePerMillion: 50,
    cachedInputPricePerMillion: 1,
    cacheWritePricePerMillion: 12.5,
  },
  "gpt-6-sol": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cachedInputPricePerMillion: 0.2,
    cacheWritePricePerMillion: 2.5,
  },
  "gpt-6-luna": {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.5,
    cachedInputPricePerMillion: 0.01,
    cacheWritePricePerMillion: 0.125,
  },
};

const pricingPageCache = new Map<string, { at: number; text: string }>();
const PRICING_PAGE_CACHE_MS = 10 * 60 * 1000;

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOfficialPricingText(url: string) {
  const cached = pricingPageCache.get(url);
  if (cached && Date.now() - cached.at < PRICING_PAGE_CACHE_MS) return cached.text;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`official pricing HTTP ${response.status}`);
    const text = htmlToText(await response.text());
    pricingPageCache.set(url, { at: Date.now(), text });
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function displayAlias(provider: AiProviderId, modelId: string) {
  if (provider === "anthropic") return modelId.replace(/^claude-/, "claude ").replace(/-/g, " ");
  if (provider === "gemini") return modelId.replace(/-/g, " ");
  return modelId;
}

function dollars(text: string) {
  return [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

function labelledDollar(text: string, label: RegExp) {
  const match = text.match(label);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function validPricing(values: PricingValues) {
  return (
    values.inputPricePerMillion != null &&
    values.outputPricePerMillion != null &&
    values.inputPricePerMillion >= 0 &&
    values.outputPricePerMillion > 0 &&
    values.outputPricePerMillion >= values.inputPricePerMillion
  );
}

function tryParseOfficialPricing(
  provider: AiProviderId,
  modelId: string,
  text: string,
): PricingValues | null {
  const lower = text.toLowerCase();
  const candidates = [modelId.toLowerCase(), displayAlias(provider, modelId).toLowerCase()];
  let index = -1;
  for (const candidate of candidates) {
    index = lower.indexOf(candidate);
    if (index >= 0) break;
  }
  if (index < 0) return null;

  const nearby = text.slice(Math.max(0, index - 300), index + 2200);

  if (provider === "xai") {
    const input = labelledDollar(nearby, /Input(?:\s+Tokens?)?\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
    const cached = labelledDollar(
      nearby,
      /Cached(?:\s+(?:input\s+)?tokens?)?\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    );
    const output = labelledDollar(nearby, /Output(?:\s+Tokens?)?\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
    const parsed = {
      inputPricePerMillion: input,
      cachedInputPricePerMillion: cached,
      outputPricePerMillion: output,
      cacheWritePricePerMillion: null,
    };
    if (validPricing(parsed)) return parsed;
  }

  const values = dollars(nearby);
  if (provider === "openai" && values.length >= 4) {
    const parsed = {
      inputPricePerMillion: values[0]!,
      cachedInputPricePerMillion: values[1]!,
      cacheWritePricePerMillion: values[2]!,
      outputPricePerMillion: values[3]!,
    };
    return validPricing(parsed) ? parsed : null;
  }

  if (provider === "xai" && values.length >= 3) {
    const parsed = {
      inputPricePerMillion: values[0]!,
      cachedInputPricePerMillion: values[1]!,
      outputPricePerMillion: values[2]!,
      cacheWritePricePerMillion: null,
    };
    return validPricing(parsed) ? parsed : null;
  }

  if ((provider === "gemini" || provider === "anthropic") && values.length >= 2) {
    const parsed = {
      inputPricePerMillion: values[0]!,
      outputPricePerMillion: values[1]!,
      cachedInputPricePerMillion: values.length >= 3 ? values[2]! : null,
      cacheWritePricePerMillion: values.length >= 4 ? values[3]! : null,
    };
    return validPricing(parsed) ? parsed : null;
  }
  return null;
}

async function resolvePricing(provider: AiProviderId, modelId: string): Promise<PricingResolution> {
  const checkedAt = new Date().toISOString();
  const sourceUrl = officialPricingUrl(provider, modelId);
  if (sourceUrl) {
    try {
      const page = await fetchOfficialPricingText(sourceUrl);
      const parsed = tryParseOfficialPricing(provider, modelId, page);
      if (parsed) {
        return {
          ...parsed,
          status: "verified",
          source: "official_docs",
          sourceUrl,
          checkedAt,
          note: "Pricing parsed from the provider's official pricing documentation.",
        };
      }
    } catch (error) {
      console.warn("[ai-model-refresh] official pricing lookup unavailable", {
        provider,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const fallback = VERIFIED_PRICING_CATALOG[modelId];
  if (fallback) {
    return {
      ...fallback,
      status: "verified",
      source: "verified_catalog",
      sourceUrl,
      checkedAt,
      note: "Live official-doc parsing was unavailable or inconclusive; values came from PromptBeats' reviewed provider-pricing catalog.",
    };
  }

  return {
    inputPricePerMillion: null,
    outputPricePerMillion: null,
    cachedInputPricePerMillion: null,
    cacheWritePricePerMillion: null,
    status: "unverified",
    source: "unverified",
    sourceUrl,
    checkedAt,
    note: "No reliable pricing could be verified. Existing database values should be left unchanged.",
  };
}

function providerFamily(provider: string, id: string) {
  const value = id.toLowerCase().replace(/-(preview|latest)$/g, "");
  if (provider === "openai") {
    const match = value.match(/^gpt-[0-9.]+-(luna|terra|sol|astra)(?:-|$)/);
    return match ? `gpt:${match[1]}` : value.replace(/[0-9.]+/g, "#");
  }
  if (provider === "anthropic") {
    const match = value.match(/^claude-(sonnet|opus|fable|haiku)-/);
    return match ? `claude:${match[1]}` : value.replace(/[0-9]+/g, "#");
  }
  if (provider === "gemini") {
    const match = value.match(/^gemini-[0-9.]+-(flash(?:-lite)?|pro)/);
    return match ? `gemini:${match[1]}` : value.replace(/[0-9.]+/g, "#");
  }
  if (provider === "xai")
    return value.startsWith("grok-") ? "grok" : value.replace(/[0-9.]+/g, "#");
  return value.replace(/[0-9]+(?:\.[0-9]+)*/g, "#");
}

function versionVector(id: string) {
  return (id.match(/\d+(?:\.\d+)?/g) ?? []).flatMap((part) => part.split(".").map(Number));
}

function compareVersion(a: string, b: string) {
  const av = versionVector(a);
  const bv = versionVector(b);
  const length = Math.max(av.length, bv.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function findLikelySuccessors(
  provider: string,
  installedId: string,
  discovered: DiscoveredProviderModel[],
) {
  const family = providerFamily(provider, installedId);
  return discovered
    .filter(
      (candidate) =>
        !candidate.installed &&
        !candidate.deprecated &&
        providerFamily(provider, candidate.id) === family &&
        compareVersion(candidate.id, installedId) > 0,
    )
    .sort((a, b) => compareVersion(b.id, a.id));
}

function differentNumber(a: unknown, b: number | null) {
  const current = a == null ? null : Number(a);
  if (current == null && b == null) return false;
  return current !== b;
}

async function inspectModel(
  row: any,
  installed: Array<{ provider: string; providerModelId: string }>,
) {
  const provider = providerIdSchema.parse(row.provider);
  const { discoverProviderModels } = await import("@/lib/ai-provider-registry.server");
  const discovery = await discoverProviderModels(provider, installed);
  const discovered =
    discovery.models.find((candidate) => candidate.id === row.provider_model_id) ?? null;
  const pricing = await resolvePricing(provider, String(row.provider_model_id));
  const successors = findLikelySuccessors(
    provider,
    String(row.provider_model_id),
    discovery.models,
  ).slice(0, 3);
  const changes: Array<{
    field: string;
    current: string | number | boolean | null;
    suggested: string | number | boolean | null;
  }> = [];

  if (discovered?.name && discovered.name !== row.display_name)
    changes.push({ field: "displayName", current: row.display_name, suggested: discovered.name });
  if (discovered?.contextWindow != null && discovered.contextWindow !== row.context_window)
    changes.push({
      field: "contextWindow",
      current: row.context_window,
      suggested: discovered.contextWindow,
    });
  if (discovered?.deprecated === true && row.deprecated !== true)
    changes.push({ field: "deprecated", current: Boolean(row.deprecated), suggested: true });

  if (pricing.status === "verified") {
    if (differentNumber(row.input_price_per_million, pricing.inputPricePerMillion))
      changes.push({
        field: "inputPricePerMillion",
        current: row.input_price_per_million == null ? null : Number(row.input_price_per_million),
        suggested: pricing.inputPricePerMillion,
      });
    if (differentNumber(row.output_price_per_million, pricing.outputPricePerMillion))
      changes.push({
        field: "outputPricePerMillion",
        current: row.output_price_per_million == null ? null : Number(row.output_price_per_million),
        suggested: pricing.outputPricePerMillion,
      });
    if (differentNumber(row.cached_input_price_per_million, pricing.cachedInputPricePerMillion))
      changes.push({
        field: "cachedInputPricePerMillion",
        current:
          row.cached_input_price_per_million == null
            ? null
            : Number(row.cached_input_price_per_million),
        suggested: pricing.cachedInputPricePerMillion,
      });
    if (differentNumber(row.cache_write_price_per_million, pricing.cacheWritePricePerMillion))
      changes.push({
        field: "cacheWritePricePerMillion",
        current:
          row.cache_write_price_per_million == null
            ? null
            : Number(row.cache_write_price_per_million),
        suggested: pricing.cacheWritePricePerMillion,
      });
  }

  return {
    id: String(row.id),
    provider,
    providerModelId: String(row.provider_model_id),
    displayName: String(row.display_name),
    available: Boolean(discovered),
    discoveredName: discovered?.name ?? null,
    contextWindow: discovered?.contextWindow ?? null,
    deprecated: discovered?.deprecated ?? Boolean(row.deprecated),
    pricing,
    changes,
    likelySuccessors: successors.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      contextWindow: candidate.contextWindow,
    })),
  };
}

export const checkAdminAiModelData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkOneInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("AI model not found.");
    const { data: installedRows, error: installedError } = await supabaseAdmin
      .from("ai_models" as never)
      .select("provider,provider_model_id");
    if (installedError) throw new Error("Could not read installed AI models.");
    const installed = ((installedRows ?? []) as any[]).map((item) => ({
      provider: String(item.provider),
      providerModelId: String(item.provider_model_id),
    }));
    return inspectModel(row, installed);
  });

export const checkAllAdminAiModelsForUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select("*")
      .order("provider", { ascending: true });
    if (error) throw new Error("Could not read installed AI models.");
    const allRows = (rows ?? []) as any[];
    const installed = allRows.map((item) => ({
      provider: String(item.provider),
      providerModelId: String(item.provider_model_id),
    }));
    const detected = new Set(
      (await import("@/lib/ai-provider-registry.server"))
        .getDetectedAiProviders()
        .map((provider) => provider.id),
    );
    const reports = [] as any[];

    for (const row of allRows) {
      if (!detected.has(String(row.provider) as AiProviderId)) {
        reports.push({
          id: String(row.id),
          provider: String(row.provider),
          providerModelId: String(row.provider_model_id),
          displayName: String(row.display_name),
          available: null,
          changes: [],
          likelySuccessors: [],
          pricing: {
            status: "unverified",
            source: "unverified",
            sourceUrl: null,
            checkedAt: new Date().toISOString(),
            note: "Provider credentials are not configured for this runtime.",
          },
          error: "provider_not_configured",
        });
        continue;
      }
      try {
        reports.push({ ...(await inspectModel(row, installed)), error: null });
      } catch (error) {
        reports.push({
          id: String(row.id),
          provider: String(row.provider),
          providerModelId: String(row.provider_model_id),
          displayName: String(row.display_name),
          available: null,
          changes: [],
          likelySuccessors: [],
          pricing: {
            status: "unverified",
            source: "unverified",
            sourceUrl: officialPricingUrl(
              String(row.provider) as AiProviderId,
              String(row.provider_model_id),
            ),
            checkedAt: new Date().toISOString(),
            note: "Check failed.",
          },
          error: error instanceof Error ? error.message.slice(0, 300) : "check_failed",
        });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      reports,
      summary: {
        total: reports.length,
        upToDate: reports.filter(
          (report) =>
            !report.error && report.changes.length === 0 && report.likelySuccessors.length === 0,
        ).length,
        changed: reports.filter((report) => report.changes.length > 0).length,
        newerVersion: reports.filter((report) => report.likelySuccessors.length > 0).length,
        unavailable: reports.filter((report) => report.available === false).length,
        failed: reports.filter((report) => Boolean(report.error)).length,
      },
    };
  });

export const saveAdminAiModelVerificationSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSourceInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ai_models" as never)
      .update({
        pricing_source: data.pricingSource,
        pricing_source_url: data.pricingSourceUrl,
        pricing_checked_at: data.pricingCheckedAt,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
