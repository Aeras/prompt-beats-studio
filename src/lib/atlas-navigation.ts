// Presentation-only paths. Never compile these browsing choices into Generator inputs.
export const ATLAS_NAV_LEVELS = [
  "continentId",
  "countryId",
  "genreId",
  "subcategoryId",
  "profileId",
] as const;
export type AtlasNavLevel = (typeof ATLAS_NAV_LEVELS)[number];
export type AtlasFilters = Record<AtlasNavLevel, string>;
export type AtlasNavEntry = AtlasFilters & { romanizedName: string };
export const emptyAtlasFilters = (): AtlasFilters => ({
  continentId: "",
  countryId: "",
  genreId: "",
  subcategoryId: "",
  profileId: "",
});
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
  return [
    ...new Set(
      entries.filter((e) => parents.every((key) => e[key] === filters[key])).map((e) => e[level]),
    ),
  ];
}
export function matchesAtlasFilters(entry: AtlasNavEntry, filters: AtlasFilters): boolean {
  return ATLAS_NAV_LEVELS.every((key) => !filters[key] || entry[key] === filters[key]);
}
export function atlasProfileName(card: { name: string }, entry: AtlasNavEntry) {
  // RC1 supplies no approved localized names. Preserve script, explicitly romanize below.
  return {
    primary: card.name,
    primaryLang: "ru",
    secondary: entry.romanizedName === card.name ? null : entry.romanizedName,
    secondaryLang: "ru-Latn",
  };
}
