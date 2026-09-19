export type AiProviderId =
  | "openai" | "gemini" | "anthropic" | "xai" | "deepseek" | "mistral" | "groq"
  | "openrouter" | "together" | "fireworks" | "cerebras" | "cohere" | "nvidia";

export type ProviderRegistryEntry = {
  id: AiProviderId;
  label: string;
  secretNames: readonly string[];
  discoveryUrl: string;
  auth: "bearer" | "x-api-key" | "gemini-query";
  apiDialect: "openai-compatible" | "gemini" | "anthropic" | "cohere";
};

export const AI_PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  { id: "openai", label: "OpenAI", secretNames: ["OPENAI_API_KEY"], discoveryUrl: "https://api.openai.com/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "gemini", label: "Google Gemini", secretNames: ["GEMINI_API_KEY"], discoveryUrl: "https://generativelanguage.googleapis.com/v1beta/models", auth: "gemini-query", apiDialect: "gemini" },
  { id: "anthropic", label: "Anthropic", secretNames: ["ANTHROPIC_API_KEY"], discoveryUrl: "https://api.anthropic.com/v1/models", auth: "x-api-key", apiDialect: "anthropic" },
  { id: "xai", label: "xAI", secretNames: ["XAI_API_KEY"], discoveryUrl: "https://api.x.ai/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "deepseek", label: "DeepSeek", secretNames: ["DEEPSEEK_API_KEY"], discoveryUrl: "https://api.deepseek.com/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "mistral", label: "Mistral AI", secretNames: ["MISTRAL_API_KEY"], discoveryUrl: "https://api.mistral.ai/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "groq", label: "Groq", secretNames: ["GROQ_API_KEY"], discoveryUrl: "https://api.groq.com/openai/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "openrouter", label: "OpenRouter", secretNames: ["OPENROUTER_API_KEY"], discoveryUrl: "https://openrouter.ai/api/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "together", label: "Together AI", secretNames: ["TOGETHER_API_KEY"], discoveryUrl: "https://api.together.xyz/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "fireworks", label: "Fireworks AI", secretNames: ["FIREWORKS_API_KEY"], discoveryUrl: "https://api.fireworks.ai/inference/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "cerebras", label: "Cerebras", secretNames: ["CEREBRAS_API_KEY"], discoveryUrl: "https://api.cerebras.ai/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
  { id: "cohere", label: "Cohere", secretNames: ["COHERE_API_KEY"], discoveryUrl: "https://api.cohere.com/v1/models", auth: "bearer", apiDialect: "cohere" },
  { id: "nvidia", label: "NVIDIA NIM", secretNames: ["NVIDIA_API_KEY"], discoveryUrl: "https://integrate.api.nvidia.com/v1/models", auth: "bearer", apiDialect: "openai-compatible" },
] as const;

export type DetectedAiProvider = { id: AiProviderId; label: string };
export type DiscoveredProviderModel = {
  id: string;
  name: string;
  ownedBy: string | null;
  contextWindow: number | null;
  deprecated: boolean;
  installed: boolean;
};

export function getDetectedAiProviders(): DetectedAiProvider[] {
  return AI_PROVIDER_REGISTRY
    .filter((provider) => provider.secretNames.every((name) => Boolean(process.env[name]?.trim())))
    .map(({ id, label }) => ({ id, label }));
}

function looksLikeGenerativeTextModel(id: string, metadata?: Record<string, unknown>): boolean {
  const value = id.toLowerCase();
  const excluded = [
    "embedding", "embed-", "text-embedding", "rerank", "moderation", "whisper",
    "transcribe", "tts", "speech", "audio", "image", "imagen", "veo", "video",
    "guard", "safety", "ocr", "robotics",
  ];
  if (excluded.some((token) => value.includes(token))) return false;
  const output = metadata?.["output_modalities"];
  if (Array.isArray(output) && output.length && !output.includes("text")) return false;
  return true;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeModels(
  provider: ProviderRegistryEntry,
  payload: any,
  installed: Set<string>,
): DiscoveredProviderModel[] {
  let rows: any[] = [];
  if (provider.apiDialect === "gemini") rows = Array.isArray(payload?.models) ? payload.models : [];
  else if (provider.apiDialect === "cohere") rows = Array.isArray(payload?.models) ? payload.models : [];
  else rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows.flatMap((row) => {
    const rawId =
      provider.apiDialect === "gemini"
        ? String(row?.name ?? "").replace(/^models\//, "")
        : provider.apiDialect === "cohere"
          ? String(row?.name ?? "")
          : String(row?.id ?? row?.name ?? "");
    if (!rawId) return [];

    if (provider.apiDialect === "gemini") {
      const methods = Array.isArray(row?.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
      if (methods.length && !methods.includes("generateContent")) return [];
    }

    const meta = row?.architecture && typeof row.architecture === "object"
      ? row.architecture as Record<string, unknown>
      : undefined;
    if (!looksLikeGenerativeTextModel(rawId, meta)) return [];

    const name = String(row?.displayName ?? row?.display_name ?? row?.name ?? rawId).replace(/^models\//, "");
    return [{
      id: rawId,
      name,
      ownedBy: row?.owned_by == null ? null : String(row.owned_by),
      contextWindow: asNumber(row?.context_length) ?? asNumber(row?.contextWindow) ?? asNumber(row?.context_length_tokens),
      deprecated: row?.is_deprecated === true || row?.deprecated === true,
      installed: installed.has(`${provider.id}:${rawId}`),
    }];
  })
  .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
  .sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverProviderModels(
  providerId: AiProviderId,
  installedModels: Array<{ provider: string; providerModelId: string }>,
): Promise<{ provider: DetectedAiProvider; models: DiscoveredProviderModel[] }> {
  const provider = AI_PROVIDER_REGISTRY.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("Unknown AI provider.");
  if (!provider.secretNames.every((name) => Boolean(process.env[name]?.trim()))) {
    throw new Error("Provider credentials are not configured.");
  }

  const secretName = provider.secretNames[0];
  if (!secretName) throw new Error("Provider credentials are not configured.");
  const apiKey = process.env[secretName]?.trim();
  if (!apiKey) throw new Error("Provider credentials are not configured.");

  const headers: Record<string, string> = { accept: "application/json" };
  let url = provider.discoveryUrl;
  if (provider.auth === "bearer") headers.authorization = `Bearer ${apiKey}`;
  if (provider.auth === "x-api-key") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  if (provider.auth === "gemini-query") {
    headers["x-goog-api-key"] = apiKey;
    url += "?pageSize=1000";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Provider check timed out.");
    throw new Error("Could not connect to the provider.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`[ai-provider-discovery] ${provider.id} models request failed (${response.status})`, body.slice(0, 500));
    if (response.status === 401 || response.status === 403) throw new Error("Provider authentication failed.");
    if (response.status === 429) throw new Error("Provider rate limit reached. Try again later.");
    throw new Error(`Provider check failed (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  const installed = new Set(installedModels.map((model) => `${model.provider}:${model.providerModelId}`));
  return { provider: { id: provider.id, label: provider.label }, models: normalizeModels(provider, payload, installed) };
}
