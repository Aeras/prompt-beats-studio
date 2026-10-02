const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExplicitObjectSelection =
  { mode: "absent" } | { mode: "invalid" } | { mode: "valid"; id: string };

export function preserveExplicitObjectSearch(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseExplicitObjectSelection(value: string | undefined): ExplicitObjectSelection {
  if (value === undefined) return { mode: "absent" };
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) return { mode: "invalid" };
  return { mode: "valid", id: normalized.toLowerCase() };
}
