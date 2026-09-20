import { createClientOnlyFn } from "@tanstack/react-start";
import { strToU8, zipSync } from "fflate";

import {
  buildProjectPromptDocuments,
  buildProjectSummaryDocument,
  exportExtension,
  exportMime,
  sanitizeExportFilename,
  serializeExportDocument,
  uniqueExportFilename,
  type ExportDocument,
  type ExportFormat,
  type ProjectExportSource,
} from "@/lib/export-center.shared";

type ExportLocale = "en" | "el";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const downloadExportDocument = createClientOnlyFn(
  (document: ExportDocument, format: ExportFormat, baseName: string) => {
    const extension = exportExtension(format);
    const filename = `${sanitizeExportFilename(baseName)}.${extension}`;
    const content = serializeExportDocument(document, format);
    triggerDownload(new Blob([content], { type: `${exportMime(format)};charset=utf-8` }), filename);
  },
);

export const downloadProjectSeparateExport = createClientOnlyFn(
  (source: ProjectExportSource, format: ExportFormat, locale: ExportLocale) => {
    const extension = exportExtension(format);
    const projectBase = sanitizeExportFilename(source.project.name, "PromptBeats Project");
    const folder = `${projectBase}/`;
    const used = new Set<string>();
    const entries: Record<string, Uint8Array> = {};

    const summaryDocument = buildProjectSummaryDocument(source, locale);
    const summaryFilename = uniqueExportFilename(projectBase, extension, used);
    entries[`${folder}${summaryFilename}`] = strToU8(serializeExportDocument(summaryDocument, format));

    for (const document of buildProjectPromptDocuments(source, locale)) {
      const base = sanitizeExportFilename(projectPromptFilenameBase(document), "Prompt");
      const filename = uniqueExportFilename(base, extension, used);
      entries[`${folder}${filename}`] = strToU8(serializeExportDocument(document, format));
    }

    const zip = zipSync(entries, { level: 6 });
    triggerDownload(new Blob([zip], { type: "application/zip" }), `${projectBase} - Export.zip`);
  },
);
