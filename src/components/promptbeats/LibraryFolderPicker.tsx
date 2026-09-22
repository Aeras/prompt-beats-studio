import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, Home, Loader2, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  getLibraryFolderBreadcrumbs,
  listLibraryFolderContents,
  searchLibraryFolders,
} from "@/lib/library-folders.functions";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  language: string;
  title: string;
  confirmLabel: string;
  initialFolderId?: string | null;
  excludedFolderIds?: string[];
  disabledDestinationFolderId?: string | null | undefined;
  onClose: () => void;
  onSelect: (folderId: string | null, path: string) => void;
};

export function LibraryFolderPicker({
  open,
  language,
  title,
  confirmLabel,
  initialFolderId = null,
  excludedFolderIds = [],
  disabledDestinationFolderId,
  onClose,
  onSelect,
}: Props) {
  const el = language === "el";
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setCurrentFolderId(initialFolderId ?? null);
    setQuery("");
  }, [initialFolderId, open]);

  const contents = useQuery({
    queryKey: ["library", "folder-picker", "contents", currentFolderId],
    queryFn: () => listLibraryFolderContents({ data: { folderId: currentFolderId } }),
    enabled: open && !query.trim(),
  });

  const breadcrumbs = useQuery({
    queryKey: ["library", "folder-picker", "breadcrumbs", currentFolderId],
    queryFn: () => getLibraryFolderBreadcrumbs({ data: { folderId: currentFolderId! } }),
    enabled: open && Boolean(currentFolderId) && !query.trim(),
  });

  const search = useQuery({
    queryKey: ["library", "folder-picker", "search", query.trim()],
    queryFn: () => searchLibraryFolders({ data: { query: query.trim() } }),
    enabled: open && query.trim().length > 0,
  });

  const excluded = useMemo(() => new Set(excludedFolderIds), [excludedFolderIds]);
  const destinationDisabled = (folderId: string | null) =>
    disabledDestinationFolderId !== undefined && folderId === disabledDestinationFolderId;
  const childFolders = (contents.data?.folders ?? []).filter((folder) => !excluded.has(folder.id));
  const searchFolders = (search.data?.folders ?? []).filter((folder) => !excluded.has(folder.id));

  if (!open) return null;

  const breadcrumbItems = breadcrumbs.data?.breadcrumbs ?? [];
  const currentPath = currentFolderId
    ? breadcrumbItems.map((item) => item.name).join(" / ")
    : el ? "Αρχική" : "Root";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-strong flex max-h-[86vh] w-full max-w-xl flex-col rounded-t-3xl border border-white/10 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {el ? "Διάλεξε φάκελο προορισμού ή την Αρχική." : "Choose a destination folder or Root."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-foreground" aria-label={el ? "Κλείσιμο" : "Close"}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={el ? "Αναζήτηση φακέλου..." : "Search folders..."}
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent/50"
            />
          </label>

          {!query.trim() && (
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 text-xs [scrollbar-width:none]">
              <button type="button" onClick={() => setCurrentFolderId(null)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground hover:bg-white/5 hover:text-accent">
                <Home className="h-3.5 w-3.5" />{el ? "Αρχική" : "Root"}
              </button>
              {breadcrumbItems.map((item) => (
                <span key={item.id} className="inline-flex shrink-0 items-center">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                  <button type="button" onClick={() => setCurrentFolderId(item.id)} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-white/5 hover:text-accent">
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {query.trim() ? (
            search.isLoading ? (
              <Loading language={language} />
            ) : searchFolders.length ? (
              <div className="space-y-2">
                {searchFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    disabled={destinationDisabled(folder.id)}
                    onClick={() => onSelect(folder.id, folder.path)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Folder className="h-5 w-5 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{folder.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{folder.path}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted-foreground">
                {el ? "Δεν βρέθηκαν φάκελοι." : "No folders found."}
              </p>
            )
          ) : contents.isLoading ? (
            <Loading language={language} />
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled={destinationDisabled(null)}
                onClick={() => onSelect(null, el ? "Αρχική" : "Root")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-40",
                  currentFolderId === null
                    ? "border-accent/30 bg-accent/[0.06] text-accent"
                    : "border-white/10 bg-black/20 hover:border-accent/40",
                )}
              >
                <Home className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">{el ? "Αρχική" : "Root"}</span>
                  <span className="block text-[11px] text-muted-foreground">{el ? "Εκτός φακέλων" : "Outside folders"}</span>
                </span>
              </button>

              {childFolders.map((folder) => (
                <div key={folder.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:text-accent"
                  >
                    <Folder className="h-5 w-5 shrink-0 text-accent" />
                    <span className="truncate text-sm font-semibold">{folder.name}</span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    disabled={destinationDisabled(folder.id)}
                    onClick={() => onSelect(folder.id, [...breadcrumbItems.map((item) => item.name), folder.name].join(" / "))}
                    className="shrink-0 rounded-lg border border-accent/30 px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {confirmLabel}
                  </button>
                </div>
              ))}

              {!childFolders.length && (
                <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted-foreground">
                  {el ? "Δεν υπάρχουν υποφάκελοι εδώ." : "No subfolders here."}
                </p>
              )}
            </div>
          )}
        </div>

        {!query.trim() && currentFolderId && (
          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              disabled={destinationDisabled(currentFolderId)}
              onClick={() => onSelect(currentFolderId, currentPath)}
              className="w-full rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirmLabel}: {currentPath}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Loading({ language }: { language: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {language === "el" ? "Φόρτωση..." : "Loading..."}
    </div>
  );
}
