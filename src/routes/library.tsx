import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Copy, Check, Trash2, Loader2, Search, FolderPlus, Folder, Pencil, FolderX, ChevronDown, ChevronRight, Home, Wand2, FilePenLine, FolderInput } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { PlaylistLibraryPanel } from "@/components/promptbeats/PlaylistLibraryPanel";
import { SharedLinksPanel } from "@/components/promptbeats/SharedLinksPanel";
import { ExportControl } from "@/components/promptbeats/ExportControl";
import { TrackGridModeToggle, trackGridClassName, useTrackGridMode, type TrackGridMode } from "@/components/promptbeats/TrackGridView";
import type { Track } from "@/lib/tracks";
import type { CreatedWith } from "@/lib/created-with";
import { usePlayer } from "@/lib/player";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { listMyTracks, listLikedTracks } from "@/lib/tracks.functions";
import { listSavedPrompts, deleteSavedPrompt, listPromptProjects, createPromptProject, renamePromptProject, deletePromptProject, updatePromptProjectCreationNotes, updateSavedPromptOrganization } from "@/lib/ai.functions";
import { listFavoriteTracks } from "@/lib/playlists.functions";
import { deleteSongAnalysis, listSongAnalyses, updateSongAnalysisOrganization } from "@/lib/song-analyzer.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { TrackSourceFilter, filterByTrackSource, useTrackSourcePreference, type TrackSourcePreference } from "@/components/promptbeats/TrackSourceFilter";
import { ProjectVersionHistory } from "@/components/promptbeats/ProjectVersionHistory";
import { LibraryFolderPicker } from "@/components/promptbeats/LibraryFolderPicker";
import {
  createLibraryFolder,
  deleteLibraryFolder,
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

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My Library — PromptBeats" },
      { name: "description", content: "Your uploaded tracks, saved AI prompts and liked songs, all in one place." },
      { property: "og:title", content: "My Library — PromptBeats" },
      { property: "og:description", content: "Manage your AI music uploads, saved prompts and liked tracks on PromptBeats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

const TABS = ["tracks", "playlists", "shared", "prompts", "favorites", "likes"] as const;
function LibraryPage() {
  const { t, language } = useI18n();
  const { user, profile, loading } = useAuth();
  const playlistsAccess = useFeatureAccess("playlists");
  const sharingAccess = useFeatureAccess("sharing_public_links");
  const favoritesAccess = useFeatureAccess("favorites");
  const likesAccess = useFeatureAccess("likes");
  const analyzerAccess = useFeatureAccess("song_analyzer");
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const { preference: defaultTrackSource } = useTrackSourcePreference();
  const [trackSource, setTrackSource] = useState<TrackSourcePreference>(defaultTrackSource);
  const [tab, setTab] = useState<(typeof TABS)[number]>("tracks");
  const [promptView, setPromptView] = useState<"all" | "projects" | "analyses">("all");
  const [promptSearch, setPromptSearch] = useState("");
  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, tab]);

  const availableTabs = TABS.filter((item) => {
    if (item === "playlists") return playlistsAccess.allowed;
    if (item === "shared") return sharingAccess.allowed;
    if (item === "favorites") return favoritesAccess.allowed;
    if (item === "likes") return likesAccess.allowed;
    return true;
  });

  useEffect(() => {
    if (!availableTabs.includes(tab)) setTab("tracks");
  }, [availableTabs, tab]);

  useEffect(() => {
    if (promptView === "analyses" && !analyzerAccess.allowed) {
      setPromptView("all");
    }
  }, [analyzerAccess.allowed, promptView]);

  const handle = profile?.handle ? `@${profile.handle}` : t("nav.you");

  const mine = useQuery({ queryKey: ["library", "mine", user?.id], queryFn: () => listMyTracks(), enabled: Boolean(user) });
  const prompts = useQuery({ queryKey: ["library", "prompts", user?.id], queryFn: () => listSavedPrompts(), enabled: Boolean(user) });
  const projects = useQuery({ queryKey: ["library", "prompt-projects", user?.id], queryFn: () => listPromptProjects(), enabled: Boolean(user) });
  const analyses = useQuery({ queryKey: ["library", "song-analyses", user?.id], queryFn: () => listSongAnalyses(), enabled: Boolean(user && analyzerAccess.allowed) });
  const liked = useQuery({ queryKey: ["library", "liked", user?.id], queryFn: () => listLikedTracks(), enabled: Boolean(user && likesAccess.allowed) });
  const favorites = useQuery({ queryKey: ["library", "favorites", user?.id], queryFn: () => listFavoriteTracks(), enabled: Boolean(user && favoritesAccess.allowed) });

  const myTracks = (mine.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const likedTracks = (liked.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const favoriteTracks = (favorites.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
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

  const header = <div className="flex items-center gap-2"><LibraryIcon className="h-5 w-5 text-accent" /><span className="font-display text-lg font-bold">{t("library.title")}</span></div>;

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-10 md:px-8 md:pb-[150px]">
          <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
            <h1 className="font-display text-xl font-bold">{t("library.guestTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("library.guestBody")}</p>
            <Link to="/auth" className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon">{t("nav.signIn")}</Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const emptyMyTracks = t("library.noTracks");

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">{t("library.title")}</h1>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {availableTabs.map((item) => <button key={item} onClick={() => setTab(item)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all", tab === item ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon" : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent")}>{tabLabel(item)}</button>)}
        </div>

        {tab === "tracks" && (
          <>
            <div className="mt-3 flex w-full items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1" role="group" aria-label={language === "el" ? "Πηγή τραγουδιών" : "Track source"}>
                {([
                  ["all", language === "el" ? `Όλα (${myTracks.length})` : `All (${myTracks.length})`],
                  ["uploads", `Uploads (${uploadTrackCount})`],
                  ["external", `External (${externalTrackCount})`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={trackSource === value}
                    onClick={() => setTrackSource(value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                      trackSource === value ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} className="shrink-0" />
            </div>
            <Section empty={emptyMyTracks} tracks={filteredMyTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, myTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "playlists" && user && playlistsAccess.allowed && <PlaylistLibraryPanel userId={user.id} />}

        {tab === "shared" && user && sharingAccess.allowed && <SharedLinksPanel />}

        {tab === "favorites" && favoritesAccess.allowed && (
          <>
            <div className="mt-3 flex flex-wrap justify-end gap-2"><TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} /><TrackGridModeToggle mode={gridMode} onChange={setGridMode} /></div>
            <Section empty={language === "el" ? "Δεν έχεις ακόμη αποθηκεύσει τραγούδια στα Αγαπημένα σου." : "You have not saved any favorite tracks yet."} tracks={filteredFavoriteTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, filteredFavoriteTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "likes" && likesAccess.allowed && (
          <>
            <div className="mt-3 flex flex-wrap justify-end gap-2"><TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} /><TrackGridModeToggle mode={gridMode} onChange={setGridMode} /></div>
            <Section empty={t("library.noLikes")} tracks={filteredLikedTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, filteredLikedTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "prompts" && (
          <PromptProjectLibrary
            prompts={prompts.data?.prompts ?? []}
            projects={projects.data?.projects ?? []}
            analyses={analyses.data?.analyses ?? []}
            loading={prompts.isLoading || projects.isLoading || (analyzerAccess.allowed && analyses.isLoading)}
            showAnalyses={analyzerAccess.allowed}
            view={promptView}
            onViewChange={setPromptView}
            search={promptSearch}
            onSearchChange={setPromptSearch}
          />
        )}
      </main>
    </AppShell>
  );
}

function Section({ tracks, empty, playing, currentId, onPlay, gridMode }: { tracks: Track[]; empty: string; playing: boolean; currentId?: string | undefined; onPlay: (track: Track) => void; gridMode: TrackGridMode }) {
  return (
    <>
      <div className={`mt-6 ${trackGridClassName(gridMode)}`}>
        {tracks.map((track) => <TrackCard key={track.id} track={track} isPlaying={playing && currentId === track.id} onPlay={onPlay} viewMode={gridMode} />)}
      </div>
      {tracks.length === 0 && <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{empty}</p>}
    </>
  );
}

type SavedPrompt = {
  id: string; title: string | null; custom_name: string | null; project_id: string | null;
  folder_id: string | null; duplicated_from_prompt_id: string | null;
  version_number: number | null; version_label: string | null; generator_input_snapshot: unknown | null;
  parent_prompt_id: string | null; revision_request: string | null; source_generation_job_id: string | null;
  version_change_metadata: unknown | null; version_user_note: string | null;
  theme: string | null; genre: string | null;
  mood: string | null; language: string | null; tags: string | null; lyrics: string | null; note: string | null;
  created_at: string; updated_at: string;
};
type PromptProject = { id: string; name: string; creation_notes: string; preferred_prompt_id: string | null; folder_id: string | null; duplicated_from_project_id: string | null; created_at: string; updated_at: string };
type SongAnalysisItem = {
  id: string; name: string; project_id: string | null; model: string; created_at: string;
  generator_ready: {
    musicStyle: string; mood: string; instruments: string[];
    bpm: { approximate: number | null; rangeMin: number | null; rangeMax: number | null; confidence: string; notes: string };
    songStructure: string[]; productionStyle: string; additionalInstructions: string;
  };
  detailed_analysis: {
    genreAndStyle: string; moodAndEmotionalArc: string; tempoAndGroove: string;
    instrumentation: Array<{ observation: string; confidence: string }>;
    arrangement: string; songStructure: string; vocals: string;
    productionAndMix: Array<{ observation: string; confidence: string }>;
    dynamicsAndEnergy: string; notableCharacteristics: string[]; confidenceAndUncertaintyNotes: string[];
  };
};

function PromptProjectLibrary({ prompts, projects, analyses, loading, showAnalyses, view, onViewChange, search, onSearchChange }: {
  prompts: SavedPrompt[]; projects: PromptProject[]; analyses: SongAnalysisItem[]; loading: boolean; showAnalyses: boolean; view: "all" | "projects" | "analyses";
  onViewChange: (view: "all" | "projects" | "analyses") => void; search: string; onSearchChange: (value: string) => void;
}) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [promptDisplayMode, setPromptDisplayMode] = useState<"expanded" | "list">("list");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState("");
  const [folderPicker, setFolderPicker] = useState<null | {
    kind: "folder" | "project" | "prompt";
    id: string;
    name: string;
    currentFolderId: string | null;
  }>(null);
  const q = search.trim().toLowerCase();

  const folderContents = useQuery({
    queryKey: ["library", "folder-contents", currentFolderId],
    queryFn: () => listLibraryFolderContents({ data: { folderId: currentFolderId } }),
    enabled: view === "all" && !q,
  });

  const folderBreadcrumbs = useQuery({
    queryKey: ["library", "folder-breadcrumbs", currentFolderId],
    queryFn: () => getLibraryFolderBreadcrumbs({ data: { folderId: currentFolderId! } }),
    enabled: view === "all" && Boolean(currentFolderId),
  });

  const folderSearch = useQuery({
    queryKey: ["library", "folder-scope-search", currentFolderId, q],
    queryFn: () => searchLibraryScope({ data: { folderId: currentFolderId, query: q } }),
    enabled: view === "all" && q.length > 0,
  });
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "";
  const matches = (p: SavedPrompt) => !q || [p.custom_name, p.title, projectName(p.project_id), p.theme, p.genre, p.mood, p.tags, p.lyrics, p.note].some((v) => v?.toLowerCase().includes(q));
  const matchesAnalysis = (a: SongAnalysisItem) => !q || [a.name, projectName(a.project_id), a.model, a.generator_ready.musicStyle, a.generator_ready.mood, a.generator_ready.productionStyle, ...a.generator_ready.instruments].some((v) => v?.toLowerCase().includes(q));
  const filtered = prompts.filter(matches);
  const visibleAnalyses = showAnalyses ? analyses : [];
  const filteredAnalyses = visibleAnalyses.filter(matchesAnalysis);
  const visibleProjects = projects.filter((project) => !q || project.name.toLowerCase().includes(q) || project.creation_notes.toLowerCase().includes(q) || prompts.some((p) => p.project_id === project.id && matches(p)) || visibleAnalyses.some((a) => a.project_id === project.id && matchesAnalysis(a)));
  const openProject = projects.find((project) => project.id === openProjectId) ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-picker"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-breadcrumbs"], exact: false }),
      ...(showAnalyses ? [queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false })] : []),
    ]);
  };

  const flashFolderMessage = (message: string) => {
    setFolderMessage(message);
    window.setTimeout(() => setFolderMessage(""), 2600);
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
    const name = window.prompt(language === "el" ? "Νέο όνομα φακέλου" : "New folder name", folder.name)?.trim();
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
    if (!window.confirm(language === "el" ? `Να διαγραφεί ο κενός φάκελος «${folder.name}»;` : `Delete the empty folder “${folder.name}”?`)) return;
    setBusy(true);
    try {
      await deleteLibraryFolder({ data: { folderId: folder.id } });
      await refresh();
      flashFolderMessage(language === "el" ? "Ο φάκελος διαγράφηκε." : "Folder deleted.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : (language === "el" ? "Ο φάκελος δεν μπορεί να διαγραφεί." : "Folder could not be deleted."));
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    const name = window.prompt(language === "el" ? "Όνομα project" : "Project name")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createPromptProject({ data: { name, folderId: view === "all" ? currentFolderId : null } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const moveFolderItem = async (destinationFolderId: string | null, path: string) => {
    if (!folderPicker) return;
    setBusy(true);
    try {
      if (folderPicker.kind === "folder") {
        await moveLibraryFolder({ data: { folderId: folderPicker.id, destinationFolderId } });
      } else if (folderPicker.kind === "project") {
        await movePromptProjectToFolder({ data: { projectId: folderPicker.id, destinationFolderId } });
      } else {
        await moveStandalonePromptToFolder({ data: { promptId: folderPicker.id, destinationFolderId } });
      }
      await refresh();
      flashFolderMessage(language === "el" ? `Μετακινήθηκε σε ${path}.` : `Moved to ${path}.`);
      setFolderPicker(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : (language === "el" ? "Η μετακίνηση απέτυχε." : "Move failed."));
    } finally {
      setBusy(false);
    }
  };
  const renameProject = async (project: PromptProject) => {
    const name = window.prompt(language === "el" ? "Νέο όνομα project" : "New project name", project.name)?.trim();
    if (!name || name === project.name) return;
    setBusy(true); try { await renamePromptProject({ data: { id: project.id, name } }); await refresh(); } finally { setBusy(false); }
  };
  const removeProject = async (project: PromptProject) => {
    if (!window.confirm(language === "el" ? "Να διαγραφεί το project; Τα prompts και οι αναλύσεις θα παραμείνουν στη βιβλιοθήκη χωρίς project." : "Delete this project? Its prompts and analyses will remain in your library with no project.")) return;
    setBusy(true); try { await deletePromptProject({ data: { id: project.id } }); await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
          {(["all", "projects", ...(showAnalyses ? ["analyses"] as const : [])] as const).map((item) => <button key={item} onClick={() => onViewChange(item)} className={cn("rounded-lg px-4 py-2 text-xs font-semibold transition-colors", view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{item === "all" ? t("library.promptViewAll") : item === "projects" ? t("library.promptViewProjects") : t("library.promptViewAnalyses")}</button>)}
        </div>
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={language === "el" ? "Αναζήτηση prompts, projects, style, mood, στίχων…" : "Search prompts, projects, style, mood, lyrics…"} className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/60" /></label>
        {view !== "analyses" && <div className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={promptDisplayMode === "expanded"} onClick={() => setPromptDisplayMode("expanded")} className={cn("rounded-lg border p-2 text-xs", promptDisplayMode === "expanded" ? "border-accent/50 text-accent" : "border-white/10 text-muted-foreground")}>{language === "el" ? "Κάρτες" : "Cards"}</button>
          <button type="button" aria-pressed={promptDisplayMode === "list"} onClick={() => setPromptDisplayMode("list")} className={cn("rounded-lg border p-2 text-xs", promptDisplayMode === "list" ? "border-accent/50 text-accent" : "border-white/10 text-muted-foreground")}>{language === "el" ? "Λίστα" : "List"}</button>
        </div>}
        <div className="flex shrink-0 gap-2">
          {view === "all" && <button disabled={busy} onClick={createFolder} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:border-accent/40 hover:text-accent disabled:opacity-50"><FolderPlus className="h-4 w-4" />{language === "el" ? "Νέος Φάκελος" : "New Folder"}</button>}
          <button disabled={busy} onClick={createProject} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-accent hover:bg-primary/15 disabled:opacity-50"><FolderPlus className="h-4 w-4" />{language === "el" ? "Νέο Project" : "New Project"}</button>
        </div>
      </div>

      {folderMessage && <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs font-medium text-accent">{folderMessage}</div>}

      {view === "all" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((prompt) => <SavedPromptCard key={prompt.id} prompt={prompt} projects={projects} listMode={promptDisplayMode === "list"} />)}
          {!loading && filtered.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{q ? (language === "el" ? "Δεν βρέθηκαν prompts." : "No prompts found.") : t("library.noPrompts")}</p>}
        </div>
      ) : view === "analyses" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredAnalyses.map((analysis) => <SongAnalysisCard key={analysis.id} analysis={analysis} projects={projects} />)}
          {!loading && filteredAnalyses.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{q ? t("library.analysisNoMatch") : t("library.analysisNone")}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {openProject ? (() => {
            const items = prompts.filter((p) => p.project_id === openProject.id && matches(p)).sort((a,b) => (a.version_number ?? 999999) - (b.version_number ?? 999999) || a.created_at.localeCompare(b.created_at));
            const analysisItems = visibleAnalyses.filter((a) => a.project_id === openProject.id && matchesAnalysis(a));
            return <section className="space-y-4">
              <div className="glass rounded-2xl p-4">
                <button type="button" onClick={() => { setOpenProjectId(null); onSearchChange(""); }} className="mb-3 text-xs font-semibold text-accent">← Projects</button>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><Folder className="h-5 w-5 text-accent" /><h2 className="truncate font-display text-lg font-bold">{openProject.name}</h2></div><p className="mt-1 text-[11px] text-muted-foreground">{analysisItems.length} analyses · {prompts.filter((p) => p.project_id === openProject.id).length} prompts</p></div>
                  <div className="flex gap-2"><ExportControl kind="project" id={openProject.id} name={openProject.name} /><button onClick={() => renameProject(openProject)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-4 w-4" /></button><button onClick={() => removeProject(openProject)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
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
                  {language === "el" ? `Project Versions / Prompts (${items.length})` : `Project Versions / Prompts (${items.length})`}
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {items.map((prompt) => <SavedPromptCard key={prompt.id} prompt={prompt} projects={projects} listMode={promptDisplayMode === "list"} />)}
                  {items.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν αποθηκευμένες εκδόσεις σε αυτό το project." : "No saved versions in this project."}</p>}
                </div>
              </details>

              {analysisItems.length > 0 && (
                <details className="glass rounded-2xl p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">
                    {language === "el" ? `Αναλύσεις (${analysisItems.length})` : `Analyses (${analysisItems.length})`}
                  </summary>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {analysisItems.map((analysis) => <SongAnalysisCard key={analysis.id} analysis={analysis} projects={projects} />)}
                  </div>
                </details>
              )}

              {items.length === 0 && analysisItems.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν items σε αυτό το project." : "No items in this project."}</p>}
            </section>;
          })() : <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => {
                const promptCount = prompts.filter((p) => p.project_id === project.id).length;
                const analysisCount = visibleAnalyses.filter((a) => a.project_id === project.id).length;
                const count = promptCount + analysisCount;
                return <article key={project.id} className="glass flex items-center gap-3 rounded-2xl p-4">
                  <button type="button" onClick={() => { setOpenProjectId(project.id); onSearchChange(""); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10"><Folder className="h-5 w-5 text-accent" /></span><span className="min-w-0"><span className="block truncate font-display font-bold">{project.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{count} items{analysisCount ? ` · ${analysisCount} analysis` : ""}</span>{project.creation_notes.trim() && <span className="mt-1 block truncate text-[11px] text-accent/80">{project.creation_notes}</span>}</span></button>
                  <div className="flex shrink-0 gap-1"><ExportControl kind="project" id={project.id} name={project.name} /><button onClick={() => renameProject(project)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-4 w-4" /></button><button onClick={() => removeProject(project)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
                </article>;
              })}
            </div>
          </>}
          {!loading && visibleProjects.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν projects ακόμη." : "No projects yet."}</p>}
        </div>
      )}
    </div>
  );
}

function ProjectCreationNotes({ project }: { project: PromptProject }) {
  const { language } = useI18n();
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

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updatePromptProjectCreationNotes({
        data: { id: project.id, creationNotes: draft },
      });
      await queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "el" ? "Η αποθήκευση απέτυχε." : "Could not save notes."));
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
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving
            ? (language === "el" ? "Αποθήκευση..." : "Saving...")
            : (language === "el" ? "Αποθήκευση σημειώσεων" : "Save notes")}
        </button>
      </div>
    </div>
  );
}

function SongAnalysisCard({ analysis, projects }: { analysis: SongAnalysisItem; projects: PromptProject[] }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const project = projects.find((item) => item.id === analysis.project_id) ?? null;
  const bpm = analysis.generator_ready.bpm;
  const bpmText = bpm.rangeMin != null && bpm.rangeMax != null
    ? `${bpm.rangeMin}–${bpm.rangeMax} BPM`
    : bpm.approximate != null ? `≈ ${bpm.approximate} BPM` : "BPM uncertain";
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
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false }),
    queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
  ]);  const move = async (projectId: string) => {
    await updateSongAnalysisOrganization({ data: { id: analysis.id, projectId: projectId || null } });
    await refresh();
  };
  const rename = async () => {
    const name = window.prompt(language === "el" ? "Όνομα ανάλυσης" : "Analysis name", analysis.name)?.trim();
    if (!name || name === analysis.name) return;
    await updateSongAnalysisOrganization({ data: { id: analysis.id, name } });
    await refresh();
  };
  const remove = async () => {
    if (!window.confirm(t("library.analysisDeleteConfirm"))) return;
    setDeleting(true);
    try { await deleteSongAnalysis({ data: { id: analysis.id } }); await refresh(); } finally { setDeleting(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(fullText); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const send = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("pb:song-analyzer-handoff", JSON.stringify(analysis.generator_ready));
    void navigate({ to: "/generate" });
  };

  return (
    <article className="rounded-2xl border border-accent/30 bg-accent/[0.05] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t("library.analysisInitial")}</p>
          <h3 className="mt-1 truncate font-display font-bold">{analysis.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{analysis.generator_ready.musicStyle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{analysis.generator_ready.mood} · {bpmText} · {bpm.confidence} confidence</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{project?.name ?? t("library.analysisStandalone")} · {new Date(analysis.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={rename} title={language === "el" ? "Μετονομασία" : "Rename"} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={copy} title={t("library.analysisCopy")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent">{copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}</button>
          <button type="button" onClick={send} title={t("library.analysisSendGenerator")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Wand2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={remove} disabled={deleting} title={t("library.analysisDelete")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive">{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("library.analysisModel")}: {analysis.model}</p>
      <div className="mt-3 flex items-center gap-2">
        <select value={analysis.project_id ?? ""} onChange={(e) => move(e.target.value)} aria-label={t("library.analysisMove")} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs">
          <option value="">{t("songAnalyzer.noProject")}</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {analysis.project_id && <button type="button" onClick={() => move("")} title={t("library.analysisRemoveProject")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><FolderX className="h-4 w-4" /></button>}
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-accent"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />{expanded ? t("library.analysisHide") : t("library.analysisOpen")}</button>
      {expanded && <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
        <div><p className="text-[10px] uppercase tracking-wider text-accent">{t("songAnalyzer.instruments")}</p><p className="mt-1 whitespace-pre-wrap">{analysis.generator_ready.instruments.join("\n")}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-accent">{t("songAnalyzer.songStructure")}</p><p className="mt-1">{analysis.generator_ready.songStructure.join(" → ")}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-accent">{t("songAnalyzer.productionStyle")}</p><p className="mt-1">{analysis.generator_ready.productionStyle}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-accent">{t("songAnalyzer.detailed")}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{analysis.detailed_analysis.genreAndStyle}\n\n{analysis.detailed_analysis.moodAndEmotionalArc}\n\n{analysis.detailed_analysis.tempoAndGroove}\n\n{analysis.detailed_analysis.arrangement}\n\n{analysis.detailed_analysis.vocals}\n\n{analysis.detailed_analysis.dynamicsAndEnergy}</p></div>
      </div>}
    </article>
  );
}

function SavedPromptCard({ prompt, projects, compact = false, listMode = false }: { prompt: SavedPrompt; projects: PromptProject[]; compact?: boolean; listMode?: boolean }) {
  const { t, language } = useI18n();
  const generatorAccess = useFeatureAccess("ai_generator");
  const lyricsWorkspaceAccess = useFeatureAccess("lyrics_workspace");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === prompt.project_id);
  const displayVersionLabel = prompt.source_generation_job_id && prompt.revision_request
    ? null
    : prompt.version_label;

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
    queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
  ]);
  const remove = async () => {
    if (!window.confirm(language === "el" ? "Να διαγραφεί αυτό το prompt;" : "Delete this prompt?")) return;
    setDeleting(true); try { await deleteSavedPrompt({ data: { id: prompt.id } }); await refresh(); } finally { setDeleting(false); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
  const rename = async () => {
    const name = window.prompt(language === "el" ? "Όνομα prompt" : "Prompt name", prompt.custom_name ?? prompt.title ?? "")?.trim();
    if (name == null) return;
    await updateSavedPromptOrganization({ data: { id: prompt.id, custom_name: name || null } }); await refresh();
  };
  const revise = () => {
    if (!prompt.project_id) return;
    void navigate({
      to: "/generate",
      search: {
        mode: "revision",
        project: prompt.project_id,
        base: prompt.id,
      },
    });
  };

  const editLyrics = () => {
    if (!prompt.project_id) return;
    void navigate({
      to: "/generate",
      search: {
        workspace: "lyrics",
        project: prompt.project_id,
        base: prompt.id,
      },
    });
  };

  const move = async (projectId: string) => {
    const next = projectId || null;
    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });
    await refresh();
  };

  return (
    <article className={cn("rounded-2xl border border-white/10 bg-black/20", compact ? "p-3" : "glass p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-display text-sm font-bold">{prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}</h3>{prompt.project_id && prompt.version_number && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-accent">V{prompt.version_number}{displayVersionLabel ? ` · ${displayVersionLabel}` : ""}</span>}</div>
          <p className="truncate text-[11px] text-muted-foreground">{[project?.name, prompt.genre, prompt.mood].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 gap-1">{prompt.project_id && lyricsWorkspaceAccess.allowed && <button type="button" onClick={editLyrics} aria-label={t("library.editLyrics")} title={t("library.editLyrics")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><FilePenLine className="h-3.5 w-3.5" /></button>}{prompt.project_id && generatorAccess.allowed && <button type="button" onClick={revise} aria-label={t("library.revisePrompt")} title={t("library.revisePrompt")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Wand2 className="h-3.5 w-3.5" /></button>}<button onClick={rename} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))} aria-label={t("library.copyPrompt")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent">{copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}</button><ExportControl kind="prompt" id={prompt.id} name={prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")} compact={compact} /><button onClick={remove} disabled={deleting} aria-label={t("library.deletePrompt")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive">{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div>
      </div>
      {listMode && <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />{expanded ? (language === "el" ? "Απόκρυψη" : "Hide") : (language === "el" ? "Προβολή prompt" : "Show prompt")}</button>}
      {(!listMode || expanded) && (
        prompt.project_id && prompt.version_change_metadata
          ? <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-muted-foreground"><Folder className="h-3.5 w-3.5 text-accent" /><span className="truncate">{project?.name ?? (language === "el" ? "Project έκδοσης" : "Version project")}</span><span className="ml-auto text-[10px]">{language === "el" ? "Ιστορικό έκδοσης" : "Version history"}</span></div>
          : <div className="mt-3 flex items-center gap-2"><select value={prompt.project_id ?? ""} onChange={(e) => move(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"><option value="">{language === "el" ? "Χωρίς Project" : "No Project"}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{prompt.project_id && <button title={language === "el" ? "Αφαίρεση από project" : "Remove from project"} onClick={() => move("")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><FolderX className="h-4 w-4" /></button>}</div>
      )}
      {(!listMode || expanded) && !compact && prompt.revision_request && (
        <div className="mt-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{language === "el" ? "Αίτημα αναθεώρησης" : "Revision request"}</p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{prompt.revision_request}</p>
        </div>
      )}
            {(!listMode || expanded) && !compact && prompt.tags && <pre className="mt-3 max-h-20 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">{prompt.tags}</pre>}
      {(!listMode || expanded) && !compact && prompt.lyrics && <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">{prompt.lyrics}</pre>}
    </article>
  );
}
