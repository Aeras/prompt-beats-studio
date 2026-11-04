import { readFileSync } from "node:fs";
import { atlasOfflineReviewCopy } from "../i18n/atlas-offline-review";
import type { AtlasOfflinePreview } from "./atlas-candidate-preview.offline";

const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
/** Static local report: CSP disables scripts, network, forms and external resources. */
export function renderAtlasCandidatePreviewHtml(
  p: AtlasOfflinePreview,
  locale: "el" | "en" = "el",
) {
  const t = atlasOfflineReviewCopy[locale];
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const root = styles.match(/:root\s*\{([^}]+)\}/)?.[1];
  if (!root) throw new Error("PromptBeats design tokens unavailable");
  const tokens = root
    .split("\n")
    .filter((line) =>
      /^\s*--(?:background|foreground|card|border|primary|muted-foreground|radius):/.test(line),
    )
    .join("\n");
  const diff = p.diff[0]!;
  const pre = (text: string, label: string) =>
    `<pre lang="und" tabindex="0" role="region" aria-label="${escape(label)}">${escape(text)}</pre>`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${t.title}</title><style>:root{${tokens}}*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:system-ui,sans-serif}main{max-width:75rem;margin:auto;padding:1rem;overflow-wrap:anywhere}h1{font-size:1.5rem}article,aside,details{min-width:0;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-block:1rem}aside{border-color:var(--primary)}.diff{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:28rem;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--primary) var(--background);font-size:.9rem;line-height:1.6}summary{cursor:pointer;min-height:44px}pre:focus,summary:focus{outline:2px solid var(--primary);outline-offset:3px}small{color:var(--muted-foreground)}@media(max-width:600px){.diff{grid-template-columns:minmax(0,1fr)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head><body><main><h1>${t.title}</h1><aside role="note">${t.warning}</aside><p>${t.field}: <strong>${t.fields[diff.field]}</strong></p><p>${t.preserved}</p><div class="diff"><article><h2>${t.before}</h2>${pre(diff.before, t.before)}</article><article><h2>${t.after}</h2>${pre(diff.after, t.after)}</article></div><details><summary>${t.fullBefore}</summary>${pre(JSON.stringify(p.before, null, 2), t.fullBefore)}</details><details><summary>${t.fullAfter}</summary>${pre(JSON.stringify(p.after, null, 2), t.fullAfter)}</details><aside>${t.review}</aside><p><small>${t.source}: ${escape(p.request.techniqueIds[0]!)} · ${p.sourceSha256} · ${p.previewSha256}</small></p></main></body></html>`;
}

export function renderAtlasCandidatePreviewMarkdown(
  p: AtlasOfflinePreview,
  locale: "el" | "en" = "el",
) {
  const t = atlasOfflineReviewCopy[locale],
    diff = p.diff[0]!;
  // Indented code blocks cannot be broken out of by user-provided Markdown fences.
  const block = (text: string) =>
    text
      .split("\n")
      .map((line) => "    " + line)
      .join("\n");
  return `# ${t.title}\n\n${t.warning}\n\n${t.field}: ${t.fields[diff.field]}\n\n${t.preserved}\n\n## ${t.before}\n\n${block(diff.before)}\n\n## ${t.after}\n\n${block(diff.after)}\n\n${t.review}\n\n${t.source}: ${p.sourceSha256}\n\nPreview SHA-256: ${p.previewSha256}\n`;
}
