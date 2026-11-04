import { createHash } from "node:crypto";
import { polarAnalysis, polarRequest, polarStatus } from "./kino-polar55.shared";
import type { z } from "zod";

/** No arbitrary host, browser credentials, cookies, redirects, OPAP calls or retry. */
export async function readPolar55(
  owner: string,
  input: z.infer<typeof polarRequest>,
  deps = { fetch, env: process.env },
) {
  const request = polarRequest.parse(input);
  const secret = deps.env["KINO_POLAR55_READ_TOKEN"];
  if (
    deps.env["KINO_POLAR55_ENABLED"] !== "true" ||
    !secret ||
    !/^[a-zA-Z0-9_-]{48,256}$/.test(secret)
  )
    return { status: "not_configured" as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await deps.fetch("https://kino-api.promptbeats.app/lab-v1.php", {
      method: "POST",
      redirect: "error",
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
    if (
      !response.ok ||
      !/^application\/json\b/i.test(response.headers.get("content-type") ?? "") ||
      !response.body
    )
      throw Error("unavailable");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 300000) throw Error("too_large");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (request.op === "status") return { status: "ok" as const, info: polarStatus.parse(json) };
    const analysis = polarAnalysis.parse(json);
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
    // Never return/log a provider body, URL credentials, token or untrusted exception.
    return { status: "unavailable" as const };
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    clearTimeout(timer);
  }
}
