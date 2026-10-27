// Presentation-only paths. Never compile browsing facets into Generator inputs.
export const ATLAS_NAV_LEVELS = [
  "continentId",
  "countryId",
  "genreId",
  "subcategoryId",
  "profileId",
] as const;
export type AtlasNavLevel = (typeof ATLAS_NAV_LEVELS)[number];
export type AtlasFilters = Record<AtlasNavLevel, string>;
export const ATLAS_CATEGORY_KINDS = [
  "subgenre",
  "form",
  "scene",
  "context",
  "style",
  "general",
] as const;
export type AtlasCategoryKind = (typeof ATLAS_CATEGORY_KINDS)[number];
export type AtlasNavEntry = Omit<AtlasFilters, "subcategoryId"> & {
  romanizedName: string;
  sourceEntityType: string;
  classification: Record<AtlasCategoryKind, string[]>;
  evidence: { field: string; quote: string };
};
export const emptyAtlasFilters = (): AtlasFilters => ({
  continentId: "",
  countryId: "",
  genreId: "",
  subcategoryId: "",
  profileId: "",
});
/** Musical subgenres take priority; only absent subgenres use explicitly typed fallback paths.
 * Secondary facets (e.g. a historic scene surrounding a named style) remain separate metadata.
 */
export function atlasSubcategoryIds(entry: AtlasNavEntry): string[] {
  for (const kind of ATLAS_CATEGORY_KINDS)
    if (entry.classification[kind].length) return entry.classification[kind];
  return [];
}
export function atlasCategoryKind(id: string): AtlasCategoryKind | null {
  return ATLAS_CATEGORY_KINDS.find((kind) => id.startsWith(kind + ".")) ?? null;
}
function valuesFor(entry: AtlasNavEntry, level: AtlasNavLevel): string[] {
  return level === "subcategoryId" ? atlasSubcategoryIds(entry) : [entry[level]];
}
export function changeAtlasFilter(
  current: AtlasFilters,
  level: AtlasNavLevel,
  value: string,
): AtlasFilters {
  if (current[level] === value) return current;
  const next = { ...current, [level]: value };
  for (const child of ATLAS_NAV_LEVELS.slice(ATLAS_NAV_LEVELS.indexOf(level) + 1)) next[child] = "";
  return next;
}
export function atlasNavOptions(
  entries: readonly AtlasNavEntry[],
  filters: AtlasFilters,
  level: AtlasNavLevel,
): string[] {
  const parents = ATLAS_NAV_LEVELS.slice(0, ATLAS_NAV_LEVELS.indexOf(level));
  if (parents.some((key) => !filters[key])) return [];
  const options = [
    ...new Set(
      entries
        .filter((e) => parents.every((key) => valuesFor(e, key).includes(filters[key])))
        .flatMap((e) => valuesFor(e, level)),
    ),
  ];
  if (level === "subcategoryId")
    options.sort((a, b) => {
      const rank = (id: string) => ATLAS_CATEGORY_KINDS.indexOf(atlasCategoryKind(id) ?? "general");
      return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
  return options;
}
export function matchesAtlasFilters(entry: AtlasNavEntry, filters: AtlasFilters): boolean {
  return ATLAS_NAV_LEVELS.every(
    (key) => !filters[key] || valuesFor(entry, key).includes(filters[key]),
  );
}
export function atlasProfileName(card: { name: string }, entry: AtlasNavEntry) {
  return {
    primary: card.name,
    primaryLang: "ru",
    secondary: entry.romanizedName === card.name ? null : entry.romanizedName,
    secondaryLang: "ru-Latn",
  };
}
