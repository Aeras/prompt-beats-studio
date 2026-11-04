/** Local filesystem-only candidate review. Never creates a job or invokes a model. */
import { readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  previewOfflineAtlasCandidate,
  materializeOfflineAtlasCandidate,
  renderOfflineCandidatePrompts,
} from "../src/lib/atlas-candidate-preview.offline";
import {
  renderAtlasCandidatePreviewHtml,
  renderAtlasCandidatePreviewMarkdown,
} from "../src/lib/atlas-candidate-view.offline";
import { atlasCompletionSummary } from "../src/lib/atlas-completion-package.offline";

function run(args: string[]) {
  const command = args.shift();
  if (command === "verify" && !args.length) {
    console.log(JSON.stringify(atlasCompletionSummary()));
    return;
  }
  if (command !== "preview" && command !== "confirm")
    throw new Error("Use verify, preview or confirm; see docs/PB-ATLAS-V4-OFFLINE-COMPLETION.md");
  const flags = new Map<string, string>();
  const booleans = new Set<string>();
  const accepted = new Set([
    "--setup",
    "--request",
    "--actor",
    "--out",
    "--preview",
    "--confirmation",
    "--locale",
  ]);
  while (args.length) {
    const key = args.shift()!;
    if (flags.has(key) || booleans.has(key)) throw new Error("Duplicate CLI argument");
    if (key === "--opt-in" || key === "--accept-unverified") {
      booleans.add(key);
      continue;
    }
    const value = args.shift();
    if (!accepted.has(key) || !value || value.startsWith("--"))
      throw new Error("Unknown or missing CLI argument");
    flags.set(key, value);
  }
  if (!booleans.has("--opt-in") || !booleans.has("--accept-unverified"))
    throw new Error("Explicit --opt-in --accept-unverified required");
  const required = (key: string) => {
    const v = flags.get(key);
    if (!v) throw new Error("Missing " + key);
    return v;
  };
  const local = (value: string) => {
    if (value.startsWith("\\\\") || /^https?:/i.test(value)) throw new Error("Local paths only");
    return resolve(value);
  };
  const read = (key: string, max: number) => {
    const p = local(required(key));
    if (statSync(p).size > max) throw new Error("Input exceeds review size limit");
    return readFileSync(p, "utf8");
  };
  const locale = flags.get("--locale") ?? "el";
  if (locale !== "el" && locale !== "en") throw new Error("Unsupported report locale");
  const authority = {
    mode: "offline" as const,
    permission: "local-review" as const,
    actorId: required("--actor"),
  };
  const setup = read("--setup", 256 * 1024);
  const result =
    command === "preview"
      ? {
          format: "promptbeats-atlas-offline-proposal",
          executable: false,
          preview: previewOfflineAtlasCandidate(
            setup,
            JSON.parse(read("--request", 16 * 1024)),
            authority,
          ),
        }
      : materializeOfflineAtlasCandidate(
          setup,
          JSON.parse(read("--preview", 768 * 1024)),
          JSON.parse(read("--confirmation", 4096)),
          authority,
        );
  const preview = result.preview;
  const prompts = renderOfflineCandidatePrompts(preview);
  const out = local(required("--out"));
  if (existsSync(out)) throw new Error("Output directory already exists; refusing overwrite");
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries({
    "result.json": JSON.stringify(result, null, 2) + "\n",
    "preview.json": JSON.stringify(preview, null, 2) + "\n",
    "preview.html": renderAtlasCandidatePreviewHtml(preview, locale),
    "preview.md": renderAtlasCandidatePreviewMarkdown(preview, locale),
    "offline-prompts.json": JSON.stringify(prompts, null, 2) + "\n",
  }))
    writeFileSync(join(out, name), text, { flag: "wx" });
  console.log(
    JSON.stringify({
      mode: "offline",
      command,
      out,
      previewSha256: preview.previewSha256,
      changedFields: preview.diff.map((d) => d.field),
      providerCalls: 0,
      executable: false,
    }),
  );
}
try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Offline review failed");
  process.exitCode = 1;
}
