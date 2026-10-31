import { z } from "zod";

function hasUnsafeControls(value: string) {
  return Array.from(value).some((c) => {
    const n = c.charCodeAt(0);
    return (n < 32 && ![9, 10, 13].includes(n)) || (n >= 127 && n <= 159);
  });
}

export const PROMPT_MAX_BYTES = 128 * 1024;
export const PROMPT_PLACEHOLDERS = [
  "CORE_IDEA",
  "GENRES",
  "MOOD",
  "LANGUAGE",
  "TARGET_PLATFORM",
  "SONG_STRUCTURE",
  "PRODUCTION_STYLE",
  "ADDITIONAL_INSTRUCTIONS",
  "SONG_BLUEPRINT",
] as const;
export const promptBindingSchema = z
  .object({
    id: z.string().guid(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    label: z.string().max(160),
    experimental: z.boolean(),
  })
  .strict();
export type PromptBinding = z.infer<typeof promptBindingSchema>;
export type PromptCatalogItem = {
  id: string;
  label: string;
  family: "legacy" | "master_v1";
  builtin_version: string | null;
  digest: string;
  status: "experimental" | "archived";
  created_at: string;
  ever_used: boolean;
  is_default: boolean;
};

/** Syntactic import validation is not a claim that arbitrary prose obeys its contract. */
export function validatePromptTemplate(content: string): string {
  if (
    new TextEncoder().encode(content).length > PROMPT_MAX_BYTES ||
    content.length < 100 ||
    hasUnsafeControls(content)
  )
    throw new Error("Invalid template content");
  const matches = [...content.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]);
  if (
    matches.length !== 9 ||
    PROMPT_PLACEHOLDERS.some((key) => matches.filter((k) => k === key).length !== 1)
  )
    throw new Error("The nine required placeholders must occur exactly once");
  // Require the literal four-key output example, with nonempty string values.
  const examples = [...content.matchAll(/\{\s*"title"\s*:[\s\S]*?\}/g)];
  if (
    !examples.some((m) => {
      try {
        const v = JSON.parse(m[0]);
        return (
          Object.keys(v).sort().join(",") === "lyrics,note,tags,title" &&
          Object.values(v).every((x) => typeof x === "string" && x.length > 0)
        );
      } catch {
        return false;
      }
    })
  )
    throw new Error("A four-string JSON output contract is required");
  return content;
}

export function decodePromptImport(filename: string, bytes: Uint8Array) {
  if (
    !/^[^/\\]{1,160}\.(md|txt)$/i.test(filename) ||
    hasUnsafeControls(filename) ||
    bytes.length > PROMPT_MAX_BYTES
  )
    throw new Error("Invalid UTF-8 .md/.txt file");
  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  // No newline/Unicode normalization: the digest binds the actual imported text.
  return validatePromptTemplate(content);
}
