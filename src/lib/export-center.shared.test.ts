import { describe, expect, test } from "bun:test";

import {
  EXPORT_SCHEMA_VERSION,
  buildProjectExportDocument,
  buildProjectPromptDocuments,
  buildProjectSummaryDocument,
  buildPromptExportDocument,
  sanitizeExportFilename,
  serializeExportDocument,
  uniqueExportFilename,
  type ProjectExportSource,
  type PromptExportSource,
} from "@/lib/export-center.shared";

const promptSource: PromptExportSource = {
  schemaVersion: EXPORT_SCHEMA_VERSION,
  exportType: "prompt",
  exportedAt: "2026-09-21T00:00:00.000Z",
  project: { name: "Δοκιμή Project" },
  prompt: {
    name: "Version 1",
    title: "Νυχτερινή Διαδρομή",
    versionNumber: 1,
    versionLabel: null,
    theme: "Μια ιστορία στην πόλη",
    musicStyle: "Greek Pop",
    mood: "Μελαγχολικό",
    language: "Greek",
    stylePrompt: "Warm piano <script>alert(1)</script>",
    lyrics: "[Verse]\nΣτο φως της πόλης",
    producerNote: "Keep it intimate.",
    revisionRequest: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T11:00:00.000Z",
  },
};

const projectSource: ProjectExportSource = {
  schemaVersion: EXPORT_SCHEMA_VERSION,
  exportType: "project",
  exportedAt: "2026-09-21T00:00:00.000Z",
  project: {
    name: "Midnight Drive",
    creationNotes: "Keep the verses intimate.",
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  },
  prompts: [
    promptSource.prompt,
    { ...promptSource.prompt, name: "Version 2", versionNumber: 2, lyrics: "مرحبا بالعالم" },
  ],
};

describe("Export Center serializers", () => {
  test("JSON uses canonical schema and exportedAt", () => {
    const doc = buildPromptExportDocument(promptSource, "en");
    const parsed = JSON.parse(serializeExportDocument(doc, "json"));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportType).toBe("prompt");
    expect(parsed.exportedAt).toBe(promptSource.exportedAt);
    expect(parsed.prompt.musicStyle).toBe("Greek Pop");
    expect(parsed.prompt.id).toBeUndefined();
    expect(parsed.prompt.project_id).toBeUndefined();
  });

  test("HTML escapes user content while preserving multilingual text", () => {
    const html = serializeExportDocument(buildPromptExportDocument(promptSource, "el"), "html");
    expect(html).toContain("Στο φως της πόλης");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('dir="auto"');
  });

  test("project summary omits full prompt bodies", () => {
    const summary = buildProjectSummaryDocument(projectSource, "en");
    const json = JSON.parse(serializeExportDocument(summary, "json"));
    expect(json.exportType).toBe("project-summary");
    expect(json.promptIndex).toHaveLength(2);
    expect(json.prompts).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("مرحبا بالعالم");
  });

  test("combined project preserves canonical prompt order", () => {
    const doc = buildProjectExportDocument(projectSource, "en");
    expect(doc.exportType).toBe("project");
    expect(doc.prompts.map((prompt) => prompt.versionNumber)).toEqual([1, 2]);
    const markdown = serializeExportDocument(doc, "md");
    expect(markdown.indexOf("Version 1")).toBeLessThan(markdown.indexOf("Version 2"));
  });

  test("separate project export creates one document per prompt", () => {
    const docs = buildProjectPromptDocuments(projectSource, "en");
    expect(docs).toHaveLength(2);
    expect(docs.every((doc) => doc.exportType === "prompt")).toBe(true);
  });

  test("filenames are sanitized and duplicate names cannot overwrite", () => {
    expect(sanitizeExportFilename('Bad:/\\*?"<>| Name.')).toBe("Bad_________ Name");
    const used = new Set<string>();
    expect(uniqueExportFilename("Version 2", "md", used)).toBe("Version 2.md");
    expect(uniqueExportFilename("Version 2", "md", used)).toBe("Version 2 (2).md");
  });
});
