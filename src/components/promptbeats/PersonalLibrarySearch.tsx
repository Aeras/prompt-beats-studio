import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import {
  PERSONAL_LIBRARY_SEARCH_TYPES,
  searchPersonalLibrary,
  type PersonalLibrarySearchResult,
  type PersonalLibrarySearchType,
} from "@/lib/personal-library-search.functions";

const TYPE_LABELS: Record<PersonalLibrarySearchType, { en: string; el: string }> = {
  track: { en: "Tracks", el: "Τραγούδια" },
  project: { en: "Projects", el: "Projects" },
  prompt: { en: "Prompts", el: "Prompts" },
  version: { en: "Versions", el: "Εκδόσεις" },
  analysis: { en: "Analyses", el: "Αναλύσεις" },
  inspiration_wall: { en: "Inspiration Walls", el: "Inspiration Walls" },
  story_map: { en: "Story Maps", el: "Story Maps" },
  song_universe: { en: "Song Universes", el: "Song Universes" },
};

const RECENCY_OPTIONS = [
  { value: "all", en: "Any time", el: "Οποτεδήποτε" },
  { value: "7", en: "Last 7 days", el: "Τελευταίες 7 ημέρες" },
  { value: "30", en: "Last 30 days", el: "Τελευταίες 30 ημέρες" },
  { value: "90", en: "Last 90 days", el: "Τελευταίες 90 ημέρες" },
  { value: "365", en: "Last year", el: "Τελευταίο έτος" },
] as const;

type Props = {
  className?: string;
};

export function PersonalLibrarySearch({ className }: Props) {
  const { language } = useI18n();
  const navigate = useNavigate();
  const el = language === "el";
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PersonalLibrarySearchType | "all">("all");
  const [recency, setRecency] = useState<(typeof RECENCY_OPTIONS)[number]["value"]>("all");

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [input]);

  const types = useMemo(() => (type === "all" ? undefined : [type]), [type]);
  const recencyDays = recency === "all" ? null : Number(recency);
  const search = useQuery({
    queryKey: ["library", "personal-search", query, type, recency],
    queryFn: () =>
      searchPersonalLibrary({
        data: { query, types, recencyDays, limit: 50 },
      }),
    enabled: query.length > 0,
    staleTime: 15_000,
  });

  const results = search.data?.results ?? [];

  const openResult = (result: PersonalLibrarySearchResult) => {
    if (result.target_path === "/library") {
      void navigate({
        to: "/library",
        search: result.target_tab ? { tab: result.target_tab } : {},
      });
      return;
    }
    void navigate({ to: result.target_path });
  };

  return (
    <section
      className={cn("glass rounded-2xl p-4", className)}
      aria-label={el ? "Αναζήτηση στη δουλειά μου" : "Search my work"}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{el ? "Αναζήτηση στη δουλειά μου" : "Search my work"}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              el
                ? "Βρες τραγούδι, Project, prompt, ανάλυση..."
                : "Find a track, Project, prompt, analysis..."
            }
            maxLength={120}
            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent/60"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              aria-label={el ? "Καθαρισμός αναζήτησης" : "Clear search"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <select
          value={type}
          onChange={(event) => setType(event.target.value as PersonalLibrarySearchType | "all")}
          aria-label={el ? "Τύπος αντικειμένου" : "Object type"}
          className="h-10 rounded-xl border border-white/10 bg-background px-3 text-sm"
        >
          <option value="all">{el ? "Όλοι οι τύποι" : "All types"}</option>
          {PERSONAL_LIBRARY_SEARCH_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABELS[value][el ? "el" : "en"]}
            </option>
          ))}
        </select>

        <select
          value={recency}
          onChange={(event) => setRecency(event.target.value as typeof recency)}
          aria-label={el ? "Χρονικό διάστημα" : "Recency"}
          className="h-10 rounded-xl border border-white/10 bg-background px-3 text-sm"
        >
          {RECENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option[el ? "el" : "en"]}
            </option>
          ))}
        </select>
      </div>

      {query && (
        <div className="mt-3" aria-live="polite">
          {search.isLoading ? (
            <p className="text-sm text-muted-foreground">{el ? "Αναζήτηση..." : "Searching..."}</p>
          ) : search.isError ? (
            <p className="text-sm text-destructive">
              {el ? "Η αναζήτηση απέτυχε." : "Search failed."}
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {el
                ? "Δεν βρέθηκε κάτι στη δουλειά σου."
                : "Nothing in your work matched this search."}
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {results.map((result) => (
                <button
                  key={`${result.item_type}:${result.item_id}`}
                  type="button"
                  onClick={() => openResult(result)}
                  className="rounded-xl border border-white/10 bg-black/15 p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{result.title}</span>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {TYPE_LABELS[result.item_type][el ? "el" : "en"]}
                    </span>
                  </div>
                  {result.subtitle && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {result.subtitle}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
