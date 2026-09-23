export const EXPORT_SCHEMA_VERSION = 1 as const;

export type ExportFormat = "txt" | "md" | "html" | "json";
export type ProjectExportMode = "single" | "separate";

export type ExportProjectRecord = {
  name: string;
  creationNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportPromptRecord = {
  name: string;
  title: string | null;
  versionNumber: number | null;
  versionLabel: string | null;
  theme: string | null;
  musicStyle: string | null;
  mood: string | null;
  language: string | null;
  stylePrompt: string | null;
  lyrics: string | null;
  producerNote: string | null;
  revisionRequest: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptExportSource = {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportType: "prompt";
  exportedAt: string;
  project: { name: string } | null;
  prompt: ExportPromptRecord;
};

export type ProjectExportSource = {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportType: "project";
  exportedAt: string;
  project: ExportProjectRecord;
  prompts: ExportPromptRecord[];
};

export type ExportSource = PromptExportSource | ProjectExportSource;

export type ExportSection = {
  heading: string;
  content?: string;
  sections?: ExportSection[];
};

export type ExportDocument =
  | {
      schemaVersion: typeof EXPORT_SCHEMA_VERSION;
      exportType: "prompt";
      exportedAt: string;
      title: string;
      project: { name: string } | null;
      prompt: ExportPromptRecord;
      sections: ExportSection[];
    }
  | {
      schemaVersion: typeof EXPORT_SCHEMA_VERSION;
      exportType: "project";
      exportedAt: string;
      title: string;
      project: ExportProjectRecord;
      prompts: ExportPromptRecord[];
      sections: ExportSection[];
    }
  | {
      schemaVersion: typeof EXPORT_SCHEMA_VERSION;
      exportType: "project-summary";
      exportedAt: string;
      title: string;
      project: ExportProjectRecord;
      promptIndex: Array<Pick<ExportPromptRecord, "name" | "versionNumber" | "versionLabel">>;
      sections: ExportSection[];
    };

type ExportLocale = "en" | "el";

const labels = {
  en: {
    project: "Project",
    version: "Version",
    created: "Created",
    updated: "Updated",
    prompts: "Prompts",
    creationNotes: "Creation Notes",
    promptVersions: "Prompt Versions",
    theme: "Theme",
    musicStyle: "Music Style",
    mood: "Mood",
    language: "Language",
    stylePrompt: "Style Prompt",
    lyrics: "Lyrics",
    producerNote: "Producer Note",
    revisionRequest: "Revision Request",
  },
  el: {
    project: "Project",
    version: "Έκδοση",
    created: "Δημιουργήθηκε",
    updated: "Τελευταία ενημέρωση",
    prompts: "Prompts",
    creationNotes: "Creation Notes",
    promptVersions: "Εκδόσεις Prompt",
    theme: "Θέμα",
    musicStyle: "Μουσικό στυλ",
    mood: "Διάθεση",
    language: "Γλώσσα",
    stylePrompt: "Style Prompt",
    lyrics: "Στίχοι",
    producerNote: "Σημείωση παραγωγού",
    revisionRequest: "Αίτημα αναθεώρησης",
  },
} as const;

const hasText = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

function versionText(prompt: ExportPromptRecord, locale: ExportLocale) {
  if (prompt.versionNumber != null && hasText(prompt.versionLabel)) {
    return `V${prompt.versionNumber} · ${prompt.versionLabel}`;
  }
  if (prompt.versionNumber != null) return `${labels[locale].version} ${prompt.versionNumber}`;
  return hasText(prompt.versionLabel) ? prompt.versionLabel : null;
}

function promptSections(prompt: ExportPromptRecord, locale: ExportLocale): ExportSection[] {
  const l = labels[locale];
  const sections: ExportSection[] = [];
  const add = (heading: string, value: string | null | undefined) => {
    if (hasText(value)) sections.push({ heading, content: value });
  };
  add(l.theme, prompt.theme);
  add(l.musicStyle, prompt.musicStyle);
  add(l.mood, prompt.mood);
  add(l.language, prompt.language);
  add(l.stylePrompt, prompt.stylePrompt);
  add(l.lyrics, prompt.lyrics);
  add(l.producerNote, prompt.producerNote);
  add(l.revisionRequest, prompt.revisionRequest);
  return sections;
}

function promptHeaderContent(
  prompt: ExportPromptRecord,
  projectName: string | null,
  locale: ExportLocale,
) {
  const l = labels[locale];
  return [
    projectName ? `${l.project}: ${projectName}` : null,
    versionText(prompt, locale) ? `${l.version}: ${versionText(prompt, locale)}` : null,
    `${l.created}: ${prompt.createdAt}`,
    `${l.updated}: ${prompt.updatedAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPromptExportDocument(
  source: PromptExportSource,
  locale: ExportLocale,
): Extract<ExportDocument, { exportType: "prompt" }> {
  const header = promptHeaderContent(source.prompt, source.project?.name ?? null, locale);
  return {
    schemaVersion: source.schemaVersion,
    exportType: "prompt",
    exportedAt: source.exportedAt,
    title: source.prompt.name,
    project: source.project,
    prompt: source.prompt,
    sections: [
      ...(header ? [{ heading: source.prompt.name, content: header }] : []),
      ...promptSections(source.prompt, locale),
    ],
  };
}

export function buildProjectExportDocument(
  source: ProjectExportSource,
  locale: ExportLocale,
): Extract<ExportDocument, { exportType: "project" }> {
  const l = labels[locale];
  const index = source.prompts
    .map((prompt, index) => {
      const version = versionText(prompt, locale);
      return `${index + 1}. ${version ? `${version} — ` : ""}${prompt.name}`;
    })
    .join("\n");

  const promptBlocks: ExportSection[] = source.prompts.map((prompt) => ({
    heading: versionText(prompt, locale)
      ? `${versionText(prompt, locale)} — ${prompt.name}`
      : prompt.name,
    content: promptHeaderContent(prompt, source.project.name, locale),
    sections: promptSections(prompt, locale),
  }));

  return {
    schemaVersion: source.schemaVersion,
    exportType: "project",
    exportedAt: source.exportedAt,
    title: source.project.name,
    project: source.project,
    prompts: source.prompts,
    sections: [
      {
        heading: source.project.name,
        content: [
          `${l.prompts}: ${source.prompts.length}`,
          `${l.created}: ${source.project.createdAt}`,
          `${l.updated}: ${source.project.updatedAt}`,
        ].join("\n"),
      },
      ...(hasText(source.project.creationNotes)
        ? [{ heading: l.creationNotes, content: source.project.creationNotes }]
        : []),
      ...(index ? [{ heading: l.promptVersions, content: index }] : []),
      ...promptBlocks,
    ],
  };
}

export function buildProjectSummaryDocument(
  source: ProjectExportSource,
  locale: ExportLocale,
): Extract<ExportDocument, { exportType: "project-summary" }> {
  const l = labels[locale];
  const promptIndex = source.prompts.map(({ name, versionNumber, versionLabel }) => ({
    name,
    versionNumber,
    versionLabel,
  }));
  const index = source.prompts
    .map((prompt, index) => {
      const version = versionText(prompt, locale);
      return `${index + 1}. ${version ? `${version} — ` : ""}${prompt.name}`;
    })
    .join("\n");

  return {
    schemaVersion: source.schemaVersion,
    exportType: "project-summary",
    exportedAt: source.exportedAt,
    title: source.project.name,
    project: source.project,
    promptIndex,
    sections: [
      {
        heading: source.project.name,
        content: [
          `${l.prompts}: ${source.prompts.length}`,
          `${l.created}: ${source.project.createdAt}`,
          `${l.updated}: ${source.project.updatedAt}`,
        ].join("\n"),
      },
      ...(hasText(source.project.creationNotes)
        ? [{ heading: l.creationNotes, content: source.project.creationNotes }]
        : []),
      ...(index ? [{ heading: l.promptVersions, content: index }] : []),
    ],
  };
}

export function buildProjectPromptDocuments(
  source: ProjectExportSource,
  locale: ExportLocale,
): Array<Extract<ExportDocument, { exportType: "prompt" }>> {
  return source.prompts.map((prompt) =>
    buildPromptExportDocument(
      {
        schemaVersion: source.schemaVersion,
        exportType: "prompt",
        exportedAt: source.exportedAt,
        project: { name: source.project.name },
        prompt,
      },
      locale,
    ),
  );
}

function txtSection(section: ExportSection, level = 0): string {
  const heading =
    level === 0
      ? `${section.heading.toUpperCase()}\n${"=".repeat(Math.max(3, section.heading.length))}`
      : `${section.heading}\n${"-".repeat(Math.max(3, section.heading.length))}`;
  const content = hasText(section.content) ? `\n\n${section.content}` : "";
  const children = section.sections?.length
    ? `\n\n${section.sections.map((child) => txtSection(child, level + 1)).join("\n\n")}`
    : "";
  return `${heading}${content}${children}`;
}

function mdSection(section: ExportSection, level = 2): string {
  const headingLevel = Math.min(6, level);
  const content = hasText(section.content) ? `\n\n${section.content}` : "";
  const children = section.sections?.length
    ? `\n\n${section.sections.map((child) => mdSection(child, headingLevel + 1)).join("\n\n")}`
    : "";
  return `${"#".repeat(headingLevel)} ${section.heading}${content}${children}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlSection(section: ExportSection, level = 2): string {
  const headingLevel = Math.min(6, level);
  const content = hasText(section.content)
    ? `<div class="content" dir="auto">${escapeHtml(section.content)}</div>`
    : "";
  const children =
    section.sections?.map((child) => htmlSection(child, headingLevel + 1)).join("") ?? "";
  return `<section><h${headingLevel}>${escapeHtml(section.heading)}</h${headingLevel}>${content}${children}</section>`;
}

function canonicalJson(document: ExportDocument) {
  if (document.exportType === "prompt") {
    return {
      schemaVersion: document.schemaVersion,
      exportType: document.exportType,
      exportedAt: document.exportedAt,
      ...(document.project ? { project: document.project } : {}),
      prompt: document.prompt,
    };
  }
  if (document.exportType === "project") {
    return {
      schemaVersion: document.schemaVersion,
      exportType: document.exportType,
      exportedAt: document.exportedAt,
      project: document.project,
      prompts: document.prompts,
    };
  }
  return {
    schemaVersion: document.schemaVersion,
    exportType: document.exportType,
    exportedAt: document.exportedAt,
    project: document.project,
    promptIndex: document.promptIndex,
  };
}

export function serializeExportDocument(document: ExportDocument, format: ExportFormat): string {
  if (format === "json") return `${JSON.stringify(canonicalJson(document), null, 2)}\n`;
  if (format === "txt") {
    return `${document.title.toUpperCase()}\n${"=".repeat(Math.max(3, document.title.length))}\n\n${document.sections.map((section) => txtSection(section)).join("\n\n")}\n`;
  }
  if (format === "md") {
    return `# ${document.title}\n\n${document.sections.map((section) => mdSection(section)).join("\n\n")}\n`;
  }
  const body = document.sections.map((section) => htmlSection(section)).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(document.title)}</title>
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#0b0b0f;color:#f4f4f5;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}main{max-width:900px;margin:0 auto;padding:40px 24px 64px}h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .6em}h1{font-size:2rem;margin-top:0}h2{border-bottom:1px solid #34343d;padding-bottom:.35rem}.content{white-space:pre-wrap;overflow-wrap:anywhere;background:#15151c;border:1px solid #2c2c36;border-radius:12px;padding:14px 16px}section section{margin-left:0}@media(max-width:640px){main{padding:24px 16px 48px}h1{font-size:1.6rem}}@media print{:root{color-scheme:light}body{background:#fff;color:#111}main{max-width:none;padding:0}.content{background:#fff;border-color:#ddd}section{break-inside:auto}h2,h3,h4{break-after:avoid}}
</style>
</head>
<body><main><h1>${escapeHtml(document.title)}</h1>${body}</main></body>
</html>\n`;
}

export function sanitizeExportFilename(value: string, fallback = "PromptBeats Export") {
  const normalized = Array.from(value.normalize("NFC"), (character) =>
    character.charCodeAt(0) <= 0x1f ? "_" : character,
  ).join("");
  const cleaned = normalized
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  const safe = cleaned || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `_${safe}` : safe;
}

export function uniqueExportFilename(base: string, extension: string, used: Set<string>) {
  let candidate = `${base}.${extension}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (${index}).${extension}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function exportExtension(format: ExportFormat) {
  return format === "md" ? "md" : format;
}

export function exportMime(format: ExportFormat) {
  if (format === "html") return "text/html";
  if (format === "json") return "application/json";
  if (format === "md") return "text/markdown";
  return "text/plain";
}

export function projectPromptFilenameBase(
  document: Extract<ExportDocument, { exportType: "prompt" }>,
) {
  return document.prompt.versionNumber != null
    ? `Version ${document.prompt.versionNumber}`
    : document.title;
}
