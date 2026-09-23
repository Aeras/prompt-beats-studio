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
  contextWindow: number | null;
  installed: boolean;
};

export function getDetectedAiProviders(): DetectedAiProvider[] {
  return AI_PROVIDER_REGISTRY.filter((provider) =>
    provider.secretNames.every((name) => Boolean(process.env[name]?.trim())),
  ).map(({ id, label }) => ({ id, label }));
}

function looksLikeGenerativeTextModel(id: string, metadata?: Record<string, unknown>): boolean {
  const value = id.toLowerCase();
  const excluded = [
    "embedding",
    "embed-",
    "text-embedding",
    "rerank",
    "moderation",
    "whisper",
    "transcribe",
    "tts",
    "speech",
    "audio",
    "image",
    "imagen",
    "veo",
    "video",
    "guard",
    "safety",
    "ocr",
    "robotics",
    "realtime",
    "computer-use",
  ];
  if (excluded.some((token) => value.includes(token))) return false;
  const output = metadata?.["output_modalities"];
  if (Array.isArray(output) && output.length && !output.includes("text")) return false;
  return true;
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

      if (provider.apiDialect === "gemini") {
        const methods = Array.isArray(row?.supportedGenerationMethods)
          ? row.supportedGenerationMethods
          : [];
        if (methods.length && !methods.includes("generateContent")) return [];
      }

      const meta =
        row?.architecture && typeof row.architecture === "object"
          ? (row.architecture as Record<string, unknown>)
          : undefined;
      if (!looksLikeGenerativeTextModel(rawId, meta)) return [];

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
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Provider check timed out.");
    throw new Error("Could not connect to the provider.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[ai-provider-discovery] ${provider.id} models request failed (${response.status})`,
      body.slice(0, 500),
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
      console.warn(
        `[ai-compatibility] ${provider.id}/${modelId}/${operation} failed (${response.status})`,
        body.slice(0, 300),
      );
      return { outcome: classifyHttpFailure(response.status), error: `HTTP ${response.status}` };
    }

    return validProbeJson(text, operation)
      ? { outcome: "passed" }
      : { outcome: "unsupported", error: "Invalid structured JSON response." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compatibility request failed.";
    return { outcome: "inconclusive", error: message };
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
