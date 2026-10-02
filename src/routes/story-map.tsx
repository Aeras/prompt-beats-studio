import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  KeyRound,
  Loader2,
  Map as MapIcon,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import {
  parseExplicitObjectSelection,
  preserveExplicitObjectSearch,
} from "@/lib/pb007-followup-deep-link";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAiModelSelection } from "@/hooks/useAiModelSelection";
import { useI18n } from "@/i18n";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";
import { buildStoryMapWithAi } from "@/lib/story-map-ai.functions";
import { completeAuxiliaryRequest, getAuxiliaryRequestKey } from "@/lib/auxiliary-request-key";
import {
  createStoryBeat,
  createStoryMap,
  deleteStoryBeat,
  deleteStoryMap,
  getStoryMap,
  listStoryMaps,
  updateStoryBeat,
  updateStoryMap,
} from "@/lib/story-map.functions";
import {
  STORY_MAP_SONG_SETUP_HANDOFF_KEY,
  type StoryMapBeat,
  type StoryMapRecord,
  storyMapSongSetupHandoffSchema,
  type StoryMapSongSetupHandoff,
} from "@/lib/story-map.shared";
import {
  listStoryMapProjectOptions,
  reorderStoryMapBeatsAtomic,
  replaceStoryMapDraft,
} from "@/lib/story-map-workspace.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/story-map")({
  validateSearch: (search: Record<string, unknown>): { map?: string } => {
    const map = preserveExplicitObjectSearch(search["map"]);
    return map !== undefined ? { map } : {};
  },
  head: () => ({
    meta: [
      { title: "Story Map — PromptBeats" },
      {
        name: "description",
        content: "Plan how a song changes narratively or emotionally from beginning to end.",
      },
    ],
  }),
  component: StoryMapPage,
});

function StoryMapPage() {
  const { language } = useI18n();
  const el = language === "el";
  const { user, loading } = useAuth();
  const { preferences } = useAccountPreferences();
  const access = useFeatureAccess("story_map");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { map } = Route.useSearch();
  const selection = parseExplicitObjectSelection(map);
  const selectedId = selection.mode === "valid" ? selection.id : null;
  const suppressGenericSelection = useRef(false);
  const selectMap = (id: string) => navigate({ to: "/story-map", search: { map: id } });
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearNewStoryMapDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "story-map:new",
    enabled: newOpen && preferences.autoSaveDrafts,
    value: { title, concept },
    onRestore: (draft) => {
      setTitle(draft.title);
      setConcept(draft.concept);
    },
    isEmpty: (draft) => !draft.title.trim() && !draft.concept.trim(),
  });

  const mapsQuery = useQuery({
    queryKey: ["story-maps", user?.id],
    queryFn: () => listStoryMaps(),
    enabled: Boolean(user && access.allowed),
  });
  const mapQuery = useQuery({
    queryKey: ["story-map", selectedId],
    queryFn: () => getStoryMap({ data: { storyMapId: selectedId! } }),
    enabled: Boolean(user && access.allowed && selectedId),
  });

  useEffect(() => {
    if (selection.mode !== "absent") {
      suppressGenericSelection.current = false;
      return;
    }
    const firstMap = mapsQuery.data?.storyMaps?.[0];
    if (user && access.allowed && !suppressGenericSelection.current && firstMap) {
      void navigate({ to: "/story-map", search: { map: firstMap.id }, replace: true });
    }
  }, [access.allowed, map, mapsQuery.data?.storyMaps, navigate, selection.mode, user]);

  const refresh = async (id = selectedId) => {
    await queryClient.invalidateQueries({ queryKey: ["story-maps", user?.id] });
    if (id) await queryClient.invalidateQueries({ queryKey: ["story-map", id] });
  };

  const createMap = async () => {
    if (!concept.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createStoryMap({
        data: {
          title: title.trim() || (el ? "Νέο Story Map" : "New Story Map"),
          concept: concept.trim(),
        },
      });
      await selectMap(result.storyMap.id);
      clearNewStoryMapDraft();
      setTitle("");
      setConcept("");
      setNewOpen(false);
      await refresh(result.storyMap.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Αποτυχία δημιουργίας."
            : "Could not create Story Map.",
      );
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <MapIcon className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">Story Map</span>
    </div>
  );

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="glass rounded-3xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {el ? "Συνδέσου για να χρησιμοποιήσεις το Story Map." : "Sign in to use Story Map."}
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {el ? "Σύνδεση" : "Sign in"}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!access.isLoading && !access.allowed) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            {el
              ? "Το Story Map δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
              : "Story Map is not available for this account."}
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1700px] px-3 pb-20 pt-4 sm:px-4 md:px-8">
        {error && (
          <div className="mb-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="glass rounded-3xl p-3 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="font-display text-lg font-bold">Story Map Library</h1>
                <p className="text-[11px] text-muted-foreground">
                  {el ? "Ιδιωτικός αφηγηματικός χώρος" : "Private narrative workspace"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-neon text-primary-foreground"
                aria-label={el ? "Νέο Story Map" : "New Story Map"}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
              {(mapsQuery.data?.storyMaps ?? []).map((item: StoryMapRecord) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void selectMap(item.id)}
                  className={cn(
                    "min-w-[190px] rounded-2xl border px-3 py-3 text-left xl:min-w-0",
                    selectedId === item.id
                      ? "border-accent/50 bg-accent/10"
                      : "border-white/10 bg-black/10 hover:bg-white/5",
                  )}
                >
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                    {item.concept}
                  </div>
                </button>
              ))}
            </div>
            {!mapsQuery.isLoading && !(mapsQuery.data?.storyMaps ?? []).length && (
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="mt-5 w-full rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground hover:border-accent/50 hover:text-accent"
              >
                <Plus className="mx-auto mb-2 h-5 w-5" />
                {el ? "Δημιούργησε το πρώτο Story Map" : "Create your first Story Map"}
              </button>
            )}
          </aside>

          <section className="min-w-0">
            {selectedId && mapQuery.data?.storyMap.id === selectedId && !mapQuery.isError ? (
              <StoryMapWorkspace
                key={selectedId}
                storyMap={mapQuery.data.storyMap}
                language={el ? "el" : "en"}
                onRefresh={() => refresh(selectedId)}
                onError={setError}
                onDeleted={async () => {
                  suppressGenericSelection.current = true;
                  await navigate({ to: "/story-map", search: {} });
                  await refresh(null);
                }}
                onUseInSongSetup={(handoff) => {
                  const parsed = storyMapSongSetupHandoffSchema.parse(handoff);
                  window.sessionStorage.setItem(
                    STORY_MAP_SONG_SETUP_HANDOFF_KEY,
                    JSON.stringify(parsed),
                  );
                  navigate({ to: "/generate" });
                }}
              />
            ) : (
              <div className="glass flex min-h-[60vh] items-center justify-center rounded-3xl text-sm text-muted-foreground">
                {selection.mode === "invalid" ? (
                  el ? (
                    "Αυτό το Story Map δεν είναι διαθέσιμο."
                  ) : (
                    "This Story Map is unavailable."
                  )
                ) : mapQuery.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : selection.mode === "valid" ? (
                  el ? (
                    "Αυτό το Story Map δεν είναι διαθέσιμο."
                  ) : (
                    "This Story Map is unavailable."
                  )
                ) : el ? (
                  "Επίλεξε ή δημιούργησε Story Map."
                ) : (
                  "Select or create a Story Map."
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {newOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setNewOpen(false);
          }}
        >
          <div className="glass-strong w-full max-w-xl rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">
              {el ? "Νέο Story Map" : "New Story Map"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {el
                ? "Χρειάζεται μόνο η βασική ιδέα. Όλα τα άλλα μπορούν να εξελιχθούν μετά."
                : "Only the core idea is required. Everything else can evolve later."}
            </p>
            <label className="mt-5 block text-xs font-semibold">
              {el ? "Τίτλος (προαιρετικό)" : "Title (optional)"}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent/60"
            />
            <label className="mt-4 block text-xs font-semibold">
              {el ? "Βασική ιδέα / concept" : "Core idea / concept"} *
            </label>
            <textarea
              autoFocus
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              maxLength={3000}
              rows={6}
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent/60"
              placeholder={
                el
                  ? "π.χ. Ένας άνθρωπος επιστρέφει μετά από χρόνια στην πόλη όπου γνώρισε τον πρώτο του έρωτα."
                  : "e.g. A man returns after years to the city where he met his first love."
              }
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                disabled={busy}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground"
              >
                {el ? "Ακύρωση" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void createMap()}
                disabled={busy || concept.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {el ? "Δημιουργία" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StoryMapWorkspace({
  storyMap,
  language,
  onRefresh,
  onError,
  onDeleted,
  onUseInSongSetup,
}: {
  storyMap: StoryMapRecord;
  language: "en" | "el";
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  onDeleted: () => Promise<void>;
  onUseInSongSetup: (handoff: StoryMapSongSetupHandoff) => void;
}) {
  const el = language === "el";
  const aiModel = useAiModelSelection("aiTools");
  const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState({
    title: storyMap.title,
    concept: storyMap.concept,
    theme: storyMap.theme ?? "",
    emotionalDirection: storyMap.emotionalDirection ?? "",
    narrator: storyMap.narrator ?? "",
    pointOfView: storyMap.pointOfView ?? "",
    desiredEnding: storyMap.desiredEnding ?? "",
    projectId: storyMap.projectId ?? "",
  });
  const lastSaved = useRef(JSON.stringify(metadata));

  useEffect(() => {
    const next = {
      title: storyMap.title,
      concept: storyMap.concept,
      theme: storyMap.theme ?? "",
      emotionalDirection: storyMap.emotionalDirection ?? "",
      narrator: storyMap.narrator ?? "",
      pointOfView: storyMap.pointOfView ?? "",
      desiredEnding: storyMap.desiredEnding ?? "",
      projectId: storyMap.projectId ?? "",
    };
    setMetadata(next);
    lastSaved.current = JSON.stringify(next);
  }, [storyMap.id]);

  const projects = useQuery({
    queryKey: ["story-map-project-options"],
    queryFn: () => listStoryMapProjectOptions(),
  });

  useEffect(() => {
    const serialized = JSON.stringify(metadata);
    if (
      serialized === lastSaved.current ||
      metadata.title.trim().length === 0 ||
      metadata.concept.trim().length < 3
    )
      return;
    const timer = window.setTimeout(() => {
      void updateStoryMap({
        data: {
          storyMapId: storyMap.id,
          title: metadata.title.trim(),
          concept: metadata.concept.trim(),
          theme: metadata.theme.trim() || null,
          emotionalDirection: metadata.emotionalDirection.trim() || null,
          narrator: metadata.narrator.trim() || null,
          pointOfView: metadata.pointOfView.trim() || null,
          desiredEnding: metadata.desiredEnding.trim() || null,
          projectId: metadata.projectId || null,
        },
      })
        .then(() => {
          lastSaved.current = serialized;
          void onRefresh();
        })
        .catch((cause) => onError(cause instanceof Error ? cause.message : "Autosave failed."));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [metadata, storyMap.id, onRefresh, onError]);

  const build = async () => {
    setBusy(true);
    onError(null);
    try {
      const result = await buildStoryMapWithAi({
        data: {
          requestKey: getAuxiliaryRequestKey(`story_map:${storyMap.id}:build`),
          storyMapId: storyMap.id,
          ...(aiModel.selectedModel ? { model: aiModel.selectedModel } : {}),
        },
      });
      await replaceStoryMapDraft({ data: { storyMapId: storyMap.id, draft: result.draft } });
      await onRefresh();
      completeAuxiliaryRequest(`story_map:${storyMap.id}:build`);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Αποτυχία Story Map AI."
            : "Story Map AI failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addBeat = async () => {
    if (storyMap.beats.length >= 10) return;
    setBusy(true);
    try {
      await createStoryBeat({
        data: {
          storyMapId: storyMap.id,
          position: storyMap.beats.length,
          title: el ? "Νέο Beat" : "New Beat",
          whatHappens: "",
          emotion: "",
          purpose: "",
          narratorState: "",
          keyImage: "",
          reveal: "",
          changeAfterBeat: "",
          lyricAnchor: "",
          suggestedSections: [],
          isKeyBeat: false,
        },
      });
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not add beat.");
    } finally {
      setBusy(false);
    }
  };

  const moveBeat = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= storyMap.beats.length) return;
    const ids = storyMap.beats.map((beat) => beat.id!).filter(Boolean);
    const currentId = ids[index];
    const targetId = ids[target];
    if (!currentId || !targetId) return;
    ids[index] = targetId;
    ids[target] = currentId;
    setBusy(true);
    try {
      await reorderStoryMapBeatsAtomic({ data: { storyMapId: storyMap.id, beatIds: ids } });
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not reorder beats.");
    } finally {
      setBusy(false);
    }
  };

  const useSongSetup = () => {
    if (storyMap.beats.length === 0) {
      onError(el ? "Δημιούργησε πρώτα Story Beats." : "Create Story Beats first.");
      return;
    }
    const handoff: StoryMapSongSetupHandoff = {
      version: 1,
      storyMapId: storyMap.id,
      storyMapTitle: storyMap.title,
      projectId: storyMap.projectId,
      concept: storyMap.concept,
      progressionType: storyMap.progressionType,
      summary: storyMap.summary,
      narrator: storyMap.narrator,
      pointOfView: storyMap.pointOfView,
      startingState: storyMap.startingState,
      centralChange: storyMap.centralChange,
      turningPoint: storyMap.turningPoint,
      resolution: storyMap.resolution,
      beats: storyMap.beats,
    };
    onUseInSongSetup(handoff);
  };

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              <h2 className="font-display text-xl font-bold">{storyMap.title}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {el
                ? "Τι αλλάζει από την αρχή του τραγουδιού μέχρι το τέλος;"
                : "What changes from the beginning of the song to the end?"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {aiModel.showSelector && (
              <select
                aria-label={el ? "Μοντέλο AI" : "AI model"}
                value={aiModel.selectedModel}
                onChange={(event) => aiModel.setSelectedModel(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
              >
                {aiModel.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void build()}
              disabled={busy || aiModel.unavailable}
              className="inline-flex items-center gap-2 rounded-xl border border-accent/50 px-3 py-2 text-sm text-accent disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {el ? "Χτίσιμο Story Map" : "Build Story Map"}
            </button>
            <button
              type="button"
              onClick={useSongSetup}
              disabled={busy || storyMap.beats.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {el ? "Χρήση στο Song Setup" : "Use in Song Setup"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Field
            label={el ? "Τίτλος" : "Title"}
            value={metadata.title}
            onChange={(value) => setMetadata((m) => ({ ...m, title: value }))}
          />
          <label className="block">
            <span className="text-xs font-semibold">
              Project ({el ? "προαιρετικό" : "optional"})
            </span>
            <select
              value={metadata.projectId}
              onChange={(e) => setMetadata((m) => ({ ...m, projectId: e.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm"
            >
              <option value="">{el ? "Χωρίς Project" : "No Project"}</option>
              {(projects.data?.projects ?? []).map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold">
              {el ? "Βασική ιδέα / concept" : "Core idea / concept"}
            </span>
            <textarea
              value={metadata.concept}
              onChange={(e) => setMetadata((m) => ({ ...m, concept: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
            />
          </label>
          <Field
            label={el ? "Θέμα" : "Theme"}
            value={metadata.theme}
            onChange={(value) => setMetadata((m) => ({ ...m, theme: value }))}
          />
          <Field
            label={el ? "Συναισθηματική κατεύθυνση" : "Emotional direction"}
            value={metadata.emotionalDirection}
            onChange={(value) => setMetadata((m) => ({ ...m, emotionalDirection: value }))}
          />
          <Field
            label={el ? "Αφηγητής" : "Narrator"}
            value={metadata.narrator}
            onChange={(value) => setMetadata((m) => ({ ...m, narrator: value }))}
          />
          <Field
            label={el ? "Οπτική γωνία / POV" : "Point of view / POV"}
            value={metadata.pointOfView}
            onChange={(value) => setMetadata((m) => ({ ...m, pointOfView: value }))}
          />
          <Field
            label={el ? "Επιθυμητό τέλος" : "Desired ending"}
            value={metadata.desiredEnding}
            onChange={(value) => setMetadata((m) => ({ ...m, desiredEnding: value }))}
          />
        </div>
        {storyMap.summary && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {storyMap.progressionType}
            </div>
            <p className="mt-1 text-sm">{storyMap.summary}</p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {storyMap.beats.map((beat, index) => (
          <BeatCard
            key={beat.id ?? index}
            beat={beat}
            index={index}
            count={storyMap.beats.length}
            language={language}
            busy={busy}
            onMove={(delta) => void moveBeat(index, delta)}
            onSave={async (changes) => {
              if (!beat.id) return;
              await updateStoryBeat({ data: { beatId: beat.id, ...changes } });
              await onRefresh();
            }}
            onDelete={async () => {
              if (!beat.id || storyMap.beats.length <= 1) return;
              await deleteStoryBeat({ data: { beatId: beat.id } });
              await onRefresh();
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => void addBeat()}
          disabled={busy || storyMap.beats.length >= 10}
          className="w-full rounded-2xl border border-dashed border-white/15 px-4 py-4 text-sm text-muted-foreground hover:border-accent/50 hover:text-accent disabled:opacity-40"
        >
          <Plus className="mr-2 inline h-4 w-4" />
          {el ? "Προσθήκη Story Beat" : "Add Story Beat"}
        </button>
      </section>

      <section className="flex justify-end">
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(el ? "Διαγραφή Story Map;" : "Delete Story Map?")) return;
            setBusy(true);
            try {
              await deleteStoryMap({ data: { storyMapId: storyMap.id } });
              await onDeleted();
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-red-400/25 px-3 py-2 text-xs text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {el ? "Διαγραφή Story Map" : "Delete Story Map"}
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm"
      />
    </label>
  );
}

function BeatCard({
  beat,
  index,
  count,
  language,
  busy,
  onMove,
  onSave,
  onDelete,
}: {
  beat: StoryMapBeat;
  index: number;
  count: number;
  language: "en" | "el";
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onSave: (changes: Partial<StoryMapBeat>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const el = language === "el";
  const [draft, setDraft] = useState(beat);
  const last = useRef(JSON.stringify(beat));
  useEffect(() => {
    setDraft(beat);
    last.current = JSON.stringify(beat);
  }, [beat]);
  useEffect(() => {
    const serialized = JSON.stringify(draft);
    if (serialized === last.current) return;
    const timer = window.setTimeout(() => {
      const { id: _id, ...changes } = draft;
      void onSave(changes).then(() => {
        last.current = serialized;
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, onSave]);
  return (
    <article
      className={cn("glass rounded-3xl p-4 sm:p-5", draft.isKeyBeat && "border border-accent/35")}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-xs font-bold">
          {index + 1}
        </span>
        <input
          value={draft.title}
          onChange={(e) => setDraft((b) => ({ ...b, title: e.target.value }))}
          className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold outline-none"
        />
        <button
          type="button"
          aria-label={el ? "Κύριο beat" : "Key beat"}
          title={el ? "Κύριο beat" : "Key beat"}
          onClick={() => setDraft((b) => ({ ...b, isKeyBeat: !b.isKeyBeat }))}
          className={cn(
            "rounded-lg p-2",
            draft.isKeyBeat ? "text-accent" : "text-muted-foreground",
          )}
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
          aria-label={el ? "Μετακίνηση πάνω" : "Move up"}
          className="rounded-lg p-2 text-muted-foreground disabled:opacity-25"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={busy || index === count - 1}
          onClick={() => onMove(1)}
          aria-label={el ? "Μετακίνηση κάτω" : "Move down"}
          className="rounded-lg p-2 text-muted-foreground disabled:opacity-25"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          aria-label={el ? "Διαγραφή beat" : "Delete beat"}
          className="rounded-lg p-2 text-red-300/70"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <BeatField
          label={el ? "Τι συμβαίνει" : "What happens"}
          value={draft.whatHappens}
          onChange={(value) => setDraft((b) => ({ ...b, whatHappens: value }))}
          wide
        />
        <BeatField
          label={el ? "Συναισθηματική κατάσταση" : "Emotional state"}
          value={draft.emotion}
          onChange={(value) => setDraft((b) => ({ ...b, emotion: value }))}
        />
        <BeatField
          label={el ? "Αφηγηματικός σκοπός" : "Narrative purpose"}
          value={draft.purpose}
          onChange={(value) => setDraft((b) => ({ ...b, purpose: value }))}
        />
        <BeatField
          label={el ? "Κατάσταση αφηγητή" : "Narrator state"}
          value={draft.narratorState}
          onChange={(value) => setDraft((b) => ({ ...b, narratorState: value }))}
        />
        <BeatField
          label={el ? "Εικόνα / μοτίβο" : "Key image / motif"}
          value={draft.keyImage}
          onChange={(value) => setDraft((b) => ({ ...b, keyImage: value }))}
        />
        <BeatField
          label={el ? "Τι αποκαλύπτεται" : "What is revealed"}
          value={draft.reveal}
          onChange={(value) => setDraft((b) => ({ ...b, reveal: value }))}
        />
        <BeatField
          label={el ? "Τι αλλάζει μετά" : "What changes after"}
          value={draft.changeAfterBeat}
          onChange={(value) => setDraft((b) => ({ ...b, changeAfterBeat: value }))}
        />
        <BeatField
          label={el ? "Lyric anchor (προαιρετικό)" : "Lyric anchor (optional)"}
          value={draft.lyricAnchor}
          onChange={(value) => setDraft((b) => ({ ...b, lyricAnchor: value }))}
        />
        <BeatField
          label={el ? "Προτεινόμενες ενότητες" : "Suggested sections"}
          value={draft.suggestedSections.join(", ")}
          onChange={(value) =>
            setDraft((b) => ({
              ...b,
              suggestedSections: value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 12),
            }))
          }
        />
      </div>
    </article>
  );
}

function BeatField({
  label,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={cn("block", wide && "md:col-span-2")}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
      />
    </label>
  );
}
