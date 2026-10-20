export type ImportedSongMarkdown = {
  title: string;
  tags: string;
  lyrics: string;
  note: string;
};

export const SONG_MARKDOWN_MAX_BYTES = 256 * 1024;

/**
 * Parses the exact sectioned Markdown format produced by Generator's
 * "Export Test (.md)" without interpreting its content as commands.
 */
export function parseSongMarkdown(raw: string): ImportedSongMarkdown | null {
  if (raw.length > SONG_MARKDOWN_MAX_BYTES || !raw.trim()) return null;
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("# PromptBeats Generator Test Result")) return null;
  const headings = [...normalized.matchAll(/^## (Title|Music Style|Lyrics|Producer Note)\s*$/gm)];
  if (headings.length !== 4) return null;
  const expected = ["Title", "Music Style", "Lyrics", "Producer Note"];
  if (headings.some((heading, index) => heading[1] !== expected[index])) return null;
  const values = headings.map((heading, index) =>
    normalized
      .slice(
        (heading.index ?? 0) + heading[0].length,
        index + 1 < headings.length
          ? (headings[index + 1]?.index ?? normalized.length)
          : normalized.length,
      )
      .trim(),
  );
  const [title, tags, lyrics, note] = values;
  if (!title || !tags || !lyrics || !note) return null;
  if (title.length > 200 || tags.length > 4000 || lyrics.length > 12000 || note.length > 6000)
    return null;
  return { title, tags, lyrics, note };
}
