import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getInstalledRegistryModels } from "@/lib/ai-model-registry.server";

const probeSchema = z.object({
  model: z.string().trim().min(1).max(240),
});

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_admin_level");
  if (error || data !== true) throw new Error("Nexos diagnostics are restricted to administrators.");
}

function requestIdFrom(response: Response) {
  return (
    response.headers.get("request-id") ??
    response.headers.get("x-request-id") ??
    response.headers.get("x-nexos-request-id") ??
    null
  );
}

function safeErrorDetails(raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { type?: string; code?: string | number; message?: string };
      type?: string;
      code?: string | number;
      message?: string;
    };
    return {
      errorType: parsed.error?.type ?? parsed.type ?? null,
      errorCode: parsed.error?.code ?? parsed.code ?? null,
      errorMessage: (parsed.error?.message ?? parsed.message ?? "").slice(0, 500) || null,
    };
  } catch {
    return {
      errorType: null,
      errorCode: null,
      errorMessage: raw.replace(/\s+/g, " ").trim().slice(0, 500) || null,
    };
  }
}

function analyzeContent(text: string) {
  const trimmed = text.trim();
  let jsonValid = false;
  let jsonKeys: string[] = [];
  let jsonError: string | null = null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    jsonValid = true;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      jsonKeys = Object.keys(parsed as Record<string, unknown>).slice(0, 20);
    }
  } catch (error) {
    jsonError = error instanceof Error ? error.message.slice(0, 240) : "JSON parse failed";
  }

  return {
    contentLength: text.length,
    isEmpty: trimmed.length === 0,
    startsWithJsonFence: /^```(?:json)?\s*/i.test(trimmed),
    containsThinkTag: /<think(?:>|\s)/i.test(trimmed),
    firstNonWhitespaceChar: trimmed[0] ?? null,
    jsonValid,
    jsonKeys,
    jsonError,
    preview: trimmed.slice(0, 700),
  };
}

export const getNexosDiagnosticModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const installed = await getInstalledRegistryModels();
    return installed
      .filter((model) => model.provider === "nexos")
      .map((model) => ({
        id: model.providerModelId,
        label: model.displayName,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

export const runNexosRuntimeDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => probeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);

    const installed = await getInstalledRegistryModels();
    const selected = installed.find(
      (model) => model.provider === "nexos" && model.providerModelId === data.model,
    );
    if (!selected) throw new Error("The selected Nexos model is not installed.");

    const apiKey = process.env["NEXOS_API_KEY"]?.trim();
    if (!apiKey) throw new Error("NEXOS_API_KEY is not configured.");

    const startedAt = Date.now();
    const response = await fetch("https://api.nexos.ai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: data.model,
        messages: [
          {
            role: "system",
            content:
              "You are a PromptBeats runtime diagnostic. Return only one valid JSON object and no markdown.",
          },
          {
            role: "user",
            content:
              'Return exactly these JSON keys with short synthetic values: {"title":"Diagnostic Song","tags":"pop","lyrics":"[Verse]\\nTest line","note":"Diagnostic only"}',
          },
        ],
        max_tokens: 512,
      }),
    });

    const durationMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type");
    const requestId = requestIdFrom(response);
    const raw = await response.text();

    if (!response.ok) {
      const details = safeErrorDetails(raw);
      console.error("[ai-provider] nexos diagnostic http_error", {
        model: data.model,
        status: response.status,
        contentType,
        requestId,
        durationMs,
        errorType: details.errorType,
        errorCode: details.errorCode,
        errorMessage: details.errorMessage,
      });
      return {
        ok: false as const,
        model: data.model,
        label: selected.displayName,
        status: response.status,
        contentType,
        requestId,
        durationMs,
        ...details,
      };
    }

    let payload: {
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | Array<{ type?: string; text?: string }> };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch (error) {
      const responseJsonError = error instanceof Error ? error.message.slice(0, 240) : "Invalid JSON";
      console.error("[ai-provider] nexos diagnostic invalid_response_json", {
        model: data.model,
        status: response.status,
        contentType,
        requestId,
        durationMs,
        responseJsonError,
      });
      return {
        ok: true as const,
        model: data.model,
        label: selected.displayName,
        status: response.status,
        contentType,
        requestId,
        durationMs,
        finishReason: null,
        responseJsonValid: false,
        responseJsonError,
        content: analyzeContent(""),
        usage: null,
      };
    }

    const choice = payload.choices?.[0];
    const messageContent = choice?.message?.content;
    const text =
      typeof messageContent === "string"
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent.map((part) => part.text ?? "").join("")
          : "";
    const content = analyzeContent(text);

    console.info("[ai-provider] nexos diagnostic completed", {
      model: data.model,
      status: response.status,
      contentType,
      requestId,
      durationMs,
      finishReason: choice?.finish_reason ?? null,
      contentLength: content.contentLength,
      isEmpty: content.isEmpty,
      startsWithJsonFence: content.startsWithJsonFence,
      containsThinkTag: content.containsThinkTag,
      jsonValid: content.jsonValid,
      jsonKeys: content.jsonKeys,
    });

    return {
      ok: true as const,
      model: data.model,
      label: selected.displayName,
      status: response.status,
      contentType,
      requestId,
      durationMs,
      finishReason: choice?.finish_reason ?? null,
      responseJsonValid: true,
      responseJsonError: null,
      content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? null,
        outputTokens: payload.usage?.completion_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null,
      },
    };
  });
