import { useMemo, useState } from "react";
import { Check, ChevronDown, GitCompareArrows, Loader2, NotebookPen, Star, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

type Props = {
  projectId: string;
  projectName: string;
  language: string;
};

function sourceLabel(source: VersionChangeMetadata["source"], language: string) {
  const el = language === "el";
  if (source === "initial_generation") return el ? "Αρχική δημιουργία" : "Initial generation";
  if (source === "lyrics_workspace") return "Lyrics Workspace";
  if (source === "project_revision") return "Project Revision";
  if (source === "advanced_generator") return "AI Generator";
  return el ? "Χειροκίνητη επεξεργασία" : "Manual edit";
}

export function ProjectVersionHistory({ projectId, projectName, language }: Props) {
  const el = language === "el";
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [noteEditingId, setNoteEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [preferredBusy, setPreferredBusy] = useState<string | null>(null);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string>("");
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["project-version-history", projectId],
    queryFn: () => listProjectVersionHistory({ data: { projectId } }),
  });

  const versions = history.data?.versions ?? [];
  const preferredId = history.data?.project.preferred_prompt_id ?? null;

  const selectedOpen = useQuery({
    queryKey: ["project-version-open", projectId, openVersionId],
    queryFn: () => getPromptRevisionBase({ data: { projectId, basePromptId: openVersionId! } }),
    enabled: Boolean(openVersionId),
  });

  const compareLeft = versions.find((version) => version.id === compareLeftId) ?? null;

  const compareOptions = useMemo(() => {
    if (!compareLeftId) return [];
    return versions.filter((version) => version.id !== compareLeftId);
  }, [compareLeftId, versions]);

  const startCompare = (id: string) => {
    setCompareLeftId(id);
    setCompareRightId("");
    setOpenVersionId(null);
  };

  const saveNote = async (versionId: string) => {
    if (savingNote) return;
    setSavingNote(true);
    try {
      await updateVersionUserNote({ data: { id: versionId, note: noteDraft } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-version-history", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      ]);
      setNoteEditingId(null);
    } finally {
      setSavingNote(false);
    }
  };

  const togglePreferred = async (versionId: string) => {
    if (preferredBusy) return;
    setPreferredBusy(versionId);
    try {
      await setPreferredProjectVersion({
        data: {
          projectId,
          promptId: preferredId === versionId ? null : versionId,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-version-history", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      ]);
    } finally {
      setPreferredBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl border border-accent/20 p-4">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{el ? "Ιστορικό εκδόσεων" : "Version History"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {el ? "Η δημιουργική πορεία του project, έκδοση προς έκδοση." : "The creative journey of this project, version by version."}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>

        {expanded && (
          <div className="mt-4">
            {history.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{el ? "Φόρτωση ιστορικού..." : "Loading history..."}</div>}
            {history.error && <p className="text-xs text-red-400">{history.error instanceof Error ? history.error.message : (el ? "Το ιστορικό δεν φορτώθηκε." : "History could not be loaded.")}</p>}
            {!history.isLoading && versions.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">{el ? "Δεν υπάρχουν ακόμη αποθηκευμένες εκδόσεις." : "No saved versions yet."}</p>}

            <div className="space-y-3">
              {versions.map((version, index) => {
                const metadata = version.version_change_metadata as VersionChangeMetadata | null;
                const isPreferred = preferredId === version.id;
                const versionLabel = `V${version.version_number ?? index + 1}`;
                const chips = metadata ? versionChangeChips(metadata) : [];
                const isNoteEditing = noteEditingId === version.id;

                return (
                  <article key={version.id} className={cn("rounded-xl border p-3", isPreferred ? "border-accent/40 bg-accent/[0.045]" : "border-white/10 bg-black/20")}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">{versionLabel}</span>
                          <h4 className="font-display text-sm font-bold">{metadata?.title ?? version.version_label ?? (index === 0 ? (el ? "Αρχική έκδοση" : "Initial version") : (el ? "Νέα έκδοση" : "New version"))}</h4>
                          {isPreferred && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300"><Star className="h-3 w-3 fill-current" />{el ? "Προτιμώμενη" : "Preferred"}</span>}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{metadata?.summary ?? (el ? "Αποθηκευμένη έκδοση του project." : "Saved project version.")}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {chips.map((chip) => <span key={chip} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">{chip}</span>)}
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {metadata ? sourceLabel(metadata.source, language) : (el ? "Αποθηκευμένη έκδοση" : "Saved version")}
                          {" · "}
                          {new Date(version.created_at).toLocaleString(el ? "el-GR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => { setOpenVersionId(version.id); setCompareLeftId(null); setCompareRightId(""); }} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:border-accent/30 hover:text-accent">
                          {el ? "Άνοιγμα έκδοσης" : "Open Version"}
                        </button>
                        {versions.length > 1 && <button type="button" onClick={() => startCompare(version.id)} className="inline-flex items-center gap-1 rounded-lg border border-accent/25 px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/5"><GitCompareArrows className="h-3.5 w-3.5" />{el ? "Σύγκριση" : "Compare"}</button>}
                        <button
                          type="button"
                          onClick={() => togglePreferred(version.id)}
                          disabled={Boolean(preferredBusy)}
                          className={cn("rounded-lg border p-1.5", isPreferred ? "border-amber-400/30 text-amber-300" : "border-white/10 text-muted-foreground hover:text-amber-300")}
                          aria-label={isPreferred ? (el ? "Αφαίρεση προτιμώμενης έκδοσης" : "Unmark preferred version") : (el ? "Ορισμός ως προτιμώμενη έκδοση" : "Mark as preferred")}
                        >
                          {preferredBusy === version.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className={cn("h-3.5 w-3.5", isPreferred && "fill-current")} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteEditingId(isNoteEditing ? null : version.id);
                            setNoteDraft(version.version_user_note ?? "");
                          }}
                          className="rounded-lg border border-white/10 p-1.5 text-muted-foreground hover:text-accent"
                          aria-label={el ? "Σημείωση έκδοσης" : "Version note"}
                        >
                          <NotebookPen className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {metadata?.userRequest && (
                      <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2.5">
                        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Αίτημα χρήστη" : "User request"}</summary>
                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">{metadata.userRequest}</p>
                      </details>
                    )}

                    {version.version_user_note && !isNoteEditing && (
                      <div className="mt-3 rounded-lg border border-accent/15 bg-accent/[0.025] p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{el ? "Η σημείωσή μου" : "My note"}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{version.version_user_note}</p>
                      </div>
                    )}

                    {isNoteEditing && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2.5">
                        <textarea
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value.slice(0, 1000))}
                          maxLength={1000}
                          rows={3}
                          placeholder={el ? "Προσωπική σημείωση για αυτή την έκδοση..." : "Personal note for this version..."}
                          className="w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs outline-none focus:border-accent/40"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">{noteDraft.length}/1000</span>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => setNoteEditingId(null)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-muted-foreground">{el ? "Ακύρωση" : "Cancel"}</button>
                            <button type="button" onClick={() => saveNote(version.id)} disabled={savingNote} className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-[11px] font-semibold text-accent disabled:opacity-50">
                              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {el ? "Αποθήκευση" : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {compareLeftId && !compareRightId && (
        <section className="glass rounded-2xl border border-accent/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{el ? "Επιλογή σύγκρισης" : "Choose comparison"}</p>
              <h3 className="mt-1 text-sm font-bold">{el ? `Σύγκρινε το V${compareLeft?.version_number ?? "?"} με:` : `Compare V${compareLeft?.version_number ?? "?"} with:`}</h3>
            </div>
            <button type="button" onClick={() => setCompareLeftId(null)} className="rounded-lg border border-white/10 p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {compareOptions.map((version) => {
              const isParent = compareLeft?.parent_prompt_id === version.id;
              return (
                <button key={version.id} type="button" onClick={() => setCompareRightId(version.id)} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-colors hover:border-accent/40">
                  <p className="text-xs font-bold text-accent">V{version.version_number ?? "?"}{isParent ? (el ? " · Προηγούμενη έκδοση" : " · Previous version") : ""}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{version.version_change_metadata?.title ?? version.version_label ?? (el ? "Αποθηκευμένη έκδοση" : "Saved version")}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {compareLeftId && compareRightId && (
        <ProjectVersionCompare
          projectId={projectId}
          leftId={compareLeftId}
          rightId={compareRightId}
          versions={versions}
          language={language}
          onClose={() => { setCompareLeftId(null); setCompareRightId(""); }}
          onSelectRight={setCompareRightId}
        />
      )}

      {openVersionId && (
        <section className="glass rounded-2xl border border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{el ? "Αποθηκευμένη έκδοση" : "Saved Version"}</p>
              <h3 className="mt-1 font-display text-base font-bold">{projectName} · V{selectedOpen.data?.prompt.version_number ?? "?"}</h3>
            </div>
            <button type="button" onClick={() => setOpenVersionId(null)} className="rounded-lg border border-white/10 p-2 text-muted-foreground" aria-label={el ? "Κλείσιμο" : "Close"}><X className="h-4 w-4" /></button>
          </div>
          {selectedOpen.isLoading && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{el ? "Φόρτωση έκδοσης..." : "Loading version..."}</div>}
          {selectedOpen.error && <p className="mt-4 text-xs text-red-400">{selectedOpen.error instanceof Error ? selectedOpen.error.message : (el ? "Η έκδοση δεν φορτώθηκε." : "Version could not be loaded.")}</p>}
          {selectedOpen.data && (() => {
            const prompt = selectedOpen.data.prompt;
            const snapshot = prompt.generator_input_snapshot;
            const bpm = snapshot
              ? snapshot.bpmMode === "Custom" && snapshot.customBpm
                ? `${snapshot.customBpm} BPM`
                : snapshot.bpmMode
              : "";
            return (
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    [el ? "Τίτλος" : "Title", prompt.title],
                    [el ? "Θέμα" : "Theme", snapshot?.theme || prompt.theme],
                    [el ? "Είδος" : "Genre", prompt.genre],
                    [el ? "Διάθεση" : "Mood", prompt.mood],
                    [el ? "Γλώσσα" : "Language", prompt.language],
                    ["BPM", bpm],
                    [el ? "Πλατφόρμα" : "Target Platform", snapshot?.targetPlatform],
                    [el ? "Μοντέλο" : "Generation Model", snapshot?.generationModel],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{value || "—"}</p>
                    </div>
                  ))}
                </div>
                {snapshot?.songStructure?.length ? <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Song Structure</p><p className="mt-1 text-xs leading-5">{snapshot.songStructure.join(" → ")}</p></div> : null}
                {snapshot?.productionStyle && <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Στυλ παραγωγής" : "Production Style"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{snapshot.productionStyle}</p></div>}
                {snapshot?.additionalInstructions && <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Πρόσθετες οδηγίες" : "Additional Instructions"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{snapshot.additionalInstructions}</p></div>}
                {prompt.tags && <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Music Style / Prompt</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{prompt.tags}</p></div>}
                {prompt.note && <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Σημείωση παραγωγού" : "Producer Note"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{prompt.note}</p></div>}
                {prompt.lyrics && <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Στίχοι" : "Lyrics"}</p><pre className="mt-2 max-h-[28rem] overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5">{prompt.lyrics}</pre></div>}
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
