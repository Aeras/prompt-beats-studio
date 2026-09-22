import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, GitCompareArrows, History, Loader2, NotebookPen, Star, X } from "lucide-react";

import { useI18n } from "@/i18n";
import {
  getPromptRevisionBase,
  listProjectVersionHistory,
  setPreferredProjectVersion,
  updateVersionUserNote,
} from "@/lib/ai.functions";
import {
  versionChangeChips,
  type VersionChangeMetadata,
} from "@/lib/project-version-history.shared";
import { cn } from "@/lib/utils";
import { ProjectVersionCompare } from "@/components/promptbeats/ProjectVersionCompare";

type HistoryVersion = {
  id: string;
  title: string | null;
  custom_name: string | null;
  version_number: number | null;
  version_label: string | null;
  parent_prompt_id: string | null;
  version_change_metadata: VersionChangeMetadata | null;
  version_user_note: string | null;
  created_at: string;
};

type Props = {
  projectId: string;
  projectName: string;
};

function sourceLabel(source: VersionChangeMetadata["source"], el: boolean) {
  const labels = {
    initial_generation: el ? "Αρχική δημιουργία" : "Initial Generation",
    lyrics_workspace: "Lyrics Workspace",
    project_revision: el ? "Project Revision" : "Project Revision",
    advanced_generator: "Advanced Generator",
    manual_edit: el ? "Χειροκίνητη επεξεργασία" : "Manual edit",
  } as const;
  return labels[source];
}

function formatWhen(value: string, el: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(el ? "el-GR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ProjectVersionHistory({ projectId, projectName }: Props) {
  const { language } = useI18n();
  const el = language === "el";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const [comparePair, setComparePair] = useState<{ leftId: string; rightId: string } | null>(null);
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  const [noteVersionId, setNoteVersionId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [preferredSaving, setPreferredSaving] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["library", "project-version-history", projectId],
    queryFn: () => listProjectVersionHistory({ data: { projectId } }),
  });

  const versions = (history.data?.versions ?? []) as HistoryVersion[];
  const preferredPromptId = history.data?.project.preferred_prompt_id ?? null;

  useEffect(() => {
    setCompareBaseId(null);
    setComparePair(null);
    setOpenVersionId(null);
    setNoteVersionId(null);
  }, [projectId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "project-version-history", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
    ]);
  };

  const saveNote = async (version: HistoryVersion) => {
    if (noteSaving) return;
    setNoteSaving(true);
    try {
      await updateVersionUserNote({ data: { id: version.id, note: noteDraft } });
      await refresh();
      setNoteVersionId(null);
    } finally {
      setNoteSaving(false);
    }
  };

  const togglePreferred = async (versionId: string) => {
    if (preferredSaving) return;
    setPreferredSaving(versionId);
    try {
      await setPreferredProjectVersion({
        data: {
          projectId,
          promptId: preferredPromptId === versionId ? null : versionId,
        },
      });
      await refresh();
    } finally {
      setPreferredSaving(null);
    }
  };

  const openVersion = useQuery({
    queryKey: ["library", "project-version-detail", projectId, openVersionId],
    queryFn: () => getPromptRevisionBase({
      data: { projectId, basePromptId: openVersionId! },
    }),
    enabled: Boolean(openVersionId),
  });

  return (
    <>
      <section className="glass overflow-hidden rounded-2xl border border-accent/20">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10">
            <History className="h-4 w-4 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{el ? "Ιστορικό εκδόσεων" : "Version History"}</span>
            <span className="block text-[11px] text-muted-foreground">
              {el ? "Η εξέλιξη του project, έκδοση προς έκδοση." : "The creative evolution of this project, version by version."}
            </span>
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            {versions.length}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="border-t border-white/10 p-3 sm:p-4">
            {history.isLoading ? (
              <div className="flex min-h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
            ) : history.isError ? (
              <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                {el ? "Δεν ήταν δυνατή η φόρτωση του ιστορικού." : "Version history could not be loaded."}
              </p>
            ) : versions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">
                {el ? "Δεν υπάρχουν ακόμη αποθηκευμένες εκδόσεις." : "No saved versions yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((version, index) => {
                  const metadata = version.version_change_metadata;
                  const isPreferred = preferredPromptId === version.id;
                  const title = metadata?.title
                    ?? (index === 0 ? (el ? "Αρχική έκδοση" : "Initial version") : version.version_label)
                    ?? (el ? "Αποθηκευμένη έκδοση" : "Saved version");
                  const summary = metadata?.summary
                    ?? (el ? "Αποθηκευμένη έκδοση αυτού του project." : "A saved version of this project.");
                  const chips = metadata ? versionChangeChips(metadata) : [];
                  const isNoteOpen = noteVersionId === version.id;

                  return (
                    <article
                      key={version.id}
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        isPreferred ? "border-accent/45 bg-accent/[0.06]" : "border-white/10 bg-black/20",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 min-w-9 items-center justify-center rounded-lg border border-white/10 bg-black/30 px-2 text-[11px] font-bold text-accent">
                          {version.version_number ? `V${version.version_number}` : "—"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xs font-semibold text-foreground">{title}</h3>
                            {isPreferred && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold text-accent">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {el ? "Προτιμώμενη" : "Preferred"}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{summary}</p>

                          {chips.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {chips.map((chip) => (
                                <span key={chip} className="rounded-full border border-accent/20 bg-accent/[0.06] px-2 py-0.5 text-[9px] text-accent">
                                  {chip}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                            {metadata && <span>{sourceLabel(metadata.source, el)}</span>}
                            <span>{formatWhen(version.created_at, el)}</span>
                            {metadata?.userRequest && (
                              <details className="basis-full">
                                <summary className="cursor-pointer text-accent/80">{el ? "Αίτημα αλλαγής" : "Change request"}</summary>
                                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-2 text-[10px] leading-4 text-muted-foreground">
                                  {metadata.userRequest}
                                </p>
                              </details>
                            )}
                          </div>

                          {version.version_user_note && !isNoteOpen && (
                            <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                                {el ? "Δική μου σημείωση" : "My note"}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground">{version.version_user_note}</p>
                            </div>
                          )}

                          {isNoteOpen && (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={noteDraft}
                                maxLength={1000}
                                rows={3}
                                onChange={(event) => setNoteDraft(event.target.value)}
                                placeholder={el ? "π.χ. Αυτή είναι η έκδοση που προτιμώ." : "e.g. This is the version I prefer."}
                                className="w-full resize-y rounded-lg border border-white/10 bg-black/35 p-2 text-xs outline-none focus:border-accent/50"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] text-muted-foreground">{noteDraft.length}/1000</span>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => setNoteVersionId(null)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                                    {el ? "Ακύρωση" : "Cancel"}
                                  </button>
                                  <button type="button" onClick={() => void saveNote(version)} disabled={noteSaving} className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-[10px] font-semibold text-accent disabled:opacity-50">
                                    {noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    {el ? "Αποθήκευση" : "Save"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenVersionId(version.id)}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:border-accent/30 hover:text-accent"
                        >
                          {el ? "Άνοιγμα έκδοσης" : "Open Version"}
                        </button>
                        {versions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCompareBaseId(compareBaseId === version.id ? null : version.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-accent/25 px-2.5 py-1.5 text-[10px] font-medium text-accent"
                          >
                            <GitCompareArrows className="h-3 w-3" />
                            {el ? "Σύγκριση" : "Compare"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNoteVersionId(version.id);
                            setNoteDraft(version.version_user_note ?? "");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-accent"
                        >
                          <NotebookPen className="h-3 w-3" />
                          {version.version_user_note ? (el ? "Επεξεργασία σημείωσης" : "Edit note") : (el ? "Προσθήκη σημείωσης" : "Add note")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void togglePreferred(version.id)}
                          disabled={Boolean(preferredSaving)}
                          aria-pressed={isPreferred}
                          className={cn(
                            "ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] disabled:opacity-50",
                            isPreferred ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:text-accent",
                          )}
                        >
                          {preferredSaving === version.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className={cn("h-3 w-3", isPreferred && "fill-current")} />}
                          {isPreferred ? (el ? "Προτιμώμενη" : "Preferred") : (el ? "Ορισμός ως προτιμώμενη" : "Mark preferred")}
                        </button>
                      </div>

                      {compareBaseId === version.id && (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent/20 bg-accent/[0.035] p-2 sm:flex-row sm:items-center">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {el ? `Σύγκριση V${version.version_number ?? "—"} με:` : `Compare V${version.version_number ?? "—"} with:`}
                          </span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              setComparePair({ leftId: version.id, rightId: event.target.value });
                              setCompareBaseId(null);
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"
                          >
                            <option value="">{el ? "Επίλεξε έκδοση" : "Select version"}</option>
                            {versions.filter((item) => item.id !== version.id).map((item) => (
                              <option key={item.id} value={item.id}>
                                V{item.version_number ?? "—"}
                                {item.id === version.parent_prompt_id ? (el ? " — Προηγούμενη έκδοση" : " — Previous version") : ""}
                                {item.version_change_metadata?.title ? ` — ${item.version_change_metadata.title}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {openVersionId && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={el ? "Αποθηκευμένη έκδοση" : "Saved version"} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-background p-4 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{projectName}</p>
                <h2 className="mt-1 font-display text-lg font-bold">
                  V{openVersion.data?.prompt.version_number ?? "—"} · {openVersion.data?.prompt.custom_name || openVersion.data?.prompt.title || (el ? "Αποθηκευμένη έκδοση" : "Saved version")}
                </h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {openVersion.data?.prompt.created_at ? formatWhen(openVersion.data.prompt.created_at, el) : ""}
                </p>
              </div>
              <button type="button" onClick={() => setOpenVersionId(null)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground" aria-label={el ? "Κλείσιμο" : "Close"}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {openVersion.isLoading ? (
              <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
            ) : openVersion.isError || !openVersion.data?.prompt ? (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                {el ? "Η έκδοση δεν ήταν δυνατό να ανοίξει." : "This version could not be opened."}
              </p>
            ) : (
              <VersionReadOnlyContent prompt={openVersion.data.prompt} el={el} />
            )}
          </div>
        </div>
      )}

      {comparePair && (
        <ProjectVersionCompare
          projectId={projectId}
          projectName={projectName}
          leftId={comparePair.leftId}
          rightId={comparePair.rightId}
          historyVersions={versions}
          onClose={() => setComparePair(null)}
        />
      )}
    </>
  );
}

function VersionReadOnlyContent({
  prompt,
  el,
}: {
  prompt: {
    theme: string;
    genre: string;
    mood: string;
    language: string;
    tags: string;
    lyrics: string;
    note: string;
    generator_input_snapshot: unknown | null;
  };
  el: boolean;
}) {
  const snapshot = prompt.generator_input_snapshot as Record<string, unknown> | null;
  const fields = [
    [el ? "Θέμα" : "Theme", snapshot?.theme ?? prompt.theme],
    [el ? "Μουσικό στυλ" : "Music Style", snapshot?.customMusicStyle ?? prompt.genre],
    [el ? "Διάθεση" : "Mood", snapshot?.customMood ?? prompt.mood],
    [el ? "Γλώσσα" : "Language", snapshot?.language ?? prompt.language],
    ["BPM", snapshot?.customBpm ?? ""],
    [el ? "Production Style" : "Production Style", snapshot?.productionStyle ?? ""],
    [el ? "Additional Instructions" : "Additional Instructions", snapshot?.additionalInstructions ?? ""],
  ].filter(([, value]) => typeof value === "string" && value.trim());

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-accent">{String(label)}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{String(value)}</p>
          </div>
        ))}
      </div>
      {prompt.tags && <ReadOnlyBlock label={el ? "Style Prompt" : "Style Prompt"} value={prompt.tags} />}
      {prompt.lyrics && <ReadOnlyBlock label={el ? "Στίχοι" : "Lyrics"} value={prompt.lyrics} large />}
      {prompt.note && <ReadOnlyBlock label={el ? "Producer Note" : "Producer Note"} value={prompt.note} />}
    </div>
  );
}

function ReadOnlyBlock({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-accent">{label}</p>
      <pre className={cn("mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground", large && "max-h-[45vh] overflow-y-auto")}>{value}</pre>
    </div>
  );
}
