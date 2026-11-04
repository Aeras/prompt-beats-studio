import { createHash } from "node:crypto";
import { polarAnalysis, polarRequest, polarStatus } from "./kino-polar55.shared";
import type { z } from "zod";

export type Polar55Diagnostic = {
  stage:
    | "configuration"
    | "transport"
    | "http"
    | "headers"
    | "body"
    | "decode"
    | "json"
    | "schema"
    | "binding";
  reason:
    | "disabled"
    | "missing_token"
    | "invalid_token"
    | "fetch_failed"
    | "timeout"
    | "redirect_rejected"
    | "http_error"
    | "invalid_content_type"
    | "missing_body"
    | "body_read_failed"
    | "body_limit"
    | "invalid_utf8"
    | "invalid_json"
    | "invalid_schema"
    | "request_mismatch";
  httpStatus?: number;
};
type Polar55Dependencies = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  report?: (diagnostic: Polar55Diagnostic) => void;
};

/** No arbitrary host, browser credentials, cookies, redirects, OPAP calls or retry. */
export async function readPolar55(
  owner: string,
  input: z.infer<typeof polarRequest>,
  deps: Polar55Dependencies = {
    fetch,
    env: process.env,
    report: (diagnostic) => console.warn("kino_polar55_failure", diagnostic),
  },
) {
  const request = polarRequest.parse(input);
  const secret = deps.env["KINO_POLAR55_READ_TOKEN"];
  const report = (diagnostic: Polar55Diagnostic) => {
    // Fixed enum codes + numeric HTTP status only. No owner, headers, body,
    // environment values, URL, Zod paths or arbitrary exception message/name.
    try {
      deps.report?.(diagnostic);
    } catch {
      /* Diagnostics cannot change outcome. */
    }
  };
  if (
    deps.env["KINO_POLAR55_ENABLED"] !== "true" ||
    !secret ||
    !/^[a-zA-Z0-9_-]{48,256}$/.test(secret)
  ) {
    report({
      stage: "configuration",
      reason:
        deps.env["KINO_POLAR55_ENABLED"] !== "true"
          ? "disabled"
          : !secret
            ? "missing_token"
            : "invalid_token",
    });
    return { status: "not_configured" as const };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let diagnostic: Polar55Diagnostic = { stage: "transport", reason: "fetch_failed" };
  try {
    // Native Workers fetch rejects a foreign `this` receiver (deps.fetch()).
    const fetcher = deps.fetch;
    const response = await fetcher("https://kino-api.promptbeats.app/lab-v1.php", {
      method: "POST",
      // Workers rejects "error" before dispatch. Manual never forwards the
      // bearer token to Location; every non-2xx response is rejected below.
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
        "X-Kino-Owner": createHash("sha256").update(owner).digest("hex"),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) {
      diagnostic = {
        stage: "http",
        reason:
          response.status >= 300 && response.status < 400 ? "redirect_rejected" : "http_error",
        httpStatus: response.status,
      };
      throw Error("unavailable");
    }
    if (!/^application\/json\b/i.test(response.headers.get("content-type") ?? "")) {
      diagnostic = {
        stage: "headers",
        reason: "invalid_content_type",
        httpStatus: response.status,
      };
      throw Error("unavailable");
    }
    if (!response.body) {
      diagnostic = { stage: "body", reason: "missing_body", httpStatus: response.status };
      throw Error("unavailable");
    }
    diagnostic = { stage: "body", reason: "body_read_failed", httpStatus: response.status };
    reader = response.body.getReader();
    const bytes = new Uint8Array(300000);
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 300000) {
        diagnostic = { ...diagnostic, reason: "body_limit" };
        throw Error("too_large");
      }
      bytes.set(part.value, size - part.value.byteLength);
    }
    diagnostic = { stage: "decode", reason: "invalid_utf8", httpStatus: response.status };
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
    diagnostic = { stage: "json", reason: "invalid_json", httpStatus: response.status };
    const json: unknown = JSON.parse(text);
    diagnostic = { stage: "schema", reason: "invalid_schema", httpStatus: response.status };
    if (request.op === "status") return { status: "ok" as const, info: polarStatus.parse(json) };
    const analysis = polarAnalysis.parse(json);
    diagnostic = { stage: "binding", reason: "request_mismatch", httpStatus: response.status };
    if (
      analysis.options.op !== "analysis" ||
      analysis.options.n !== request.n ||
      analysis.options.k !== request.k ||
      analysis.options.method !== request.method ||
      analysis.options.seed !== request.seed
    )
      throw Error("request_mismatch");
    return { status: "ok" as const, analysis };
  } catch {
    if (controller.signal.aborted) diagnostic = { stage: diagnostic.stage, reason: "timeout" };
    report(diagnostic);
    // Never return/log a provider body, URL credentials, token or untrusted exception.
    return { status: "unavailable" as const };
  } finally {
    controller.abort();
    clearTimeout(timer);
    void reader?.cancel().catch(() => undefined);
  }
}
