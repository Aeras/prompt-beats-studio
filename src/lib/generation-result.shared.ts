import { z } from "zod";

export const generationOutput = z.object({
  title: z.string().trim().min(1).max(200),
  tags: z.string().trim().min(1).max(4000),
  lyrics: z.string().trim().min(1).max(12000),
  note: z.string().trim().min(1).max(6000),
});

export function parseSections(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let title = "";
  let sections: { tags: string; lyrics: string; note: string } | null = null;
  try {
    const parsed = JSON.parse(cleaned) as {
      title?: string;
      tags?: string;
      lyrics?: string;
      note?: string;
    };
    if (parsed.tags || parsed.lyrics || parsed.note || parsed.title) {
      title = (parsed.title ?? "").trim();
      sections = { tags: parsed.tags ?? "", lyrics: parsed.lyrics ?? "", note: parsed.note ?? "" };
    }
  } catch {
    /* fall through to text parsing */
  }
  if (!sections) {
    const grab = (start: RegExp, end: RegExp | null) => {
      const s = cleaned.search(start);
      if (s === -1) return "";
      const rest = cleaned.slice(s).replace(start, "");
      if (!end) return rest.trim();
      const e = rest.search(end);
      return (e === -1 ? rest : rest.slice(0, e)).trim();
    };
    title = grab(/^Title:\s*/im, /\n/) || "";
    sections = {
      tags: grab(/1\)\s*\*{0,2}Style Prompt[^\n]*\n?/i, /2\)\s*\*{0,2}Lyrics/i),
      lyrics: grab(/2\)\s*\*{0,2}Lyrics[^\n]*\n?/i, /3\)\s*\*{0,2}Producer/i),
      note: grab(/3\)\s*\*{0,2}Producer[^\n]*\n?/i, null),
    };
  }
  return { title, tags: sections.tags, lyrics: sections.lyrics, note: sections.note };
}

/** A stored response is terminally rejected only by the same deterministic
 * song validator. Valid content and ambiguous provider termination stay recoverable. */
export function classifyStoredSongFailure(
  result: unknown,
): "invalid_response" | "incomplete_response" | null {
  const envelope = z
    .object({ text: z.string(), stopReason: z.string().nullable() })
    .safeParse(result);
  if (!envelope.success) return null;
  if (generationOutput.safeParse(parseSections(envelope.data.text)).success) return null;
  if (envelope.data.stopReason === "end_turn") return "invalid_response";
  if (envelope.data.stopReason === "max_tokens") return "incomplete_response";
  return null;
}
