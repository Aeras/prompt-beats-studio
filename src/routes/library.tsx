import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Library as LibraryIcon,
  Copy,
  Check,
  Trash2,
  Loader2,
  Search,
  FolderPlus,
  Folder,
  Pencil,
  FolderX,
  ChevronDown,
  ChevronRight,
  Home,
  Wand2,
  FilePenLine,
  FolderInput,
  MoreHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { PlaylistLibraryPanel } from "@/components/promptbeats/PlaylistLibraryPanel";
import { SharedLinksPanel } from "@/components/promptbeats/SharedLinksPanel";
import { ExportControl } from "@/components/promptbeats/ExportControl";
import {
  TrackGridModeToggle,
  trackGridClassName,
  useTrackGridMode,
  type TrackGridMode,
} from "@/components/promptbeats/TrackGridView";
import type { Track } from "@/lib/tracks";
import type { CreatedWith } from "@/lib/created-with";
import { usePlayer } from "@/lib/player";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { listMyTracks, listLikedTracks } from "@/lib/tracks.functions";
import {
  listSavedPrompts,
  deleteSavedPrompt,
  listPromptProjects,
  createPromptProject,
  renamePromptProject,
  deletePromptProject,
  updatePromptProjectCreationNotes,
  updateSavedPromptOrganization,
  detachSavedPromptFromProject,
  copySavedPromptToProject,
  moveSavedPromptToProject,
} from "@/lib/ai.functions";
import { listFavoriteTracks } from "@/lib/playlists.functions";
import {
  deleteSongAnalysis,
  listSongAnalyses,
  updateSongAnalysisOrganization,
} from "@/lib/song-analyzer.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAccountPreferences } from "@/lib/account-preferences";
import { usePb012LastWork } from "@/lib/pb012-last-work";
import { useDraftAutosave } from "@/lib/draft-autosave";
import { LIBRARY_TAB_IDS, isLibraryTab, type LibraryTab } from "@/lib/library-tabs";
import {
  TrackSourceFilter,
  filterByTrackSource,
  useTrackSourcePreference,
  type TrackSourcePreference,
} from "@/components/promptbeats/TrackSourceFilter";
import { ProjectVersionHistory } from "@/components/promptbeats/ProjectVersionHistory";
import { SongUniverseProjectBadge } from "@/components/promptbeats/SongUniverseProjectBadge";
import { LibraryFolderPicker } from "@/components/promptbeats/LibraryFolderPicker";
import {
  LibraryItemActionSheet,
  LibraryLongPressButton,
  useLibraryLongPress,
  type LibraryActionMenuAnchor,
} from "@/components/promptbeats/LibraryItemActionSheet";
import { PromptBeatsFolderIcon } from "@/components/promptbeats/PromptBeatsFolderIcon";
import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";
import { ProjectPromptActionMenu } from "@/components/promptbeats/ProjectPromptActionMenu";
import {
  EditStandalonePromptDialog,
  StandalonePromptRevisionDialog,
  type StandalonePromptEditValues,
} from "@/components/promptbeats/PromptStandaloneDialogs";
import { LibraryTracksEmptyState } from "@/components/promptbeats/LibraryTracksEmptyState";
import { PersonalLibrarySearch } from "@/components/promptbeats/PersonalLibrarySearch";
import {
  parseExplicitObjectSelection,
  preserveExplicitObjectSearch,
  type ExplicitObjectSelection,
} from "@/lib/pb007-followup-deep-link";
import {
  createLibraryFolder,
  deleteLibraryFolder,
  duplicatePromptProjectToFolder,
  duplicateStandalonePromptToFolder,
  getLibraryFolderBreadcrumbs,
  listLibraryFolderContents,
  moveLibraryFolder,
  movePromptProjectToFolder,
  moveStandalonePromptToFolder,
  renameLibraryFolder,
  searchLibraryScope,
} from "@/lib/library-folders.functions";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Row = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  audio_url: string;
  audio_type: string;
  source_type: "upload" | "suno" | "udio" | "legacy_link";
  source_id: string | null;
  created_with: CreatedWith | null;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  prompt_is_public: boolean;
  lyrics_is_public: boolean;
  allow_download: boolean;
  contains_explicit_lyrics: boolean;
  handle?: string;
};

function toTrack(track: Row, handle: string): Track {
  return {
    id: track.id,
    userId: track.user_id,
    title: track.title,
    handle: track.handle ?? handle,
    genre: track.genre,
    art: track.cover_url ?? track.art_url ?? artFallback,
    duration: formatDuration(track.duration_seconds),
    plays: String(track.plays),
    prompt: track.prompt,
    lyrics: track.lyrics,
    audioUrl: track.audio_url,
    audioType: (track.audio_type === "link" ? "link" : "upload") as "link" | "upload",
    isPublished: track.is_published,
    promptIsPublic: track.prompt_is_public,
    lyricsIsPublic: track.lyrics_is_public,
    sourceType: track.source_type,
    sourceId: track.source_id,
    createdWith: track.created_with,
    allowDownload: track.allow_download === true,
    durationSeconds: track.duration_seconds,
    containsExplicitLyrics: track.contains_explicit_lyrics === true,
  };
}

const TABS = LIBRARY_TAB_IDS;
type LibraryView = "all" | "projects" | "analyses";
type LibrarySearch = { tab?: LibraryTab; project?: string; view?: LibraryView };

function parseLibraryTab(value: unknown): LibraryTab | undefined {
  return isLibraryTab(value) ? value : undefined;
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const tab = parseLibraryTab(search["tab"]);
    const project = preserveExplicitObjectSearch(search["project"]);
    const view = ["all", "projects", "analyses"].includes(String(search["view"]))
      ? (search["view"] as LibraryView)
      : undefined;
    return {
      ...(tab ? { tab } : {}),
      ...(project !== undefined ? { project } : {}),
      ...(view ? { view } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "My Library — PromptBeats" },
      {
        name: "description",
        content: "Your uploaded tracks, saved AI prompts and liked songs, all in one place.",
      },
      { property: "og:title", content: "My Library — PromptBeats" },
      {
        property: "og:description",
        content: "Manage your AI music uploads, saved prompts and liked tracks on PromptBeats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { tab: requestedTab, project: projectSearch, view: requestedView } = Route.useSearch();
  const projectSelection = parseExplicitObjectSelection(projectSearch);
  const { user, profile, loading } = useAuth();
  const { preferences: accountPreferences } = useAccountPreferences();
  const playlistsAccess = useFeatureAccess("playlists");
  const favoritesAccess = useFeatureAccess("favorites");
  const likesAccess = useFeatureAccess("likes");
  const analyzerAccess = useFeatureAccess("song_analyzer");
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const { preference: defaultTrackSource, setPreference: persistTrackSource } =
    useTrackSourcePreference("library");
  const [trackSource, setTrackSource] = useState<TrackSourcePreference>(defaultTrackSource);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [showTabFade, setShowTabFade] = useState(false);
  const [promptView, setPromptView] = useState<LibraryView>(requestedView ?? "all");
  const [promptSearch, setPromptSearch] = useState("");

  useEffect(() => {
    setPromptView(requestedView ?? "all");
  }, [requestedView]);

  const availableTabs = TABS.filter((item) => {
    if (item === "playlists") return playlistsAccess.allowed;
    if (item === "shared") return true;
    if (item === "favorites") return favoritesAccess.allowed;
    if (item === "likes") return likesAccess.allowed;
    return true;
  });

  const preferredTab = availableTabs.includes(accountPreferences.libraryTab)
    ? accountPreferences.libraryTab
    : "tracks";
  const tab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : preferredTab;

  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, tab]);

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      void navigate({ to: "/library", search: {}, replace: true });
    }
  }, [navigate, requestedTab, tab]);

  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip) return;
    const activeTab = strip.querySelector<HTMLElement>(`[data-library-tab="${tab}"]`);
    activeTab?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab, availableTabs.length]);

  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip) return;

    const updateFade = () => {
      setShowTabFade(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2);
    };

    updateFade();
    strip.addEventListener("scroll", updateFade, { passive: true });
    window.addEventListener("resize", updateFade);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateFade);
    resizeObserver?.observe(strip);

    return () => {
      strip.removeEventListener("scroll", updateFade);
      window.removeEventListener("resize", updateFade);
      resizeObserver?.disconnect();
    };
  }, [availableTabs.length]);

  useEffect(() => {
    if (promptView === "analyses" && !analyzerAccess.allowed) {
      setPromptView("all");
    }
  }, [analyzerAccess.allowed, promptView]);

  const handle = profile?.handle ? `@${profile.handle}` : t("nav.you");

  const mine = useQuery({
    queryKey: ["library", "mine", user?.id],
    queryFn: () => listMyTracks(),
    enabled: Boolean(user),
  });
  const prompts = useQuery({
    queryKey: ["library", "prompts", user?.id],
    queryFn: () => listSavedPrompts(),
    enabled: Boolean(user),
  });
  const projects = useQuery({
    queryKey: ["library", "prompt-projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user),
  });
  const analyses = useQuery({
    queryKey: ["library", "song-analyses", user?.id],
    queryFn: () => listSongAnalyses(),
    enabled: Boolean(user && analyzerAccess.allowed),
  });
  const liked = useQuery({
    queryKey: ["library", "liked", user?.id],
    queryFn: () => listLikedTracks(),
    enabled: Boolean(user && likesAccess.allowed),
  });
  const favorites = useQuery({
    queryKey: ["library", "favorites", user?.id],
    queryFn: () => listFavoriteTracks(),
    enabled: Boolean(user && favoritesAccess.allowed),
  });

  const settledProject =
    projectSelection.mode === "valid" && projects.isSuccess && !projects.isFetching
      ? projects.data?.projects.find((project) => project.id === projectSelection.id)
      : null;
  usePb012LastWork(
    user?.id ?? null,
    loading
      ? null
      : tab === "prompts" && settledProject
        ? { type: "project", id: settledProject.id }
        : projectSelection.mode !== "absent"
          ? null
          : tab === "tracks" && mine.isSuccess && !mine.isFetching
            ? { type: "my_songs" }
            : tab === "prompts" &&
                promptView === "projects" &&
                projects.isSuccess &&
                !projects.isFetching
              ? { type: "projects" }
              : null,
  );

  const myTracks = (mine.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const likedTracks = (liked.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const favoriteTracks = (favorites.data?.tracks ?? []).map((track: any) =>
    toTrack(track as Row, handle),
  );
  const sourceFilteredMyTracks = filterByTrackSource(myTracks, trackSource);
  const filteredMyTracks = sourceFilteredMyTracks;
  const filteredLikedTracks = filterByTrackSource(likedTracks, trackSource);
  const filteredFavoriteTracks = filterByTrackSource(favoriteTracks, trackSource);
  const uploadTrackCount = filterByTrackSource(myTracks, "uploads").length;
  const externalTrackCount = filterByTrackSource(myTracks, "external").length;

  const tabLabel = (value: (typeof TABS)[number]) => {
    if (value === "tracks") return t("library.myTracks");
    if (value === "playlists") return language === "el" ? "Λίστες αναπαραγωγής" : "Playlists";
    if (value === "shared") return "Shared Links";
    if (value === "prompts") return t("library.savedPrompts");
    if (value === "favorites") return language === "el" ? "Τα Αγαπημένα μου" : "My Favorites";
    return t("library.likedTracks");
  };

  const header = (
    <div className="flex items-center gap-2">
      <LibraryIcon className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">{t("library.title")}</span>
    </div>
  );

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-10 md:px-8 md:pb-[150px]">
          <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
            <h1 className="font-display text-xl font-bold">{t("library.guestTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("library.guestBody")}</p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              {t("nav.signIn")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const emptyMyTracks = t("library.noTracks");

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <PersonalLibrarySearch className="mt-4" />
        <div className="relative mt-1 md:mt-4">
          <div
            ref={tabStripRef}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pr-0"
          >
            {availableTabs.map((item) => (
              <button
                key={item}
                type="button"
                data-library-tab={item}
                aria-pressed={tab === item}
                onClick={() => void navigate({ to: "/library", search: { tab: item } })}
                className={cn(
                  "shrink-0 snap-center rounded-full border px-4 py-1.5 text-xs transition-all",
                  tab === item
                    ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                    : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
                )}
              >
                {tabLabel(item)}
              </button>
            ))}
          </div>
          {showTabFade && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background via-background/85 to-transparent md:hidden"
            />
          )}
        </div>

        {tab === "tracks" && (
          <>
            <div className="mt-3 flex w-full items-center justify-between gap-3">
              <div
                className="inline-flex rounded-full border border-white/10 bg-black/20 p-1"
                role="group"
                aria-label={language === "el" ? "Πηγή τραγουδιών" : "Track source"}
              >
                {(
                  [
                    [
                      "all",
                      language === "el" ? `Όλα (${myTracks.length})` : `All (${myTracks.length})`,
                    ],
                    ["uploads", `Uploads (${uploadTrackCount})`],
                    ["external", `External (${externalTrackCount})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={trackSource === value}
                    onClick={() => {
                      setTrackSource(value);
                      void persistTrackSource(value).catch(() => undefined);
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                      trackSource === value
                        ? "bg-accent/20 text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} className="shrink-0" />
            </div>
            {myTracks.length === 0 ? (
              <LibraryTracksEmptyState language={language} />
            ) : (
              <Section
                empty={emptyMyTracks}
                tracks={filteredMyTracks}
                playing={playing}
                currentId={current?.id}
                onPlay={(track) => play(track, myTracks)}
                gridMode={gridMode}
              />
            )}
          </>
        )}

        {tab === "playlists" && user && playlistsAccess.allowed && (
          <PlaylistLibraryPanel userId={user.id} />
        )}

        {tab === "shared" && user && <SharedLinksPanel />}

        {tab === "favorites" && favoritesAccess.allowed && (
          <>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <TrackSourceFilter
                value={trackSource}
                onChange={setTrackSource}
                language={language}
              />
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />
            </div>
            <Section
              empty={
                language === "el"
                  ? "Δεν έχεις ακόμη αποθηκεύσει τραγούδια στα Αγαπημένα σου."
                  : "You have not saved any favorite tracks yet."
              }
              tracks={filteredFavoriteTracks}
              playing={playing}
              currentId={current?.id}
              onPlay={(track) => play(track, filteredFavoriteTracks)}
              gridMode={gridMode}
            />
          </>
        )}

        {tab === "likes" && likesAccess.allowed && (
          <>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <TrackSourceFilter
                value={trackSource}
                onChange={setTrackSource}
                language={language}
              />
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />
            </div>
            <Section
              empty={t("library.noLikes")}
              tracks={filteredLikedTracks}
              playing={playing}
              currentId={current?.id}
              onPlay={(track) => play(track, filteredLikedTracks)}
              gridMode={gridMode}
            />
          </>
        )}

        {tab === "prompts" && (
          <PromptProjectLibrary
            prompts={prompts.data?.prompts ?? []}
            projects={projects.data?.projects ?? []}
            analyses={analyses.data?.analyses ?? []}
            loading={
              prompts.isLoading ||
              projects.isLoading ||
              (analyzerAccess.allowed && analyses.isLoading)
            }
            showAnalyses={analyzerAccess.allowed}
            view={promptView}
            onViewChange={setPromptView}
            search={promptSearch}
            onSearchChange={setPromptSearch}
            projectSelection={projectSelection}
          />
        )}
      </main>
    </AppShell>
  );
}

function Section({
  tracks,
  empty,
  playing,
  currentId,
  onPlay,
  gridMode,
}: {
  tracks: Track[];
  empty: string;
  playing: boolean;
  currentId?: string | undefined;
  onPlay: (track: Track) => void;
  gridMode: TrackGridMode;
}) {
  return (
    <>
      <div className={`mt-6 ${trackGridClassName(gridMode)}`}>
        {tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            isPlaying={playing && currentId === track.id}
            onPlay={onPlay}
            viewMode={gridMode}
          />
        ))}
      </div>
      {tracks.length === 0 && (
        <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </>
  );
}

type SavedPrompt = {
  id: string;
  title: string | null;
  custom_name: string | null;
  project_id: string | null;
  folder_id: string | null;
  duplicated_from_prompt_id: string | null;
  version_number: number | null;
  version_label: string | null;
  generator_input_snapshot: unknown | null;
  parent_prompt_id: string | null;
  revision_request: string | null;
  source_generation_job_id: string | null;
  version_change_metadata: unknown | null;
  version_user_note: string | null;
  theme: string | null;
  genre: string | null;
  mood: string | null;
  language: string | null;
  tags: string | null;
  lyrics: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};
type PromptProject = {
  id: string;
  name: string;
  creation_notes: string;
  preferred_prompt_id: string | null;
  folder_id: string | null;
  duplicated_from_project_id: string | null;
  created_at: string;
  updated_at: string;
};
type SongAnalysisItem = {
  id: string;
  name: string;
  project_id: string | null;
  model: string;
  created_at: string;
  generator_ready: {
    musicStyle: string;
    mood: string;
    instruments: string[];
    bpm: {
      approximate: number | null;
      rangeMin: number | null;
      rangeMax: number | null;
      confidence: string;
      notes: string;
    };
    songStructure: string[];
    productionStyle: string;
    additionalInstructions: string;
  };
  detailed_analysis: {
    genreAndStyle: string;
    moodAndEmotionalArc: string;
    tempoAndGroove: string;
    instrumentation: Array<{ observation: string; confidence: string }>;
    arrangement: string;
    songStructure: string;
    vocals: string;
    productionAndMix: Array<{ observation: string; confidence: string }>;
    dynamicsAndEnergy: string;
    notableCharacteristics: string[];
    confidenceAndUncertaintyNotes: string[];
  };
};

function PromptProjectLibrary({
  prompts,
  projects,
  analyses,
  loading,
  showAnalyses,
  view,
  onViewChange,
  search,
  onSearchChange,
  projectSelection,
}: {
  prompts: SavedPrompt[];
  projects: PromptProject[];
  analyses: SongAnalysisItem[];
  loading: boolean;
  showAnalyses: boolean;
  view: "all" | "projects" | "analyses";
  onViewChange: (view: "all" | "projects" | "analyses") => void;
  search: string;
  onSearchChange: (value: string) => void;
  projectSelection: ExplicitObjectSelection;
}) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [deleteProjectDialog, setDeleteProjectDialog] = useState<PromptProject | null>(null);
  const [promptDisplayMode, setPromptDisplayMode] = useState<"expanded" | "list">("list");
  const navigate = useNavigate();
  const openProjectId = projectSelection.mode === "valid" ? projectSelection.id : null;
  const setOpenProjectId = (id: string | null) =>
    navigate({
      to: "/library",
      search: id === null ? { tab: "prompts" } : { tab: "prompts", project: id },
    });
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("promptbeats:library-current-folder") || null;
  });
  const [folderMessage, setFolderMessage] = useState("");
  const [undoMove, setUndoMove] = useState<null | {
    kind: "folder" | "project" | "prompt";
    id: string;
    previousFolderId: string | null;
  }>(null);
  const [desktopDnD, setDesktopDnD] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | "root">(null);
  const touchDragRef = useRef<null | {
    item: { kind: "folder" | "project" | "prompt"; id: string; currentFolderId: string | null };
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    targetFolderId: string | null;
    targetPath: string;
  }>(null);
  const suppressTouchClickRef = useRef(false);
  const [touchDraggingKey, setTouchDraggingKey] = useState<string | null>(null);
  const [actionSheetItem, setActionSheetItem] = useState<null | {
    kind: "folder" | "project" | "prompt";
    id: string;
    name: string;
    currentFolderId: string | null;
    anchor: LibraryActionMenuAnchor;
  }>(null);
  const [folderPicker, setFolderPicker] = useState<null | {
    operation: "move" | "duplicate";
    kind: "folder" | "project" | "prompt";
    id: string;
    name: string;
    newName?: string;
    currentFolderId: string | null;
  }>(null);
  const q = search.trim().toLowerCase();
  const openProject = projects.find((project) => project.id === openProjectId) ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "promptbeats:library-current-folder";
    if (currentFolderId) window.sessionStorage.setItem(key, currentFolderId);
    else window.sessionStorage.removeItem(key);
  }, [currentFolderId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktopDnD(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const folderContents = useQuery({
    queryKey: ["library", "folder-contents", currentFolderId],
    queryFn: () => listLibraryFolderContents({ data: { folderId: currentFolderId } }),
    enabled: (view === "all" || (view === "projects" && !openProject)) && !q,
  });

  const folderBreadcrumbs = useQuery({
    queryKey: ["library", "folder-breadcrumbs", currentFolderId],
    queryFn: () => getLibraryFolderBreadcrumbs({ data: { folderId: currentFolderId! } }),
    enabled: (view === "all" || (view === "projects" && !openProject)) && Boolean(currentFolderId),
  });

  const folderSearch = useQuery({
    queryKey: ["library", "folder-scope-search", currentFolderId, q],
    queryFn: () => searchLibraryScope({ data: { folderId: currentFolderId, query: q } }),
    enabled: (view === "all" || (view === "projects" && !openProject)) && q.length > 0,
  });
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "";
  const matches = (p: SavedPrompt) =>
    !q ||
    [
      p.custom_name,
      p.title,
      projectName(p.project_id),
      p.theme,
      p.genre,
      p.mood,
      p.tags,
      p.lyrics,
      p.note,
    ].some((v) => v?.toLowerCase().includes(q));
  const matchesAnalysis = (a: SongAnalysisItem) =>
    !q ||
    [
      a.name,
      projectName(a.project_id),
      a.model,
      a.generator_ready.musicStyle,
      a.generator_ready.mood,
      a.generator_ready.productionStyle,
      ...a.generator_ready.instruments,
    ].some((v) => v?.toLowerCase().includes(q));
  const visibleAnalyses = showAnalyses ? analyses : [];
  const filteredAnalyses = visibleAnalyses.filter(matchesAnalysis);
  const folderSearchResults = (folderSearch.data?.results ?? []).filter(
    (result) => view === "all" || result.item_type !== "prompt",
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-picker"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-breadcrumbs"], exact: false }),
      ...(showAnalyses
        ? [queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false })]
        : []),
    ]);
  };

  const flashFolderMessage = (message: string, keepForUndo = false) => {
    setFolderMessage(message);
    if (!keepForUndo) window.setTimeout(() => setFolderMessage(""), 2600);
  };

  const createFolder = async () => {
    const name = window.prompt(language === "el" ? "Όνομα φακέλου" : "Folder name")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createLibraryFolder({ data: { name, parentFolderId: currentFolderId } });
      await refresh();
      flashFolderMessage(language === "el" ? "Ο φάκελος δημιουργήθηκε." : "Folder created.");
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async (folder: { id: string; name: string }) => {
    const name = window
      .prompt(language === "el" ? "Νέο όνομα φακέλου" : "New folder name", folder.name)
      ?.trim();
    if (!name || name === folder.name) return;
    setBusy(true);
    try {
      await renameLibraryFolder({ data: { folderId: folder.id, name } });
      await refresh();
      flashFolderMessage(language === "el" ? "Ο φάκελος μετονομάστηκε." : "Folder renamed.");
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (folder: { id: string; name: string }) => {
    if (
      !window.confirm(
        language === "el"
          ? `Να διαγραφεί ο κενός φάκελος «${folder.name}»;`
          : `Delete the empty folder “${folder.name}”?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteLibraryFolder({ data: { folderId: folder.id } });
      await refresh();
      flashFolderMessage(language === "el" ? "Ο φάκελος διαγράφηκε." : "Folder deleted.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Ο φάκελος δεν μπορεί να διαγραφεί."
            : "Folder could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    const name = window.prompt(language === "el" ? "Όνομα project" : "Project name")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createPromptProject({
        data: { name, folderId: view === "analyses" ? null : currentFolderId },
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const performMove = async (
    kind: "folder" | "project" | "prompt",
    id: string,
    previousFolderId: string | null,
    destinationFolderId: string | null,
    path: string,
  ) => {
    if (kind === "folder") {
      await moveLibraryFolder({ data: { folderId: id, destinationFolderId } });
    } else if (kind === "project") {
      await movePromptProjectToFolder({ data: { projectId: id, destinationFolderId } });
    } else {
      await moveStandalonePromptToFolder({ data: { promptId: id, destinationFolderId } });
    }
    await refresh();
    setUndoMove({ kind, id, previousFolderId });
    flashFolderMessage(language === "el" ? `Μετακινήθηκε σε ${path}.` : `Moved to ${path}.`, true);
  };

  const touchDragHandlers = (item: {
    kind: "folder" | "project" | "prompt";
    id: string;
    currentFolderId: string | null;
  }) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" || busy) return;
      touchDragRef.current = {
        item,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        targetFolderId: item.currentFolderId,
        targetPath: "",
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const state = touchDragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (
        !state.dragging &&
        Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 12
      ) {
        state.dragging = true;
        suppressTouchClickRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setTouchDraggingKey(`${item.kind}:${item.id}`);
      }
      if (!state.dragging) return;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-library-folder-drop-id]");
      if (!target) {
        state.targetFolderId = item.currentFolderId;
        state.targetPath = "";
        setDragOverFolderId(null);
        return;
      }
      const rawId = target.dataset.libraryFolderDropId ?? "";
      const targetFolderId = rawId === "root" ? null : rawId || item.currentFolderId;
      state.targetFolderId = targetFolderId;
      state.targetPath =
        target.dataset.libraryFolderDropPath ||
        (rawId === "root" ? (language === "el" ? "Αρχική" : "Root") : "");
      setDragOverFolderId(rawId === "root" ? "root" : targetFolderId);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const state = touchDragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      touchDragRef.current = null;
      setTouchDraggingKey(null);
      setDragOverFolderId(null);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!state.dragging) return;
      const destinationChanged = state.targetFolderId !== state.item.currentFolderId;
      const invalidSelfTarget =
        state.item.kind === "folder" && state.targetFolderId === state.item.id;
      if (destinationChanged && !invalidSelfTarget && state.targetPath) {
        setBusy(true);
        void performMove(
          state.item.kind,
          state.item.id,
          state.item.currentFolderId,
          state.targetFolderId,
          state.targetPath,
        )
          .catch((error) =>
            window.alert(
              error instanceof Error
                ? error.message
                : language === "el"
                  ? "Η μετακίνηση απέτυχε."
                  : "Move failed.",
            ),
          )
          .finally(() => setBusy(false));
      }
      window.setTimeout(() => {
        suppressTouchClickRef.current = false;
      }, 0);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      const state = touchDragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      touchDragRef.current = null;
      setTouchDraggingKey(null);
      setDragOverFolderId(null);
      suppressTouchClickRef.current = false;
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (!suppressTouchClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressTouchClickRef.current = false;
    },
  });

  const moveFolderItem = async (destinationFolderId: string | null, path: string) => {
    if (!folderPicker) return;
    setBusy(true);
    try {
      if (folderPicker.operation === "duplicate") {
        if (folderPicker.kind === "project") {
          await duplicatePromptProjectToFolder({
            data: {
              projectId: folderPicker.id,
              destinationFolderId,
              newName: folderPicker.newName || `${folderPicker.name} Copy`,
            },
          });
        } else if (folderPicker.kind === "prompt") {
          await duplicateStandalonePromptToFolder({
            data: {
              promptId: folderPicker.id,
              destinationFolderId,
              newName: folderPicker.newName || `${folderPicker.name} Copy`,
            },
          });
        } else {
          throw new Error("Folder duplication is not available.");
        }
        await refresh();
        setUndoMove(null);
        flashFolderMessage(
          language === "el" ? `Δημιουργήθηκε αντίγραφο στο ${path}.` : `Copy created in ${path}.`,
        );
        setFolderPicker(null);
        return;
      }

      await performMove(
        folderPicker.kind,
        folderPicker.id,
        folderPicker.currentFolderId,
        destinationFolderId,
        path,
      );
      setFolderPicker(null);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η ενέργεια απέτυχε."
            : "Action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startDrag = (
    event: DragEvent,
    item: { kind: "folder" | "project" | "prompt"; id: string; currentFolderId: string | null },
  ) => {
    if (!desktopDnD) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-promptbeats-library-item", JSON.stringify(item));
    setTouchDraggingKey(`${item.kind}:${item.id}`);
  };

  const dropIntoFolder = async (
    event: DragEvent,
    destinationFolderId: string | null,
    path: string,
  ) => {
    if (!desktopDnD || busy) return;
    event.preventDefault();
    setDragOverFolderId(null);
    const raw = event.dataTransfer.getData("application/x-promptbeats-library-item");
    if (!raw) return;
    try {
      const item = JSON.parse(raw) as {
        kind: "folder" | "project" | "prompt";
        id: string;
        currentFolderId: string | null;
      };
      if (item.currentFolderId === destinationFolderId) return;
      setBusy(true);
      await performMove(item.kind, item.id, item.currentFolderId, destinationFolderId, path);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η μετακίνηση απέτυχε."
            : "Move failed.",
      );
    } finally {
      setBusy(false);
      setTouchDraggingKey(null);
    }
  };

  const undoLastMove = async () => {
    if (!undoMove || busy) return;
    setBusy(true);
    try {
      if (undoMove.kind === "folder") {
        await moveLibraryFolder({
          data: { folderId: undoMove.id, destinationFolderId: undoMove.previousFolderId },
        });
      } else if (undoMove.kind === "project") {
        await movePromptProjectToFolder({
          data: { projectId: undoMove.id, destinationFolderId: undoMove.previousFolderId },
        });
      } else {
        await moveStandalonePromptToFolder({
          data: { promptId: undoMove.id, destinationFolderId: undoMove.previousFolderId },
        });
      }
      await refresh();
      setUndoMove(null);
      flashFolderMessage(language === "el" ? "Η μετακίνηση αναιρέθηκε." : "Move undone.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η αναίρεση απέτυχε."
            : "Undo failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startDuplicateProject = (project: PromptProject) => {
    const newName = window
      .prompt(
        language === "el" ? "Όνομα αντιγράφου Project" : "Duplicate Project name",
        language === "el" ? `${project.name} — Αντίγραφο` : `${project.name} — Copy`,
      )
      ?.trim();
    if (!newName) return;
    setFolderPicker({
      operation: "duplicate",
      kind: "project",
      id: project.id,
      name: project.name,
      newName,
      currentFolderId: project.folder_id ?? currentFolderId,
    });
  };

  const startDuplicatePrompt = (prompt: SavedPrompt) => {
    const sourceName =
      prompt.custom_name ||
      prompt.title ||
      prompt.theme ||
      (language === "el" ? "Prompt" : "Prompt");
    const newName = window
      .prompt(
        language === "el" ? "Όνομα αντιγράφου Prompt" : "Duplicate Prompt name",
        language === "el" ? `${sourceName} — Αντίγραφο` : `${sourceName} — Copy`,
      )
      ?.trim();
    if (!newName) return;
    setFolderPicker({
      operation: "duplicate",
      kind: "prompt",
      id: prompt.id,
      name: sourceName,
      newName,
      currentFolderId: prompt.folder_id ?? currentFolderId,
    });
  };
  const renameProject = async (project: PromptProject) => {
    const name = window
      .prompt(language === "el" ? "Νέο όνομα project" : "New project name", project.name)
      ?.trim();
    if (!name || name === project.name) return;
    setBusy(true);
    try {
      await renamePromptProject({ data: { id: project.id, name } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const removeProject = (project: PromptProject) => {
    setDeleteProjectDialog(project);
  };
  const confirmRemoveProject = async (deletePromptIds: string[]) => {
    if (!deleteProjectDialog) return;
    setBusy(true);
    try {
      await deletePromptProject({ data: { id: deleteProjectDialog.id, deletePromptIds } });
      if (deleteProjectDialog.id === openProjectId) await setOpenProjectId(null);
      setDeleteProjectDialog(null);
      await refresh();
    } catch (error) {
      await refresh();
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η διαγραφή του project απέτυχε."
            : "Project deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renameStandalonePrompt = async (prompt: SavedPrompt) => {
    const currentName = prompt.custom_name || prompt.title || prompt.theme || "";
    const name = window
      .prompt(language === "el" ? "Όνομα prompt" : "Prompt name", currentName)
      ?.trim();
    if (name == null || name === currentName) return;
    setBusy(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, custom_name: name || null } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeStandalonePrompt = async (prompt: SavedPrompt) => {
    if (!window.confirm(language === "el" ? "Να διαγραφεί αυτό το prompt;" : "Delete this prompt?"))
      return;
    setBusy(true);
    try {
      await deleteSavedPrompt({ data: { id: prompt.id } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openActionMenu = (
    item: {
      kind: "folder" | "project" | "prompt";
      id: string;
      name: string;
      currentFolderId: string | null;
    },
    anchor: LibraryActionMenuAnchor,
  ) => {
    touchDragRef.current = null;
    setTouchDraggingKey(null);
    setDragOverFolderId(null);
    setActionSheetItem({ ...item, anchor });
  };

  const actionFolder =
    actionSheetItem?.kind === "folder"
      ? ((folderContents.data?.folders ?? []).find((item) => item.id === actionSheetItem.id) ??
        null)
      : null;
  const actionProject =
    actionSheetItem?.kind === "project"
      ? (projects.find((item) => item.id === actionSheetItem.id) ?? null)
      : null;
  const actionPrompt =
    actionSheetItem?.kind === "prompt"
      ? (prompts.find((item) => item.id === actionSheetItem.id) ?? null)
      : null;

  const deleteDialogPrompts = deleteProjectDialog
    ? prompts.filter((prompt) => prompt.project_id === deleteProjectDialog.id)
    : [];

  if (projectSelection.mode !== "absent" && !openProject) {
    return (
      <div className="glass mt-6 space-y-3 rounded-2xl p-8 text-center text-sm text-muted-foreground">
        <p>
          {projectSelection.mode === "valid" && loading
            ? language === "el"
              ? "Φόρτωση..."
              : "Loading..."
            : language === "el"
              ? "Αυτό το Project δεν είναι διαθέσιμο."
              : "This Project is unavailable."}
        </p>
        <button type="button" onClick={() => void setOpenProjectId(null)} className="text-accent">
          ← Projects
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <DeletePromptProjectDialog
        open={Boolean(deleteProjectDialog)}
        language={language}
        projectName={deleteProjectDialog?.name ?? ""}
        prompts={deleteDialogPrompts}
        busy={busy}
        onClose={() => setDeleteProjectDialog(null)}
        onConfirm={confirmRemoveProject}
      />
      <div className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
          {(["all", "projects", ...(showAnalyses ? (["analyses"] as const) : [])] as const).map(
            (item) => (
              <button
                key={item}
                onClick={() => {
                  setOpenProjectId(null);
                  onViewChange(item);
                }}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
                  view === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item === "all"
                  ? t("library.promptViewAll")
                  : item === "projects"
                    ? t("library.promptViewProjects")
                    : t("library.promptViewAnalyses")}
              </button>
            ),
          )}
        </div>
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              language === "el"
                ? "Αναζήτηση prompts, projects, style, mood, στίχων…"
                : "Search prompts, projects, style, mood, lyrics…"
            }
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        {view !== "analyses" && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-pressed={promptDisplayMode === "expanded"}
              onClick={() => setPromptDisplayMode("expanded")}
              className={cn(
                "rounded-lg border p-2 text-xs",
                promptDisplayMode === "expanded"
                  ? "border-accent/50 text-accent"
                  : "border-white/10 text-muted-foreground",
              )}
            >
              {language === "el" ? "Κάρτες" : "Cards"}
            </button>
            <button
              type="button"
              aria-pressed={promptDisplayMode === "list"}
              onClick={() => setPromptDisplayMode("list")}
              className={cn(
                "rounded-lg border p-2 text-xs",
                promptDisplayMode === "list"
                  ? "border-accent/50 text-accent"
                  : "border-white/10 text-muted-foreground",
              )}
            >
              {language === "el" ? "Λίστα" : "List"}
            </button>
          </div>
        )}
        <div className="flex shrink-0 gap-2">
          {view !== "analyses" && (
            <button
              disabled={busy}
              onClick={createFolder}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" />
              {language === "el" ? "Νέος Φάκελος" : "New Folder"}
            </button>
          )}
          <button
            disabled={busy}
            onClick={createProject}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-accent hover:bg-primary/15 disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4" />
            {language === "el" ? "Νέο Project" : "New Project"}
          </button>
        </div>
      </div>

      {folderMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs font-medium text-accent">
          <span>{folderMessage}</span>
          {undoMove && (
            <button
              type="button"
              onClick={undoLastMove}
              disabled={busy}
              className="shrink-0 rounded-lg border border-accent/30 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-accent/10 disabled:opacity-50"
            >
              {language === "el" ? "Αναίρεση" : "Undo"}
            </button>
          )}
        </div>
      )}

      {projectSelection.mode === "absent" &&
      (view === "all" || (view === "projects" && !openProject)) ? (
        <div className="space-y-4">
          <div className="glass flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl px-3 py-2 text-xs [scrollbar-width:none]">
            <button
              type="button"
              data-library-folder-drop-id="root"
              data-library-folder-drop-path={language === "el" ? "Αρχική" : "Root"}
              onClick={() => {
                setCurrentFolderId(null);
                onSearchChange("");
              }}
              onDragOver={(event) => {
                if (!desktopDnD) return;
                event.preventDefault();
                setDragOverFolderId("root");
              }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(event) =>
                void dropIntoFolder(event, null, language === "el" ? "Αρχική" : "Root")
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground hover:bg-white/5 hover:text-accent",
                dragOverFolderId === "root" && "bg-accent/10 text-accent",
              )}
            >
              <Home className="h-3.5 w-3.5" />
              {language === "el" ? "Αρχική" : "Root"}
            </button>
            {(folderBreadcrumbs.data?.breadcrumbs ?? []).map((item) => (
              <span key={item.id} className="inline-flex shrink-0 items-center">
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                <button
                  type="button"
                  data-library-folder-drop-id={item.id}
                  data-library-folder-drop-path={(folderBreadcrumbs.data?.breadcrumbs ?? [])
                    .slice(
                      0,
                      (folderBreadcrumbs.data?.breadcrumbs ?? []).findIndex(
                        (crumb) => crumb.id === item.id,
                      ) + 1,
                    )
                    .map((crumb) => crumb.name)
                    .join(" / ")}
                  onClick={() => {
                    setCurrentFolderId(item.id);
                    onSearchChange("");
                  }}
                  onDragOver={(event) => {
                    if (!desktopDnD) return;
                    event.preventDefault();
                    setDragOverFolderId(item.id);
                  }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(event) =>
                    void dropIntoFolder(
                      event,
                      item.id,
                      (folderBreadcrumbs.data?.breadcrumbs ?? [])
                        .slice(
                          0,
                          (folderBreadcrumbs.data?.breadcrumbs ?? []).findIndex(
                            (crumb) => crumb.id === item.id,
                          ) + 1,
                        )
                        .map((crumb) => crumb.name)
                        .join(" / "),
                    )
                  }
                  className={cn(
                    "rounded-lg px-2 py-1 text-muted-foreground hover:bg-white/5 hover:text-accent",
                    dragOverFolderId === item.id && "bg-accent/10 text-accent",
                  )}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </div>

          {q ? (
            folderSearch.isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {language === "el" ? "Αναζήτηση..." : "Searching..."}
              </div>
            ) : folderSearchResults.length ? (
              <div className="space-y-2">
                {folderSearchResults.map((result) => (
                  <button
                    key={`${result.item_type}:${result.item_id}`}
                    type="button"
                    onClick={() => {
                      if (result.item_type === "folder") {
                        setCurrentFolderId(result.item_id);
                        onSearchChange("");
                        return;
                      }
                      if (result.item_type === "project") {
                        void setOpenProjectId(result.item_id);
                        onSearchChange("");
                        onViewChange("projects");
                        return;
                      }
                      setCurrentFolderId(result.folder_id ?? null);
                      onSearchChange("");
                    }}
                    className="glass flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-accent/40"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/[0.06]">
                      <Folder className="h-5 w-5 text-accent" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{result.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {result.path}
                      </span>
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {result.item_type}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                {language === "el"
                  ? "Δεν βρέθηκαν αποτελέσματα σε αυτό το scope."
                  : "No results found in this scope."}
              </p>
            )
          ) : folderContents.isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === "el" ? "Φόρτωση φακέλου..." : "Loading folder..."}
            </div>
          ) : (
            <>
              {(folderContents.data?.folders ?? []).length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,104px))] gap-x-3 gap-y-5">
                  {(folderContents.data?.folders ?? []).map((folder) => (
                    <article
                      key={folder.id}
                      data-library-folder-drop-id={folder.id}
                      data-library-folder-drop-path={[
                        ...(folderBreadcrumbs.data?.breadcrumbs ?? []).map((item) => item.name),
                        folder.name,
                      ].join(" / ")}
                      {...touchDragHandlers({ kind: "folder", id: folder.id, currentFolderId })}
                      draggable={desktopDnD}
                      onDragStart={(event) =>
                        startDrag(event, { kind: "folder", id: folder.id, currentFolderId })
                      }
                      onDragEnd={() => {
                        setDragOverFolderId(null);
                        setTouchDraggingKey(null);
                      }}
                      onDragOver={(event) => {
                        if (!desktopDnD) return;
                        event.preventDefault();
                        setDragOverFolderId(folder.id);
                      }}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={(event) =>
                        void dropIntoFolder(
                          event,
                          folder.id,
                          [
                            ...(folderBreadcrumbs.data?.breadcrumbs ?? []).map((item) => item.name),
                            folder.name,
                          ].join(" / "),
                        )
                      }
                      className={cn(
                        "group relative flex min-w-0 flex-col items-center rounded-2xl px-1.5 pb-2 pt-1 text-center transition-all touch-pan-y md:cursor-grab md:active:cursor-grabbing",
                        "hover:bg-white/[0.035] focus-within:bg-white/[0.035]",
                        touchDraggingKey &&
                          touchDraggingKey !== `folder:${folder.id}` &&
                          "bg-accent/[0.035] ring-1 ring-accent/15",
                        dragOverFolderId === folder.id &&
                          "scale-[1.03] bg-accent/[0.11] ring-2 ring-accent/60",
                        touchDraggingKey === `folder:${folder.id}` && "opacity-70",
                      )}
                    >
                      <LibraryLongPressButton
                        onClick={() => {
                          setCurrentFolderId(folder.id);
                          onSearchChange("");
                        }}
                        onLongPress={(point) =>
                          openActionMenu(
                            { kind: "folder", id: folder.id, name: folder.name, currentFolderId },
                            point,
                          )
                        }
                        className="flex w-full min-w-0 flex-col items-center text-center outline-none"
                      >
                        <span className="relative grid h-[66px] w-[78px] place-items-center rounded-2xl transition-transform duration-150 group-hover:-translate-y-0.5">
                          <span
                            className="absolute inset-x-2 bottom-1 h-9 rounded-2xl bg-accent/10 blur-xl"
                            aria-hidden="true"
                          />
                          <PromptBeatsFolderIcon className="relative h-[62px] w-[72px] drop-shadow-[0_0_14px_hsl(var(--accent)/0.22)]" />
                          {folder.has_subfolders && (
                            <span
                              className="absolute bottom-1.5 right-2.5 h-2 w-2 rounded-full border border-background bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.55)]"
                              aria-label={
                                language === "el" ? "Περιέχει υποφακέλους" : "Contains subfolders"
                              }
                            />
                          )}
                        </span>
                        <span
                          className="mt-1 line-clamp-2 min-h-8 w-full break-words px-0.5 font-display text-[12px] font-semibold leading-4 text-foreground"
                          title={folder.name}
                        >
                          {folder.name}
                        </span>
                      </LibraryLongPressButton>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          openActionMenu(
                            { kind: "folder", id: folder.id, name: folder.name, currentFolderId },
                            { x: rect.right - 8, y: rect.bottom + 6 },
                          );
                        }}
                        aria-label={
                          language === "el"
                            ? `Επιλογές φακέλου ${folder.name}`
                            : `Folder options for ${folder.name}`
                        }
                        title={language === "el" ? "Επιλογές φακέλου" : "Folder options"}
                        className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-black/35 text-muted-foreground opacity-100 backdrop-blur-sm transition-colors hover:border-accent/35 hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {(folderContents.data?.projects ?? []).length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(folderContents.data?.projects ?? []).map((project) => {
                    const promptCount = prompts.filter(
                      (prompt) => prompt.project_id === project.id,
                    ).length;
                    return (
                      <article
                        key={project.id}
                        {...touchDragHandlers({ kind: "project", id: project.id, currentFolderId })}
                        draggable={desktopDnD}
                        onDragStart={(event) =>
                          startDrag(event, { kind: "project", id: project.id, currentFolderId })
                        }
                        onDragEnd={() => {
                          setDragOverFolderId(null);
                          setTouchDraggingKey(null);
                        }}
                        className={cn(
                          "glass flex items-center gap-3 rounded-2xl p-4 touch-pan-y md:cursor-grab md:active:cursor-grabbing",
                          touchDraggingKey === `project:${project.id}` && "opacity-70",
                        )}
                      >
                        <LibraryLongPressButton
                          onClick={() => {
                            void setOpenProjectId(project.id);
                            onSearchChange("");
                            onViewChange("projects");
                          }}
                          onLongPress={(point) =>
                            openActionMenu(
                              {
                                kind: "project",
                                id: project.id,
                                name: project.name,
                                currentFolderId,
                              },
                              point,
                            )
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10">
                            <Folder className="h-5 w-5 text-accent" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-display font-bold">
                              {project.name}
                            </span>
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              {promptCount} {language === "el" ? "εκδόσεις" : "versions"}
                            </span>
                            {project.creation_notes.trim() && (
                              <span className="mt-1 block truncate text-[11px] text-accent/80">
                                {project.creation_notes}
                              </span>
                            )}
                          </span>
                        </LibraryLongPressButton>
                        <div className="flex shrink-0 gap-1">
                          <ExportControl kind="project" id={project.id} name={project.name} />
                          <button
                            type="button"
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              openActionMenu(
                                {
                                  kind: "project",
                                  id: project.id,
                                  name: project.name,
                                  currentFolderId,
                                },
                                { x: rect.right - 8, y: rect.bottom + 6 },
                              );
                            }}
                            aria-label={
                              language === "el"
                                ? `Επιλογές Project ${project.name}`
                                : `Project options for ${project.name}`
                            }
                            title={language === "el" ? "Επιλογές Project" : "Project options"}
                            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-accent/35 hover:text-accent"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {view === "all" && (folderContents.data?.prompts ?? []).length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {(folderContents.data?.prompts ?? []).map((prompt) => (
                    <div
                      key={prompt.id}
                      {...touchDragHandlers({ kind: "prompt", id: prompt.id, currentFolderId })}
                      draggable={desktopDnD}
                      onDragStart={(event) =>
                        startDrag(event, { kind: "prompt", id: prompt.id, currentFolderId })
                      }
                      onDragEnd={() => {
                        setDragOverFolderId(null);
                        setTouchDraggingKey(null);
                      }}
                    >
                      <SavedPromptCard
                        prompt={prompt as SavedPrompt}
                        projects={projects}
                        listMode={promptDisplayMode === "list"}
                        onMoveToFolder={() =>
                          setFolderPicker({
                            operation: "move",
                            kind: "prompt",
                            id: prompt.id,
                            name:
                              prompt.custom_name ||
                              prompt.title ||
                              prompt.theme ||
                              (language === "el" ? "Prompt" : "Prompt"),
                            currentFolderId,
                          })
                        }
                        onDuplicate={() => startDuplicatePrompt(prompt as SavedPrompt)}
                        onLongPress={(point) =>
                          openActionMenu(
                            {
                              kind: "prompt",
                              id: prompt.id,
                              name:
                                prompt.custom_name ||
                                prompt.title ||
                                prompt.theme ||
                                (language === "el" ? "Prompt" : "Prompt"),
                              currentFolderId,
                            },
                            point,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {(folderContents.data?.folders ?? []).length === 0 &&
                (folderContents.data?.projects ?? []).length === 0 &&
                (view === "projects" || (folderContents.data?.prompts ?? []).length === 0) && (
                  <div className="glass rounded-2xl p-8 text-center">
                    <Folder className="mx-auto h-8 w-8 text-accent/70" />
                    <p className="mt-3 text-sm font-semibold">
                      {language === "el" ? "Αυτός ο φάκελος είναι κενός." : "This folder is empty."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {language === "el"
                        ? "Δημιούργησε φάκελο ή Project, ή μετακίνησε εδώ υπάρχον περιεχόμενο."
                        : "Create a folder or Project, or move existing content here."}
                    </p>
                  </div>
                )}
            </>
          )}
        </div>
      ) : projectSelection.mode === "absent" && view === "analyses" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredAnalyses.map((analysis) => (
            <SongAnalysisCard key={analysis.id} analysis={analysis} projects={projects} />
          ))}
          {!loading && filteredAnalyses.length === 0 && (
            <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              {q ? t("library.analysisNoMatch") : t("library.analysisNone")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {openProject
            ? (() => {
                const items = prompts
                  .filter((p) => p.project_id === openProject.id && matches(p))
                  .sort(
                    (a, b) =>
                      (a.version_number ?? 999999) - (b.version_number ?? 999999) ||
                      a.created_at.localeCompare(b.created_at),
                  );
                const analysisItems = visibleAnalyses.filter(
                  (a) => a.project_id === openProject.id && matchesAnalysis(a),
                );
                return (
                  <section className="space-y-4">
                    <div className="glass rounded-2xl p-4">
                      <button
                        type="button"
                        onClick={() => {
                          void setOpenProjectId(null);
                          onSearchChange("");
                        }}
                        className="mb-3 text-xs font-semibold text-accent"
                      >
                        ← Projects
                      </button>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Folder className="h-5 w-5 text-accent" />
                            <h2 className="truncate font-display text-lg font-bold">
                              {openProject.name}
                            </h2>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {analysisItems.length} analyses ·{" "}
                            {prompts.filter((p) => p.project_id === openProject.id).length} prompts
                          </p>
                          <SongUniverseProjectBadge projectId={openProject.id} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <ExportControl
                            kind="project"
                            id={openProject.id}
                            name={openProject.name}
                          />
                          <button
                            type="button"
                            onClick={() => startDuplicateProject(openProject)}
                            aria-label={
                              language === "el"
                                ? "Δημιουργία αντιγράφου Project"
                                : "Duplicate Project"
                            }
                            title={
                              language === "el"
                                ? "Δημιουργία αντιγράφου Project"
                                : "Duplicate Project"
                            }
                            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFolderPicker({
                                operation: "move",
                                kind: "project",
                                id: openProject.id,
                                name: openProject.name,
                                currentFolderId: openProject.folder_id ?? null,
                              })
                            }
                            aria-label={
                              language === "el"
                                ? "Μετακίνηση Project σε φάκελο"
                                : "Move Project to folder"
                            }
                            title={
                              language === "el"
                                ? "Μετακίνηση Project σε φάκελο"
                                : "Move Project to folder"
                            }
                            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
                          >
                            <FolderInput className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => renameProject(openProject)}
                            aria-label={
                              language === "el" ? "Μετονομασία Project" : "Rename Project"
                            }
                            title={language === "el" ? "Μετονομασία Project" : "Rename Project"}
                            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeProject(openProject)}
                            aria-label={language === "el" ? "Διαγραφή Project" : "Delete Project"}
                            title={language === "el" ? "Διαγραφή Project" : "Delete Project"}
                            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <ProjectVersionHistory
                      projectId={openProject.id}
                      projectName={openProject.name}
                      language={language}
                    />

                    <ProjectCreationNotes project={openProject} />

                    <details className="glass rounded-2xl p-4" open>
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">
                        {language === "el"
                          ? `Project Versions / Prompts (${items.length})`
                          : `Project Versions / Prompts (${items.length})`}
                      </summary>
                      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {items.map((prompt) => (
                          <SavedPromptCard
                            key={prompt.id}
                            prompt={prompt}
                            projects={projects}
                            listMode={promptDisplayMode === "list"}
                          />
                        ))}
                        {items.length === 0 && (
                          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                            {language === "el"
                              ? "Δεν υπάρχουν αποθηκευμένες εκδόσεις σε αυτό το project."
                              : "No saved versions in this project."}
                          </p>
                        )}
                      </div>
                    </details>

                    {analysisItems.length > 0 && (
                      <details className="glass rounded-2xl p-4">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">
                          {language === "el"
                            ? `Αναλύσεις (${analysisItems.length})`
                            : `Analyses (${analysisItems.length})`}
                        </summary>
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {analysisItems.map((analysis) => (
                            <SongAnalysisCard
                              key={analysis.id}
                              analysis={analysis}
                              projects={projects}
                            />
                          ))}
                        </div>
                      </details>
                    )}

                    {items.length === 0 && analysisItems.length === 0 && (
                      <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        {language === "el"
                          ? "Δεν υπάρχουν items σε αυτό το project."
                          : "No items in this project."}
                      </p>
                    )}
                  </section>
                );
              })()
            : null}
        </div>
      )}

      <LibraryItemActionSheet
        open={Boolean(actionSheetItem)}
        language={language}
        title={actionSheetItem?.name ?? ""}
        anchor={actionSheetItem?.anchor ?? null}
        canDuplicate={actionSheetItem?.kind === "project" || actionSheetItem?.kind === "prompt"}
        onMove={() => {
          if (!actionSheetItem) return;
          setFolderPicker({
            operation: "move",
            kind: actionSheetItem.kind,
            id: actionSheetItem.id,
            name: actionSheetItem.name,
            currentFolderId: actionSheetItem.currentFolderId,
          });
        }}
        onDuplicate={
          actionSheetItem?.kind === "project" && actionProject
            ? () => startDuplicateProject(actionProject)
            : actionSheetItem?.kind === "prompt" && actionPrompt
              ? () => startDuplicatePrompt(actionPrompt)
              : undefined
        }
        onRename={
          actionSheetItem?.kind === "folder" && actionFolder
            ? () => renameFolder(actionFolder)
            : actionSheetItem?.kind === "project" && actionProject
              ? () => renameProject(actionProject)
              : actionSheetItem?.kind === "prompt" && actionPrompt
                ? () => renameStandalonePrompt(actionPrompt)
                : undefined
        }
        onDelete={
          actionSheetItem?.kind === "folder" && actionFolder
            ? () => removeFolder(actionFolder)
            : actionSheetItem?.kind === "project" && actionProject
              ? () => removeProject(actionProject)
              : actionSheetItem?.kind === "prompt" && actionPrompt
                ? () => removeStandalonePrompt(actionPrompt)
                : undefined
        }
        onClose={() => setActionSheetItem(null)}
      />

      <LibraryFolderPicker
        open={Boolean(folderPicker)}
        language={language}
        title={
          folderPicker?.operation === "duplicate"
            ? folderPicker.kind === "project"
              ? language === "el"
                ? "Αντιγραφή Project σε..."
                : "Duplicate Project to..."
              : language === "el"
                ? "Αντιγραφή Prompt σε..."
                : "Duplicate Prompt to..."
            : folderPicker?.kind === "folder"
              ? language === "el"
                ? "Μετακίνηση φακέλου"
                : "Move Folder"
              : folderPicker?.kind === "project"
                ? language === "el"
                  ? "Μετακίνηση Project"
                  : "Move Project"
                : language === "el"
                  ? "Μετακίνηση Prompt"
                  : "Move Prompt"
        }
        confirmLabel={
          folderPicker?.operation === "duplicate"
            ? language === "el"
              ? "Αντιγραφή εδώ"
              : "Duplicate here"
            : language === "el"
              ? "Μετακίνηση εδώ"
              : "Move here"
        }
        initialFolderId={folderPicker?.currentFolderId ?? currentFolderId}
        excludedFolderIds={
          folderPicker?.operation === "move" && folderPicker?.kind === "folder"
            ? [folderPicker.id]
            : []
        }
        disabledDestinationFolderId={
          folderPicker?.operation === "move" ? folderPicker.currentFolderId : undefined
        }
        onClose={() => setFolderPicker(null)}
        onSelect={moveFolderItem}
      />
    </div>
  );
}

function ProjectCreationNotes({ project }: { project: PromptProject }) {
  const { language } = useI18n();
  const { preferences, userId } = useAccountPreferences();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(project.creation_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = draft !== (project.creation_notes ?? "");

  useEffect(() => {
    setDraft(project.creation_notes ?? "");
    setSaved(false);
    setError("");
  }, [project.id, project.creation_notes]);

  const clearCreationNotesDraft = useDraftAutosave({
    ownerId: userId,
    scope: `project-creation-notes:${project.id}`,
    enabled: preferences.autoSaveDrafts,
    value: draft,
    onRestore: setDraft,
    isEmpty: (value) => value === (project.creation_notes ?? ""),
  });

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updatePromptProjectCreationNotes({
        data: { id: project.id, creationNotes: draft },
      });
      clearCreationNotesDraft();
      await queryClient.invalidateQueries({
        queryKey: ["library", "prompt-projects"],
        exact: false,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : language === "el"
            ? "Η αποθήκευση απέτυχε."
            : "Could not save notes.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
            {language === "el" ? "Creation Notes" : "Creation Notes"}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {language === "el"
              ? "Ιδέες, αναφορές, αποφάσεις παραγωγής και επόμενα βήματα για αυτό το project."
              : "Ideas, references, production decisions and next steps for this project."}
          </p>
        </div>
        {saved && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent">
            <Check className="h-3.5 w-3.5" />
            {language === "el" ? "Αποθηκεύτηκε" : "Saved"}
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value.slice(0, 6000));
          setSaved(false);
          setError("");
        }}
        rows={5}
        maxLength={6000}
        placeholder={
          language === "el"
            ? "π.χ. κρατάμε πιο σκοτεινό verse, δοκιμή δεύτερου chorus με κιθάρες, reference παραγωγής..."
            : "e.g. darker verse, try a guitar-led second chorus, production reference..."
        }
        className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-5 outline-none transition-shadow placeholder:text-muted-foreground focus:border-accent/50"
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">{draft.length}/6000</span>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition-all hover:bg-accent/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {saving
            ? language === "el"
              ? "Αποθήκευση..."
              : "Saving..."
            : language === "el"
              ? "Αποθήκευση σημειώσεων"
              : "Save notes"}
        </button>
      </div>
    </div>
  );
}

function SongAnalysisCard({
  analysis,
  projects,
}: {
  analysis: SongAnalysisItem;
  projects: PromptProject[];
}) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<"tags" | "lyrics" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const project = projects.find((item) => item.id === analysis.project_id) ?? null;
  const bpm = analysis.generator_ready.bpm;
  const bpmText =
    bpm.rangeMin != null && bpm.rangeMax != null
      ? `${bpm.rangeMin}–${bpm.rangeMax} BPM`
      : bpm.approximate != null
        ? `≈ ${bpm.approximate} BPM`
        : "BPM uncertain";
  const fullText = [
    `Music Style:\n${analysis.generator_ready.musicStyle}`,
    `Mood:\n${analysis.generator_ready.mood}`,
    `BPM:\n${bpmText} · confidence: ${bpm.confidence}\n${bpm.notes}`,
    `Song Structure:\n${analysis.generator_ready.songStructure.join(" → ")}`,
    `Instruments:\n${analysis.generator_ready.instruments.join("\n")}`,
    `Production Style:\n${analysis.generator_ready.productionStyle}`,
    `Additional Instructions:\n${analysis.generator_ready.additionalInstructions || "—"}`,
    `Genre & Style:\n${analysis.detailed_analysis.genreAndStyle}`,
    `Mood & Emotional Arc:\n${analysis.detailed_analysis.moodAndEmotionalArc}`,
    `Tempo & Groove:\n${analysis.detailed_analysis.tempoAndGroove}`,
    `Instrumentation:\n${analysis.detailed_analysis.instrumentation.map((item) => `[${item.confidence.toUpperCase()}] ${item.observation}`).join("\n")}`,
    `Arrangement:\n${analysis.detailed_analysis.arrangement}`,
    `Song Structure:\n${analysis.detailed_analysis.songStructure}`,
    `Vocals:\n${analysis.detailed_analysis.vocals}`,
    `Production & Mix:\n${analysis.detailed_analysis.productionAndMix.map((item) => `[${item.confidence.toUpperCase()}] ${item.observation}`).join("\n")}`,
    `Dynamics & Energy:\n${analysis.detailed_analysis.dynamicsAndEnergy}`,
    `Notable Characteristics:\n${analysis.detailed_analysis.notableCharacteristics.join("\n")}`,
    `Confidence / Uncertainty Notes:\n${analysis.detailed_analysis.confidenceAndUncertaintyNotes.join("\n")}`,
  ].join("\n\n");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
    ]);
  const move = async (projectId: string) => {
    await updateSongAnalysisOrganization({
      data: { id: analysis.id, projectId: projectId || null },
    });
    await refresh();
  };
  const rename = async () => {
    const name = window
      .prompt(language === "el" ? "Όνομα ανάλυσης" : "Analysis name", analysis.name)
      ?.trim();
    if (!name || name === analysis.name) return;
    await updateSongAnalysisOrganization({ data: { id: analysis.id, name } });
    await refresh();
  };
  const remove = async () => {
    if (!window.confirm(t("library.analysisDeleteConfirm"))) return;
    setDeleting(true);
    try {
      await deleteSongAnalysis({ data: { id: analysis.id } });
      await refresh();
    } finally {
      setDeleting(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is best-effort in restricted browser contexts.
    }
  };
  const send = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "pb:song-analyzer-handoff",
      JSON.stringify(analysis.generator_ready),
    );
    void navigate({ to: "/generate" });
  };

  return (
    <article className="rounded-2xl border border-accent/30 bg-accent/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            {t("library.analysisInitial")}
          </p>
          <h3 className="mt-1 truncate font-display font-bold">{analysis.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysis.generator_ready.musicStyle}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysis.generator_ready.mood} · {bpmText} · {bpm.confidence} confidence
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {project?.name ?? t("library.analysisStandalone")} ·{" "}
            {new Date(analysis.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={rename}
            title={language === "el" ? "Μετονομασία" : "Rename"}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copy}
            title={t("library.analysisCopy")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={send}
            title={t("library.analysisSendGenerator")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            <Wand2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            title={t("library.analysisDelete")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("library.analysisModel")}: {analysis.model}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select
          value={analysis.project_id ?? ""}
          onChange={(e) => move(e.target.value)}
          aria-label={t("library.analysisMove")}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"
        >
          <option value="">{t("songAnalyzer.noProject")}</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {analysis.project_id && (
          <button
            type="button"
            onClick={() => move("")}
            title={t("library.analysisRemoveProject")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            <FolderX className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-accent"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        {expanded ? t("library.analysisHide") : t("library.analysisOpen")}
      </button>
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-accent">
              {t("songAnalyzer.instruments")}
            </p>
            <p className="mt-1 whitespace-pre-wrap">
              {analysis.generator_ready.instruments.join("\n")}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-accent">
              {t("songAnalyzer.songStructure")}
            </p>
            <p className="mt-1">{analysis.generator_ready.songStructure.join(" → ")}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-accent">
              {t("songAnalyzer.productionStyle")}
            </p>
            <p className="mt-1">{analysis.generator_ready.productionStyle}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-accent">
              {t("songAnalyzer.detailed")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {analysis.detailed_analysis.genreAndStyle}\n\n
              {analysis.detailed_analysis.moodAndEmotionalArc}\n\n
              {analysis.detailed_analysis.tempoAndGroove}\n\n
              {analysis.detailed_analysis.arrangement}\n\n{analysis.detailed_analysis.vocals}\n\n
              {analysis.detailed_analysis.dynamicsAndEnergy}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function SavedPromptCard({
  prompt,
  projects,
  compact = false,
  listMode = false,
  onMoveToFolder,
  onDuplicate,
  onLongPress,
}: {
  prompt: SavedPrompt;
  projects: PromptProject[];
  compact?: boolean;
  listMode?: boolean;
  onMoveToFolder?: () => void;
  onDuplicate?: () => void;
  onLongPress?: (point: LibraryActionMenuAnchor) => void;
}) {
  const { t, language } = useI18n();
  const generatorAccess = useFeatureAccess("ai_generator");
  const lyricsWorkspaceAccess = useFeatureAccess("lyrics_workspace");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [standaloneAction, setStandaloneAction] = useState<"revision" | "lyrics" | null>(null);
  const [movingToProject, setMovingToProject] = useState(false);
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<LibraryActionMenuAnchor | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === prompt.project_id);
  const longPress = useLibraryLongPress((point) => {
    if (prompt.project_id) setProjectMenuAnchor(point);
    else onLongPress?.(point);
  }, !prompt.project_id && !onLongPress);
  const displayVersionLabel =
    prompt.source_generation_job_id && prompt.revision_request ? null : prompt.version_label;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),
    ]);
  const remove = async () => {
    if (!window.confirm(language === "el" ? "Να διαγραφεί αυτό το prompt;" : "Delete this prompt?"))
      return;
    setDeleting(true);
    try {
      await deleteSavedPrompt({ data: { id: prompt.id } });
      await refresh();
    } finally {
      setDeleting(false);
    }
  };
  const copy = async (text: string, field?: "tags" | "lyrics") => {
    try {
      await navigator.clipboard.writeText(text);
      if (field) {
        setCopiedField(field);
        setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1600);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // Clipboard access is best-effort in restricted browser contexts.
    }
  };
  const rename = async () => {
    const name = window
      .prompt(
        language === "el" ? "Όνομα prompt" : "Prompt name",
        prompt.custom_name ?? prompt.title ?? "",
      )
      ?.trim();
    if (name == null) return;
    await updateSavedPromptOrganization({ data: { id: prompt.id, custom_name: name || null } });
    await refresh();
  };
  const openAction = (action: "revision" | "lyrics", projectId: string | null) => {
    if (!projectId) {
      setStandaloneAction(action);
      return;
    }
    void navigate({
      to: "/generate",
      search:
        action === "revision"
          ? { mode: "revision" as const, project: projectId, base: prompt.id }
          : { workspace: "lyrics" as const, project: projectId, base: prompt.id },
    });
  };
  const revise = () => openAction("revision", prompt.project_id);
  const editLyrics = () => openAction("lyrics", prompt.project_id);

  const move = async (projectId: string) => {
    const next = projectId || null;
    setMovingToProject(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });
      await refresh();
    } finally {
      setMovingToProject(false);
    }
  };

  const detachFromProject = async () => {
    if (!prompt.project_id || projectActionBusy) return;
    setProjectActionBusy(true);
    try {
      await detachSavedPromptFromProject({ data: { id: prompt.id } });
      await refresh();
      setProjectMenuAnchor(null);
    } finally {
      setProjectActionBusy(false);
    }
  };

  const copyToProject = async (destinationProjectId: string) => {
    if (!prompt.project_id || projectActionBusy) return;
    setProjectActionBusy(true);
    try {
      await copySavedPromptToProject({ data: { id: prompt.id, destinationProjectId } });
      await refresh();
      setProjectMenuAnchor(null);
    } finally {
      setProjectActionBusy(false);
    }
  };

  const moveToAnotherProject = async (destinationProjectId: string) => {
    if (!prompt.project_id || projectActionBusy) return;
    setProjectActionBusy(true);
    try {
      await moveSavedPromptToProject({ data: { id: prompt.id, destinationProjectId } });
      await refresh();
      setProjectMenuAnchor(null);
    } finally {
      setProjectActionBusy(false);
    }
  };

  const saveEdit = async (values: StandalonePromptEditValues) => {
    setSavingEdit(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, ...values } });
      await refresh();
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const continueStandalone = () => {
    const action = standaloneAction;
    if (!action) return;
    setStandaloneAction(null);
    void navigate({
      to: "/generate",
      search:
        action === "revision"
          ? { mode: "revision" as const, base: prompt.id }
          : { workspace: "lyrics" as const, base: prompt.id },
    });
  };

  const addToProjectThenContinue = async (projectId: string) => {
    const action = standaloneAction;
    if (!action) return;
    setMovingToProject(true);
    try {
      await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: projectId } });
      await refresh();
      setStandaloneAction(null);
      openAction(action, projectId);
    } finally {
      setMovingToProject(false);
    }
  };

  return (
    <article
      className={cn(
        "rounded-2xl border border-white/10 bg-black/20",
        compact ? "p-3" : "glass p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" {...longPress}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-sm font-bold">
              {prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}
            </h3>
            {prompt.project_id && prompt.version_number && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                V{prompt.version_number}
                {displayVersionLabel ? ` · ${displayVersionLabel}` : ""}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {[project?.name, prompt.genre, prompt.mood].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="hidden shrink-0 gap-1 sm:flex">
          {lyricsWorkspaceAccess.allowed && (
            <button
              type="button"
              onClick={editLyrics}
              aria-label={t("library.editLyrics")}
              title={t("library.editLyrics")}
              className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
            >
              <FilePenLine className="h-3.5 w-3.5" />
            </button>
          )}
          {generatorAccess.allowed && (
            <button
              type="button"
              onClick={revise}
              aria-label={t("library.revisePrompt")}
              title={t("library.revisePrompt")}
              className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onMoveToFolder && !prompt.project_id && (
            <button
              type="button"
              onClick={onMoveToFolder}
              aria-label={
                language === "el" ? "Μετακίνηση Prompt σε φάκελο" : "Move Prompt to folder"
              }
              title={language === "el" ? "Μετακίνηση Prompt σε φάκελο" : "Move Prompt to folder"}
              className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
          )}
          {onDuplicate && !prompt.project_id && (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={language === "el" ? "Δημιουργία αντιγράφου Prompt" : "Duplicate Prompt"}
              title={language === "el" ? "Δημιουργία αντιγράφου Prompt" : "Duplicate Prompt"}
              className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"}
            title={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"}
            className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))}
            aria-label={t("library.copyPrompt")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <ExportControl
            kind="prompt"
            id={prompt.id}
            name={prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}
            compact={compact}
          />
          <button
            onClick={remove}
            disabled={deleting}
            aria-label={t("library.deletePrompt")}
            className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
          {prompt.project_id && (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setProjectMenuAnchor({ x: rect.right - 8, y: rect.bottom + 6 });
              }}
              className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
              aria-label={language === "el" ? "Περισσότερες επιλογές" : "More options"}
              title={language === "el" ? "Περισσότερα" : "More"}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent"
          aria-label={language === "el" ? "Επεξεργασία Prompt" : "Edit Prompt"}
          title={language === "el" ? "Επεξεργασία" : "Edit"}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))}
          className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent"
          aria-label={t("library.copyPrompt")}
          title={t("library.copyPrompt")}
        >
          {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
          aria-label={t("library.deletePrompt")}
          title={t("library.deletePrompt")}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const anchor = { x: rect.right - 8, y: rect.bottom + 6 };
            if (prompt.project_id) setProjectMenuAnchor(anchor);
            else onLongPress?.(anchor);
          }}
          className="grid min-h-11 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-accent"
          aria-label={language === "el" ? "Περισσότερες επιλογές" : "More options"}
          title={language === "el" ? "Περισσότερα" : "More"}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {listMode && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
          {expanded
            ? language === "el"
              ? "Απόκρυψη"
              : "Hide"
            : language === "el"
              ? "Προβολή prompt"
              : "Show prompt"}
        </button>
      )}
      {(!listMode || expanded) &&
        (prompt.project_id && prompt.version_change_metadata ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5 text-accent" />
            <span className="truncate">
              {project?.name ?? (language === "el" ? "Project έκδοσης" : "Version project")}
            </span>
            <span className="ml-auto text-[10px]">
              {language === "el" ? "Ιστορικό έκδοσης" : "Version history"}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <select
              value={prompt.project_id ?? ""}
              onChange={(e) => void move(e.target.value)}
              disabled={movingToProject}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs disabled:opacity-60"
            >
              <option value="">{language === "el" ? "Χωρίς Project" : "No Project"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {prompt.project_id && (
              <button
                type="button"
                aria-label={language === "el" ? "Αφαίρεση από project" : "Remove from project"}
                title={language === "el" ? "Αφαίρεση από project" : "Remove from project"}
                onClick={() => move("")}
                className="min-h-10 min-w-10 rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"
              >
                <FolderX className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      {(!listMode || expanded) && !compact && prompt.revision_request && (
        <div className="mt-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
            {language === "el" ? "Αίτημα αναθεώρησης" : "Revision request"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
            {prompt.revision_request}
          </p>
        </div>
      )}
      {(!listMode || expanded) && !compact && prompt.tags && (
        <div className="mt-3 relative overflow-hidden rounded-xl bg-black/40">
          <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap p-3 pr-14 text-[11px] text-muted-foreground">
            {prompt.tags}
          </pre>
          <button
            type="button"
            onClick={() => copy(prompt.tags, "tags")}
            aria-label={language === "el" ? "Αντιγραφή μουσικού στυλ" : "Copy Music Style"}
            title={language === "el" ? "Αντιγραφή μουσικού στυλ" : "Copy Music Style"}
            className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-bl-2xl border-b border-l border-white/10 bg-[#17171d] text-muted-foreground transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copiedField === "tags" ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
      {(!listMode || expanded) && !compact && prompt.lyrics && (
        <div className="mt-2 relative overflow-hidden rounded-xl bg-black/40">
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap p-3 pr-14 text-[11px] text-muted-foreground">
            {prompt.lyrics}
          </pre>
          <button
            type="button"
            onClick={() => copy(prompt.lyrics, "lyrics")}
            aria-label={language === "el" ? "Αντιγραφή στίχων" : "Copy Lyrics"}
            title={language === "el" ? "Αντιγραφή στίχων" : "Copy Lyrics"}
            className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-bl-2xl border-b border-l border-white/10 bg-[#17171d] text-muted-foreground transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copiedField === "lyrics" ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
      <ProjectPromptActionMenu
        open={Boolean(prompt.project_id && projectMenuAnchor)}
        anchor={projectMenuAnchor}
        language={language}
        title={prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}
        currentProjectId={prompt.project_id}
        projects={projects}
        busy={projectActionBusy}
        onClose={() => setProjectMenuAnchor(null)}
        onDetach={detachFromProject}
        onCopy={copyToProject}
        onMove={moveToAnotherProject}
      />
      <EditStandalonePromptDialog
        open={editing}
        language={language}
        prompt={prompt}
        busy={savingEdit}
        onClose={() => setEditing(false)}
        onSave={saveEdit}
      />
      <StandalonePromptRevisionDialog
        open={Boolean(standaloneAction)}
        language={language}
        projects={projects}
        busy={movingToProject}
        onClose={() => setStandaloneAction(null)}
        onReplace={continueStandalone}
        onAddToProject={addToProjectThenContinue}
      />
    </article>
  );
}
