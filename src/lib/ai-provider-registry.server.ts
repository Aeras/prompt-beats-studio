import { AiUsageUnavailableError } from "./global-ai-usage.server";
import { aiProviderFetch as fetch } from "./global-ai-usage.server";
export type AiProviderId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "xai"
  | "deepseek"
  | "mistral"
  | "groq"
  | "openrouter"
  | "together"
  | "fireworks"
  | "cerebras"
  | "cohere"
  | "nvidia";

export type ProviderRegistryEntry = {
  id: AiProviderId;
  label: string;
  secretNames: readonly string[];
  discoveryUrl: string;
  auth: "bearer" | "x-api-key" | "gemini-query";
  apiDialect: "openai-compatible" | "gemini" | "anthropic" | "cohere";
  compatibility:
    | { dialect: "openai-responses"; url: string }
    | { dialect: "openai-chat"; url: string; jsonMode: boolean }
    | { dialect: "gemini" }
    | { dialect: "anthropic"; url: string }
    | { dialect: "unsupported" };
};

export const AI_PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  {
    id: "openai",
    label: "OpenAI",
    secretNames: ["OPENAI_API_KEY"],
    discoveryUrl: "https://api.openai.com/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: { dialect: "openai-responses", url: "https://api.openai.com/v1/responses" },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    secretNames: ["GEMINI_API_KEY"],
    discoveryUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    auth: "gemini-query",
    apiDialect: "gemini",
    compatibility: { dialect: "gemini" },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    secretNames: ["ANTHROPIC_API_KEY"],
    discoveryUrl: "https://api.anthropic.com/v1/models",
    auth: "x-api-key",
    apiDialect: "anthropic",
    compatibility: { dialect: "anthropic", url: "https://api.anthropic.com/v1/messages" },
  },
  {
    id: "xai",
    label: "xAI",
    secretNames: ["XAI_API_KEY"],
    discoveryUrl: "https://api.x.ai/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.x.ai/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    secretNames: ["DEEPSEEK_API_KEY"],
    discoveryUrl: "https://api.deepseek.com/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.deepseek.com/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "mistral",
    label: "Mistral AI",
    secretNames: ["MISTRAL_API_KEY"],
    discoveryUrl: "https://api.mistral.ai/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.mistral.ai/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "groq",
    label: "Groq",
    secretNames: ["GROQ_API_KEY"],
    discoveryUrl: "https://api.groq.com/openai/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.groq.com/openai/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    secretNames: ["OPENROUTER_API_KEY"],
    discoveryUrl: "https://openrouter.ai/api/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://openrouter.ai/api/v1/chat/completions",
      jsonMode: false,
    },
  },
  {
    id: "together",
    label: "Together AI",
    secretNames: ["TOGETHER_API_KEY"],
    discoveryUrl: "https://api.together.xyz/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.together.xyz/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    secretNames: ["FIREWORKS_API_KEY"],
    discoveryUrl: "https://api.fireworks.ai/inference/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.fireworks.ai/inference/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "cerebras",
    label: "Cerebras",
    secretNames: ["CEREBRAS_API_KEY"],
    discoveryUrl: "https://api.cerebras.ai/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://api.cerebras.ai/v1/chat/completions",
      jsonMode: true,
    },
  },
  {
    id: "cohere",
    label: "Cohere",
    secretNames: ["COHERE_API_KEY"],
    discoveryUrl: "https://api.cohere.com/v1/models",
    auth: "bearer",
    apiDialect: "cohere",
    compatibility: { dialect: "unsupported" },
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    secretNames: ["NVIDIA_API_KEY"],
    discoveryUrl: "https://integrate.api.nvidia.com/v1/models",
    auth: "bearer",
    apiDialect: "openai-compatible",
    compatibility: {
      dialect: "openai-chat",
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      jsonMode: true,
    },
  },
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
export type DiscoverySummary = {
  returned: number;
  candidates: number;
  installed: number;
  excluded: number;
};
export type CompatibilityStatus =
  "compatible" | "generator_only" | "quality_check_only" | "unsupported" | "inconclusive";
export type CompatibilityResult = {
  id: string;
  name: string;
  status: CompatibilityStatus;
  generatorCompatible: boolean;
  qualityCheckCompatible: boolean;
  generatorError?: string;
  qualityCheckError?: string;
  contextWindow: number | null;
  installed: boolean;
};

export function getDetectedAiProviders(): DetectedAiProvider[] {
  return AI_PROVIDER_REGISTRY.filter((provider) =>
    provider.secretNames.every((name) => Boolean(process.env[name]?.trim())),
  ).map(({ id, label }) => ({ id, label }));
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRows(provider: ProviderRegistryEntry, payload: any): any[] {
  if (provider.apiDialect === "gemini" || provider.apiDialect === "cohere") {
    return Array.isArray(payload?.models) ? payload.models : [];
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

/**
 * Normalize every model returned by the provider catalog.
 *
 * Discovery is intentionally capability-agnostic: the admin compatibility test is the
 * authority for whether a newly discovered model can be used by Generator and/or
 * Quality Check. Do not hide candidates here based on naming heuristics or provider
 * metadata, because new model families can otherwise disappear before they are tested.
 */
function normalizeModels(
  provider: ProviderRegistryEntry,
  rows: any[],
  installed: Set<string>,
): DiscoveredProviderModel[] {
  return rows
    .flatMap((row) => {
      const rawId =
        provider.apiDialect === "gemini"
          ? String(row?.name ?? "").replace(/^models\//, "")
          : provider.apiDialect === "cohere"
            ? String(row?.name ?? "")
            : String(row?.id ?? row?.name ?? "");
      if (!rawId) return [];

      const name = String(row?.displayName ?? row?.display_name ?? row?.name ?? rawId).replace(
        /^models\//,
        "",
      );
      return [
        {
          id: rawId,
          name,
          ownedBy: row?.owned_by == null ? null : String(row.owned_by),
          contextWindow:
            asNumber(row?.model_info?.context_window) ??
            asNumber(row?.context_length) ??
            asNumber(row?.contextWindow) ??
            asNumber(row?.context_length_tokens),
          deprecated: row?.is_deprecated === true || row?.deprecated === true,
          installed: installed.has(`${provider.id}:${rawId}`),
        },
      ];
    })
    .filter(
      (model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function providerSecret(provider: ProviderRegistryEntry): string {
  const secretName = provider.secretNames[0];
  const apiKey = secretName ? process.env[secretName]?.trim() : "";
  if (!apiKey) throw new Error("Provider credentials are not configured.");
  return apiKey;
}

export async function discoverProviderModels(
  providerId: AiProviderId,
  installedModels: Array<{ provider: string; providerModelId: string }>,
): Promise<{
  provider: DetectedAiProvider;
  summary: DiscoverySummary;
  models: DiscoveredProviderModel[];
}> {
  const provider = AI_PROVIDER_REGISTRY.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("Unknown AI provider.");
  if (!provider.secretNames.every((name) => Boolean(process.env[name]?.trim()))) {
    throw new Error("Provider credentials are not configured.");
  }

  const apiKey = providerSecret(provider);
  const headers: Record<string, string> = { accept: "application/json" };
  let url = provider.discoveryUrl;
  if (provider.auth === "bearer") headers["authorization"] = `Bearer ${apiKey}`;
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
    if (error instanceof AiUsageUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Provider check timed out.");
    throw new Error("Could not connect to the provider.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error(
      `[ai-provider-discovery] ${provider.id} models request failed (${response.status})`,
      { status: response.status },
    );
    if (response.status === 401 || response.status === 403)
      throw new Error("Provider authentication failed.");
    if (response.status === 429) throw new Error("Provider rate limit reached. Try again later.");
    throw new Error(`Provider check failed (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  const rows = getRows(provider, payload);
  const installedSet = new Set(
    installedModels.map((model) => `${model.provider}:${model.providerModelId}`),
  );
  const models = normalizeModels(provider, rows, installedSet);
  return {
    provider: { id: provider.id, label: provider.label },
    summary: {
      returned: rows.length,
      candidates: models.length,
      installed: models.filter((model) => model.installed).length,
      excluded: Math.max(0, rows.length - models.length),
    },
    models,
  };
}

export type DiscoveredAudioTextModel = {
  id: string;
  name: string;
  ownedBy: string | null;
  contextWindow: number | null;
  deprecated: boolean;
  installed: boolean;
  inputModalities: string[];
  outputModalities: string[];
  runtimeSupported: boolean;
  runtimeNote: string;
};

function normalizeModalities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).toLowerCase().trim()).filter(Boolean))];
}

function modelModalities(row: any) {
  const architecture =
    row?.architecture && typeof row.architecture === "object" ? row.architecture : {};
  let inputModalities = normalizeModalities(
    architecture?.input_modalities ??
      row?.input_modalities ??
      row?.inputModalities ??
      row?.modalities?.input,
  );
  let outputModalities = normalizeModalities(
    architecture?.output_modalities ??
      row?.output_modalities ??
      row?.outputModalities ??
      row?.modalities?.output,
  );

  const modality =
    typeof architecture?.modality === "string"
      ? architecture.modality.toLowerCase()
      : typeof row?.modality === "string"
        ? row.modality.toLowerCase()
        : "";
  if (modality.includes("->")) {
    const [input, output] = modality.split("->");
    if (!inputModalities.length && input) {
      inputModalities = input
        .split("+")
        .map((value: string) => value.trim())
        .filter(Boolean);
    }
    if (!outputModalities.length && output) {
      outputModalities = output
        .split("+")
        .map((value: string) => value.trim())
        .filter(Boolean);
    }
  }

  return { inputModalities, outputModalities };
}

/**
 * A provider-wide audio transport is NOT evidence that each discovered model
 * accepts PromptBeats V2's full-report, one-dispatch contract.
 * Keep the discovery list actionable only for reviewed V2 adapters.
 */
function audioAnalyzerRuntimeSupport(provider: ProviderRegistryEntry, modelId: string) {
  const gemini =
    provider.id === "gemini" &&
    ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-4-argon"].includes(modelId);
  const openai = provider.id === "openai" && modelId === "gpt-audio-1.5";
  const openrouter =
    provider.id === "openrouter" && ["openai/gpt-audio", "openai/gpt-audio-1.5"].includes(modelId);
  return {
    supported: gemini || openai || openrouter,
    note:
      gemini || openai || openrouter
        ? "Reviewed for the PromptBeats V2 single-call audio/full-report adapter. Live report success is not guaranteed by discovery."
        : "Audio → text catalogue capability alone does not establish compatibility with PromptBeats V2. This model needs a reviewed one-call MP3/full-report JSON contract before it can be enabled.",
  };
}

const AUDIO_TEXT_PROBE_WAV_BASE64 =
  "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";

const audioProbeCache = new Map<string, { value: boolean | null; checkedAt: number }>();

async function probeAudioTextCompatibility(
  provider: ProviderRegistryEntry,
  modelId: string,
  apiKey: string,
): Promise<boolean | null> {
  const cacheKey = provider.id + ":" + modelId;
  const cached = audioProbeCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 10 * 60_000) return cached.value;

  let response: Response;
  try {
    if (provider.id === "gemini") {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" +
          encodeURIComponent(modelId) +
          ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "audio/wav", data: AUDIO_TEXT_PROBE_WAV_BASE64 } },
                  { text: "Reply with OK." },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 8, temperature: 0 },
          }),
        },
      );
    } else if (provider.id === "openai") {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: modelId,
          modalities: ["text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Reply with OK." },
                {
                  type: "input_audio",
                  input_audio: { data: AUDIO_TEXT_PROBE_WAV_BASE64, format: "wav" },
                },
              ],
            },
          ],
          max_completion_tokens: 8,
        }),
      });
    } else {
      return null;
    }
  } catch {
    audioProbeCache.set(cacheKey, { value: null, checkedAt: Date.now() });
    return null;
  }

  const value = response.ok
    ? true
    : response.status === 401 ||
        response.status === 402 ||
        response.status === 403 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status === 429 ||
        response.status >= 500
      ? null
      : false;
  audioProbeCache.set(cacheKey, { value, checkedAt: Date.now() });
  return value;
}

/**
 * An explicitly triggered tiny billable transport probe, independent of discovery.
 * Passing this does not guarantee that the full V2 schema or musical analysis will succeed.
 */
export async function verifyInstalledAnalyzerAudioTransport(
  providerId: "gemini" | "openai" | "openrouter",
  modelId: string,
): Promise<"passed" | "failed" | "inconclusive"> {
  const provider = AI_PROVIDER_REGISTRY.find((entry) => entry.id === providerId);
  if (!provider) return "failed";
  const key = providerSecret(provider);
  if (!key) return "inconclusive";
  if (providerId === "openrouter") {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 128,
          provider: { allow_fallbacks: false },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Reply ONLY with valid JSON: {"audioReceived":true}. The attached WAV is test audio.',
                },
                {
                  type: "input_audio",
                  input_audio: { data: AUDIO_TEXT_PROBE_WAV_BASE64, format: "wav" },
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok)
        return [401, 402, 403, 408, 409, 429].includes(response.status) || response.status >= 500
          ? "inconclusive"
          : "failed";
      const payload = await response.json().catch(() => null);
      const raw = payload?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") return "failed";
      const parsed = JSON.parse(
        raw
          .trim()
          .replace(/^\x60\x60\x60(?:json)?\s*/i, "")
          .replace(/\s*\x60\x60\x60$/, ""),
      );
      return parsed?.audioReceived === true ? "passed" : "failed";
    } catch {
      return "inconclusive";
    }
  }
  const result = await probeAudioTextCompatibility(provider, modelId, key);
  return result === true ? "passed" : result === false ? "failed" : "inconclusive";
}

/**
 * Discovers audio-input → text-output models.
 *
 * Provider catalogs such as OpenRouter expose explicit modality metadata, so we use
 * it directly. Google Gemini and OpenAI catalogs do not reliably expose those
 * modalities for every model; for them we perform a tiny real audio request against
 * each plausible model instead of concluding "0 compatible" from missing metadata.
 */
export async function discoverProviderAudioTextModels(
  providerId: AiProviderId,
  installedModels: Array<{ provider: string; providerModelId: string }>,
): Promise<{
  provider: DetectedAiProvider;
  returned: number;
  candidates: DiscoveredAudioTextModel[];
  excludedWithoutExplicitModalities: number;
}> {
  const provider = AI_PROVIDER_REGISTRY.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("Unknown AI provider.");
  if (!provider.secretNames.every((name) => Boolean(process.env[name]?.trim()))) {
    throw new Error("Provider credentials are not configured.");
  }

  const apiKey = providerSecret(provider);
  const headers: Record<string, string> = { accept: "application/json" };
  let url = provider.discoveryUrl;
  if (provider.auth === "bearer") headers["authorization"] = "Bearer " + apiKey;
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
    if (error instanceof AiUsageUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Provider check timed out.");
    throw new Error("Could not connect to the provider.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("Provider authentication failed.");
    if (response.status === 429) throw new Error("Provider rate limit reached. Try again later.");
    throw new Error("Provider check failed (HTTP " + response.status + ").");
  }

  const payload = await response.json();
  const rows = getRows(provider, payload);
  const installedSet = new Set(
    installedModels.map((model) => model.provider + ":" + model.providerModelId),
  );

  const candidates: DiscoveredAudioTextModel[] = [];
  let notVerified = 0;

  for (const row of rows) {
    const rawId =
      provider.apiDialect === "gemini"
        ? String(row?.name ?? "").replace(/^models\//, "")
        : provider.apiDialect === "cohere"
          ? String(row?.name ?? "")
          : String(row?.id ?? row?.name ?? "");
    if (!rawId) continue;

    const { inputModalities, outputModalities } = modelModalities(row);
    const explicitlyCompatible =
      inputModalities.includes("audio") && outputModalities.includes("text");

    let liveCompatible: boolean | null = null;
    if (!explicitlyCompatible && (provider.id === "gemini" || provider.id === "openai")) {
      if (provider.id === "gemini") {
        const methods = Array.isArray(row?.supportedGenerationMethods)
          ? row.supportedGenerationMethods
          : [];
        if (methods.length && !methods.includes("generateContent")) {
          liveCompatible = false;
        } else {
          liveCompatible = await probeAudioTextCompatibility(provider, rawId, apiKey);
        }
      } else {
        liveCompatible = await probeAudioTextCompatibility(provider, rawId, apiKey);
      }
    }

    if (!explicitlyCompatible && liveCompatible !== true) {
      notVerified += 1;
      continue;
    }

    const name = String(row?.displayName ?? row?.display_name ?? row?.name ?? rawId).replace(
      /^models\//,
      "",
    );
    const runtime = audioAnalyzerRuntimeSupport(provider, rawId);
    if (!runtime.supported) {
      notVerified += 1;
      continue;
    }
    candidates.push({
      id: rawId,
      name,
      ownedBy: row?.owned_by == null ? null : String(row.owned_by),
      contextWindow:
        asNumber(row?.model_info?.context_window) ??
        asNumber(row?.context_length) ??
        asNumber(row?.contextWindow) ??
        asNumber(row?.context_length_tokens),
      deprecated: row?.is_deprecated === true || row?.deprecated === true,
      installed: installedSet.has(provider.id + ":" + rawId),
      inputModalities: inputModalities.length ? inputModalities : ["audio"],
      outputModalities: outputModalities.length ? outputModalities : ["text"],
      runtimeSupported: runtime.supported,
      runtimeNote: explicitlyCompatible
        ? runtime.note
        : runtime.note + " Audio compatibility was verified with a live probe.",
    });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  return {
    provider: { id: provider.id, label: provider.label },
    returned: rows.length,
    candidates,
    excludedWithoutExplicitModalities: notVerified,
  };
}

type ProbeOutcome = "passed" | "unsupported" | "inconclusive";
type ProbeResult = { outcome: ProbeOutcome; error?: string };

const GENERATOR_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, lyrics: { type: "string" } },
  required: ["title", "lyrics"],
  additionalProperties: false,
};
const QUALITY_SCHEMA = {
  type: "object",
  properties: { passed: { type: "boolean" }, score: { type: "number" } },
  required: ["passed", "score"],
  additionalProperties: false,
};

function classifyHttpFailure(status: number): ProbeOutcome {
  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  ) {
    return "inconclusive";
  }
  return "unsupported";
}

function sanitizeProviderError(body: string, status: number): string {
  const fallback = `HTTP ${status}`;
  if (!body.trim()) return fallback;

  let detail = "";
  try {
    const payload = JSON.parse(body) as Record<string, any>;
    const nested =
      payload?.["error"] && typeof payload["error"] === "object" ? payload["error"] : payload;
    const code = nested?.["code"] ?? payload?.["code"];
    const message = nested?.["message"] ?? payload?.["message"];
    const requestId =
      nested?.["request_id"] ??
      nested?.["requestId"] ??
      payload?.["request_id"] ??
      payload?.["requestId"];
    detail = [code, message, requestId ? `request_id=${requestId}` : null]
      .filter(Boolean)
      .map(String)
      .join(" · ");
  } catch {
    detail = body.replace(/\s+/g, " ").trim();
  }

  detail = detail
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .slice(0, 360);
  return detail ? `${fallback} · ${detail}` : fallback;
}

function validProbeJson(text: string, operation: "generator" | "quality_check"): boolean {
  try {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end < start) return false;
    const value = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    if (operation === "generator")
      return typeof value["title"] === "string" && typeof value["lyrics"] === "string";
    return typeof value["passed"] === "boolean" && typeof value["score"] === "number";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeModel(
  provider: ProviderRegistryEntry,
  modelId: string,
  operation: "generator" | "quality_check",
): Promise<ProbeResult> {
  if (provider.compatibility.dialect === "unsupported")
    return { outcome: "unsupported", error: "No PromptBeats runtime adapter." };
  const apiKey = providerSecret(provider);
  const isGenerator = operation === "generator";
  const system = "You are a compatibility probe. Return only the requested JSON object.";
  const prompt = isGenerator
    ? 'Return exactly this JSON shape with very short values: {"title":"Test","lyrics":"Test line"}'
    : 'Return exactly this JSON shape: {"passed":true,"score":10}';
  const schema = isGenerator ? GENERATOR_SCHEMA : QUALITY_SCHEMA;

  try {
    let response: Response;
    let text = "";

    if (provider.compatibility.dialect === "openai-responses") {
      response = await fetchWithTimeout(provider.compatibility.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          instructions: system,
          input: prompt,
          max_output_tokens: 256,
          text: {
            format: { type: "json_schema", name: "promptbeats_probe", strict: true, schema },
          },
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as any;
        text =
          payload?.output
            ?.flatMap((item: any) => item?.content ?? [])
            ?.filter((item: any) => item?.type === "output_text")
            ?.map((item: any) => item?.text ?? "")
            ?.join("") ?? "";
      }
    } else if (provider.compatibility.dialect === "openai-chat") {
      response = await fetchWithTimeout(provider.compatibility.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: 120,
          ...(provider.compatibility.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as any;
        const content = payload?.choices?.[0]?.message?.content;
        text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map((part: any) => part?.text ?? "").join("")
              : "";
      }
    } else if (provider.compatibility.dialect === "anthropic") {
      response = await fetchWithTimeout(provider.compatibility.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 120,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as any;
        text =
          payload?.content
            ?.filter((item: any) => item?.type === "text")
            .map((item: any) => item?.text ?? "")
            .join("") ?? "";
      }
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: JSON.parse(
              JSON.stringify(schema).replace(
                /"type":"(object|string|number|boolean)"/g,
                (_match, type) => `"type":"${String(type).toUpperCase()}"`,
              ),
            ),
            maxOutputTokens: 120,
          },
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as any;
        text =
          payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? "").join("") ??
          "";
      }
    }

    if (!response.ok) {
      const body = await response.text();
      const safeError = sanitizeProviderError(body, response.status);
      console.warn(
        `[ai-compatibility] ${provider.id}/${modelId}/${operation} failed (${response.status})`,
        { status: response.status },
      );
      return { outcome: classifyHttpFailure(response.status), error: safeError };
    }

    return validProbeJson(text, operation)
      ? { outcome: "passed" }
      : {
          outcome: "unsupported",
          error: text.trim()
            ? `Invalid structured JSON response: ${text.replace(/\s+/g, " ").slice(0, 220)}`
            : "Invalid structured JSON response: empty model output.",
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compatibility request failed.";
    return { outcome: "inconclusive", error: message.slice(0, 360) };
  }
}

export async function testProviderModelsCompatibility(
  providerId: AiProviderId,
  models: DiscoveredProviderModel[],
): Promise<CompatibilityResult[]> {
  const provider = AI_PROVIDER_REGISTRY.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("Unknown AI provider.");

  const pending = models.filter((model) => !model.installed && !model.deprecated);
  const results: CompatibilityResult[] = [];
  for (let index = 0; index < pending.length; index += 3) {
    const batch = pending.slice(index, index + 3);
    const batchResults = await Promise.all(
      batch.map(async (model) => {
        const [generator, quality] = await Promise.all([
          probeModel(provider, model.id, "generator"),
          probeModel(provider, model.id, "quality_check"),
        ]);

        let status: CompatibilityStatus;
        if (generator.outcome === "inconclusive" || quality.outcome === "inconclusive") {
          status = "inconclusive";
        } else if (generator.outcome === "passed" && quality.outcome === "passed") {
          status = "compatible";
        } else if (generator.outcome === "passed") {
          status = "generator_only";
        } else if (quality.outcome === "passed") {
          status = "quality_check_only";
        } else {
          status = "unsupported";
        }

        return {
          id: model.id,
          name: model.name,
          status,
          generatorCompatible: generator.outcome === "passed",
          qualityCheckCompatible: quality.outcome === "passed",
          ...(generator.error ? { generatorError: generator.error } : {}),
          ...(quality.error ? { qualityCheckError: quality.error } : {}),
          contextWindow: model.contextWindow,
          installed: model.installed,
        } satisfies CompatibilityResult;
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

export async function testSingleProviderModelCompatibility(
  providerId: AiProviderId,
  model: DiscoveredProviderModel,
): Promise<CompatibilityResult> {
  const results = await testProviderModelsCompatibility(providerId, [model]);
  const result = results[0];
  if (!result) throw new Error("Compatibility test could not be completed.");
  return result;
}
