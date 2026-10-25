export const LIBRARY_TABS = [
  { id: "tracks", label: { en: "My Tracks", el: "Τα τραγούδια μου" } },
  { id: "playlists", label: { en: "Playlists", el: "Λίστες αναπαραγωγής" } },
  { id: "shared", label: { en: "Shared Links", el: "Shared Links" } },
  { id: "reviews", label: { en: "Private Reviews", el: "Private Reviews" } },
  { id: "prompts", label: { en: "Saved Prompts", el: "Αποθηκευμένα Prompts" } },
  { id: "favorites", label: { en: "My Favorites", el: "Τα Αγαπημένα μου" } },
  { id: "likes", label: { en: "Liked Tracks", el: "Τραγούδια που μου αρέσουν" } },
] as const;

export type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];

export const LIBRARY_TAB_IDS = LIBRARY_TABS.map((tab) => tab.id) as LibraryTab[];

export function isLibraryTab(value: unknown): value is LibraryTab {
  return typeof value === "string" && LIBRARY_TAB_IDS.includes(value as LibraryTab);
}

export function libraryTabLabel(tab: LibraryTab, language: "en" | "el") {
  return LIBRARY_TABS.find((item) => item.id === tab)?.label[language] ?? tab;
}
