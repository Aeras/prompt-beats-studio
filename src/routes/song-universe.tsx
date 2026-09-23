import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import {
  addProjectToSongUniverse,
  createSongUniverse,
  deleteSongUniverse,
  getSongUniverse,
  listSongUniverseProjectOptions,
  listSongUniverses,
  removeProjectFromSongUniverse,
  reorderSongUniverseProjects,
  updateSongUniverse,
  updateSongUniverseProject,
} from "@/lib/song-universe.functions";
import {
  SONG_UNIVERSE_BIBLE_SECTIONS,
  SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY,
  type SongUniverseBibleItem,
  type SongUniverseRecord,
  type SongUniverseStrength,
} from "@/lib/song-universe.shared";

export const Route = createFileRoute("/song-universe")({ component: SongUniversePage });

const sectionLabels: Record<
  (typeof SONG_UNIVERSE_BIBLE_SECTIONS)[number],
  { en: string; el: string }
> = {
  core_concept: { en: "Core Concept", el: "Κεντρική ιδέα" },
  emotional_palette: { en: "Emotional Palette", el: "Συναισθηματική παλέτα" },
  lyrical_themes: { en: "Lyrical Themes", el: "Στιχουργικά θέματα" },
  recurring_motifs: { en: "Recurring Motifs", el: "Επαναλαμβανόμενα μοτίβα" },
  musical_identity: { en: "Musical Identity", el: "Μουσική ταυτότητα" },
  production_identity: { en: "Production Identity", el: "Ταυτότητα παραγωγής" },
  vocal_identity: { en: "Vocal Identity", el: "Φωνητική ταυτότητα" },
  language_writing_identity: { en: "Language / Writing Identity", el: "Γλώσσα / ύφος γραφής" },
  structural_tendencies: { en: "Structural Tendencies", el: "Δομικές τάσεις" },
  things_to_avoid: { en: "Things to Avoid", el: "Προς αποφυγή" },
  allowed_deviations: { en: "Allowed Deviations", el: "Επιτρεπόμενες αποκλίσεις" },
};

function SongUniversePage() {
  const { language } = useI18n();
  const el = language === "el";
  const access = useFeatureAccess("song_universe");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["song-universes"],
    queryFn: () => listSongUniverses(),
    enabled: access.allowed,
  });
  const selected = useQuery({
    queryKey: ["song-universe", selectedId],
    queryFn: () => getSongUniverse({ data: { universeId: selectedId! } }),
    enabled: access.allowed && Boolean(selectedId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSongUniverse({
        data: {
          title: el ? "Νέο Song Universe" : "New Song Universe",
          universeType: "other",
        },
      }),
    onSuccess: async (result) => {
      setSelectedId(result.universe.id);
      await qc.invalidateQueries({ queryKey: ["song-universes"] });
    },
  });

  if (access.loading)
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  if (!access.allowed)
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">
          {el
            ? "Το Song Universe δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
            : "Song Universe is not available for this account."}
        </div>
      </AppShell>
    );

  return (
    <AppShell
      header={
        <div>
          <h1 className="font-display text-xl font-bold">Song Universes</h1>
          <p className="text-xs text-muted-foreground">
            {el
              ? "Κοινή δημιουργική ταυτότητα για πολλά τραγούδια."
              : "Build a shared creative world across multiple songs."}
          </p>
        </div>
      }
    >
      <main className="mx-auto grid max-w-[1700px] gap-5 p-4 md:p-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="glass rounded-2xl p-4">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> {el ? "Νέο Universe" : "New Universe"}
          </button>
          <div className="mt-4 space-y-2">
            {(list.data?.universes ?? []).map((universe: SongUniverseRecord) => (
              <button
                key={universe.id}
                type="button"
                onClick={() => setSelectedId(universe.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${selectedId === universe.id ? "border-primary/50 bg-primary/10" : "border-white/10 bg-black/20"}`}
              >
                <div className="truncate text-sm font-medium">{universe.title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {universe.universeType.replaceAll("_", " ")} · {universe.status}
                </div>
              </button>
            ))}
            {!list.isLoading && (list.data?.universes ?? []).length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                {el
                  ? "Δεν έχεις δημιουργήσει Song Universe ακόμη."
                  : "You have not created a Song Universe yet."}
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          {!selectedId ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              {el
                ? "Επίλεξε ένα Universe ή δημιούργησε καινούργιο."
                : "Select a Universe or create a new one."}
            </div>
          ) : selected.isLoading || !selected.data ? (
            <div className="glass rounded-2xl p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <UniverseEditor
              universe={selected.data.universe}
              projects={selected.data.projects}
              onDeleted={() => {
                setSelectedId(null);
                void qc.invalidateQueries({ queryKey: ["song-universes"] });
              }}
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}

function UniverseEditor({
  universe,
  projects,
  onDeleted,
}: {
  universe: SongUniverseRecord;
  projects: Awaited<ReturnType<typeof getSongUniverse>>["projects"];
  onDeleted: () => void;
}) {
  const { language } = useI18n();
  const el = language === "el";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState(universe.title);
  const [description, setDescription] = useState(universe.description ?? "");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState("");

  const options = useQuery({
    queryKey: ["song-universe-project-options"],
    queryFn: () => listSongUniverseProjectOptions(),
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["song-universe", universe.id] }),
      qc.invalidateQueries({ queryKey: ["song-universes"] }),
      qc.invalidateQueries({ queryKey: ["song-universe-project-options"] }),
    ]);
  };

  const saveMeta = useMutation({
    mutationFn: () =>
      updateSongUniverse({
        data: { universeId: universe.id, title, description: description || null },
      }),
    onSuccess: refresh,
  });
  const saveBible = useMutation({
    mutationFn: (items: SongUniverseBibleItem[]) =>
      updateSongUniverse({ data: { universeId: universe.id, creativeBible: { items } } }),
    onSuccess: refresh,
  });

  const addBibleItem = (section: (typeof SONG_UNIVERSE_BIBLE_SECTIONS)[number]) => {
    const content = (newItem[section] ?? "").trim();
    if (!content) return;
    const items = [
      ...universe.creativeBible.items,
      {
        id: crypto.randomUUID(),
        section,
        content,
        strength: "flexible" as SongUniverseStrength,
        enabled: true,
        sortOrder: universe.creativeBible.items.filter((item) => item.section === section).length,
      },
    ];
    saveBible.mutate(items);
    setNewItem((current) => ({ ...current, [section]: "" }));
  };

  const useInSongSetup = () => {
    const selectedItems = universe.creativeBible.items.filter((item) => item.enabled);
    if (!selectedItems.length) return;
    const capturedAt = new Date().toISOString();
    const handoff = {
      version: 1 as const,
      universeId: universe.id,
      universeTitle: universe.title,
      projectId: null,
      selectedItems,
      contextSnapshot: {
        universeId: universe.id,
        universeTitle: universe.title,
        capturedAt,
        selectedItemIds: selectedItems.map((item) => item.id),
        inheritedItems: selectedItems,
      },
    };
    window.sessionStorage.setItem(SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY, JSON.stringify(handoff));
    void navigate({ to: "/generate" });
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    const ids = projects.map((project) => project.id);
    const current = ids[index];
    const swap = ids[target];
    if (!current || !swap) return;
    ids[index] = swap;
    ids[target] = current;
    void reorderSongUniverseProjects({
      data: { universeId: universe.id, membershipIds: ids },
    }).then(refresh);
  };

  const availableProjects = useMemo(
    () => (options.data?.projects ?? []).filter((project) => !project.linked),
    [options.data?.projects],
  );

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full bg-transparent font-display text-2xl font-bold outline-none"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={el ? "Περιγραφή…" : "Description…"}
              className="mt-3 min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
            />
          </div>
          <button
            onClick={() => saveMeta.mutate()}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm"
          >
            {el ? "Αποθήκευση" : "Save"}
          </button>
          <button
            onClick={() =>
              updateSongUniverse({ data: { universeId: universe.id, status: "archived" } }).then(
                refresh,
              )
            }
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-muted-foreground"
            title={el ? "Αρχειοθέτηση" : "Archive"}
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (
                !window.confirm(
                  el
                    ? "Να διαγραφεί το Universe; Τα Projects, Versions, στίχοι και audio δεν θα διαγραφούν."
                    : "Delete this Universe? Projects, Versions, lyrics and audio will remain untouched.",
                )
              )
                return;
              void deleteSongUniverse({ data: { universeId: universe.id } }).then(onDeleted);
            }}
            className="grid h-10 w-10 place-items-center rounded-xl border border-red-400/20 text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={universe.universeType}
            onChange={(event) =>
              void updateSongUniverse({
                data: {
                  universeId: universe.id,
                  universeType: event.target.value as SongUniverseRecord["universeType"],
                },
              }).then(refresh)
            }
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="album">Album</option>
            <option value="ep">EP</option>
            <option value="song_series">Song Series</option>
            <option value="creative_era">Creative Era</option>
            <option value="other">Other</option>
          </select>
          <select
            value={universe.status}
            onChange={(event) =>
              void updateSongUniverse({
                data: {
                  universeId: universe.id,
                  status: event.target.value as SongUniverseRecord["status"],
                },
              }).then(refresh)
            }
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="planning">Planning</option>
            <option value="writing">Writing</option>
            <option value="production">Production</option>
            <option value="review">Review</option>
            <option value="complete">Complete</option>
            <option value="archived">Archived</option>
          </select>
          <button
            onClick={useInSongSetup}
            disabled={!universe.creativeBible.items.some((item) => item.enabled)}
            className="rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {el ? "Χρήση στο Song Setup" : "Use in Song Setup"}
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-lg font-bold">Creative Bible</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {el ? "Κοινή ταυτότητα, όχι ίδια τραγούδια." : "Shared identity, not identical songs."}
        </p>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {SONG_UNIVERSE_BIBLE_SECTIONS.map((section) => {
            const items = universe.creativeBible.items
              .filter((item) => item.section === section)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={section} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-semibold">
                  {sectionLabels[section][el ? "el" : "en"]}
                </h3>
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 p-3">
                      <textarea
                        value={item.content}
                        onChange={(event) => {
                          const next = universe.creativeBible.items.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, content: event.target.value }
                              : candidate,
                          );
                          saveBible.mutate(next);
                        }}
                        className="min-h-16 w-full bg-transparent text-sm outline-none"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={item.strength}
                          onChange={(event) => {
                            const next = universe.creativeBible.items.map((candidate) =>
                              candidate.id === item.id
                                ? {
                                    ...candidate,
                                    strength: event.target.value as SongUniverseStrength,
                                  }
                                : candidate,
                            );
                            saveBible.mutate(next);
                          }}
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs"
                        >
                          <option value="core">Core</option>
                          <option value="flexible">Flexible</option>
                          <option value="experimental">Experimental</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={(event) => {
                              const next = universe.creativeBible.items.map((candidate) =>
                                candidate.id === item.id
                                  ? { ...candidate, enabled: event.target.checked }
                                  : candidate,
                              );
                              saveBible.mutate(next);
                            }}
                          />{" "}
                          {el ? "Ενεργό" : "Enabled"}
                        </label>
                        <button
                          onClick={() =>
                            saveBible.mutate(
                              universe.creativeBible.items.filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            )
                          }
                          className="ml-auto text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newItem[section] ?? ""}
                    onChange={(event) =>
                      setNewItem((current) => ({ ...current, [section]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addBibleItem(section);
                    }}
                    placeholder={el ? "Προσθήκη στοιχείου…" : "Add item…"}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => addBibleItem(section)}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-lg font-bold">
          {el ? "Τραγούδια / Projects" : "Songs / Projects"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {el
            ? "Ένα Project μπορεί να ανήκει σε ένα primary Universe."
            : "A Project can belong to one primary Universe."}
        </p>
        <div className="mt-4 flex gap-2">
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="">{el ? "Επίλεξε Project…" : "Select Project…"}</option>
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            disabled={!projectId}
            onClick={() =>
              void addProjectToSongUniverse({ data: { universeId: universe.id, projectId } }).then(
                () => {
                  setProjectId("");
                  void refresh();
                },
              )
            }
            className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
          >
            {el ? "Προσθήκη" : "Add"}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {projects.map((project, index) => (
            <div key={project.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <div className="w-8 text-center text-xs text-muted-foreground">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{project.projectName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {project.universeRole || (el ? "Χωρίς ρόλο" : "No role")}
                  </div>
                </div>
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === projects.length - 1}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    void removeProjectFromSongUniverse({
                      data: { universeId: universe.id, membershipId: project.id },
                    }).then(refresh)
                  }
                  className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/20 text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input
                  value={project.universeRole ?? ""}
                  onChange={(event) =>
                    void updateSongUniverseProject({
                      data: {
                        universeId: universe.id,
                        membershipId: project.id,
                        universeRole: event.target.value || null,
                      },
                    }).then(refresh)
                  }
                  placeholder={el ? "Ρόλος στο Universe" : "Universe role"}
                  className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
                />
                <select
                  value={project.projectStatus}
                  onChange={(event) =>
                    void updateSongUniverseProject({
                      data: {
                        universeId: universe.id,
                        membershipId: project.id,
                        projectStatus: event.target.value as typeof project.projectStatus,
                      },
                    }).then(refresh)
                  }
                  className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
                >
                  <option value="idea">Idea</option>
                  <option value="draft">Draft</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="final">Final</option>
                </select>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={project.intentionalOutlier}
                    onChange={(event) =>
                      void updateSongUniverseProject({
                        data: {
                          universeId: universe.id,
                          membershipId: project.id,
                          intentionalOutlier: event.target.checked,
                        },
                      }).then(refresh)
                    }
                  />{" "}
                  {el ? "Σκόπιμη απόκλιση" : "Intentional outlier"}
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
