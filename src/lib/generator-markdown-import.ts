export type ImportedSongResult = {
  title: string;
  tags: string;
  lyrics: string;
  note: string;
};

export const MAX_SONG_MARKDOWN_BYTES = 256 * 1024;

/**
 * Parse the app's own "PromptBeats Generator Test Result" markdown export.
 * Never interpret markdown as HTML or accept arbitrary section guessing.
 */
export function parseGeneratorMarkdown(markdown: string): ImportedSongResult | null {
  const normalized = markdown.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  if (!normalized.startsWith("# PromptBeats Generator Test Result\n")) return null;
  const blocks = new Map<string, string>();
  const matches = [...normalized.matchAll(/^## (Title|Music Style|Lyrics|Producer Note)\s*$/gm)];
  if (matches.length !== 4 || matches.map((m) => m[1]).join("|") !==
      "Title|Music Style|Lyrics|Producer Note") return null;
  for (let i = 0; i < matches.length; i++) {
    const here = matches[i];
    if (!here || here.index === undefined) return null;
    const next = matches[i + 1]?.index ?? normalized.length;
    const headingEnd = here.index + here[0].length;
    blocks.set(here[1] ?? "", normalized.slice(headingEnd, next).trim());
  }
  const title = blocks.get("Title") ?? "";
  const tags = blocks.get("Music Style") ?? "";
  const lyrics = blocks.get("Lyrics") ?? "";
  const note = blocks.get("Producer Note") ?? "";
  if (!title || !tags || !lyrics || !note || [title, tags, lyrics, note].includes("—")) return null;
  if (title.length > 200 || tags.length > 4000 || lyrics.length > 12000 || note.length > 6000) return null;
  return { title, tags, lyrics, note };
}
