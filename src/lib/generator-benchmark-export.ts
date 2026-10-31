export type GeneratorBenchmarkExportInput = {
  title: string;
  musicStyle: string;
  lyrics: string;
  producerNote: string;
  modelId: string;
  modelLabel: string;
  provider: string | null;
  targetPlatform: string;
  generatorMode: "basic" | "advanced" | "revision";
  promptVersion?: "v1" | "v2" | "v3" | "v4_beta" | "v5_beta_1" | "registry";
  promptLabel?: string | undefined;
  promptDigest?: string | undefined;
  exportedAt: string;
};

function safeLine(value: string) {
  return value.trim() || "—";
}

function safeFilenamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\u0370-\u03ff\u0400-\u04ff_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function buildGeneratorBenchmarkMarkdown(input: GeneratorBenchmarkExportInput) {
  return [
    "# PromptBeats Generator Test Result",
    "",
    "## Generation Metadata",
    "",
    `- **AI Model:** ${safeLine(input.modelLabel)}`,
    `- **Provider Model ID:** ${safeLine(input.modelId)}`,
    `- **Provider:** ${safeLine(input.provider ?? "")}`,
    `- **Target Platform:** ${safeLine(input.targetPlatform)}`,
    `- **Generator Mode:** ${input.generatorMode}`,
    `- **Prompt Version:** ${input.promptVersion ?? "v1"}`,
    ...(input.promptLabel
      ? [
          `- **Prompt Label:** ${safeLine(input.promptLabel)}`,
          `- **Prompt reference SHA-256:** ${safeLine(input.promptDigest ?? "")}`,
        ]
      : []),
    `- **Exported At:** ${input.exportedAt}`,
    "",
    "## Title",
    "",
    safeLine(input.title),
    "",
    "## Music Style",
    "",
    safeLine(input.musicStyle),
    "",
    "## Lyrics",
    "",
    input.lyrics.trim() || "—",
    "",
    "## Producer Note",
    "",
    input.producerNote.trim() || "—",
    "",
  ].join("\n");
}

export function generatorBenchmarkFilename(input: {
  title: string;
  modelLabel: string;
  exportedAt: string;
}) {
  const model = safeFilenamePart(input.modelLabel) || "model";
  const title = safeFilenamePart(input.title) || "untitled";
  const stamp = input.exportedAt.replace(/[:.]/g, "-");
  return `PromptBeats_Test_${model}_${title}_${stamp}.md`;
}
