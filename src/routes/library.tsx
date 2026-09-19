import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Copy, Check, Trash2, Loader2, Search, FolderPlus, Folder, Pencil, FolderX, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { PlaylistLibraryPanel } from "@/components/promptbeats/PlaylistLibraryPanel";
import { TrackGridModeToggle, trackGridClassName, useTrackGridMode, type TrackGridMode } from "@/components/promptbeats/TrackGridView";
import type { Track } from "@/lib/tracks";
import type { CreatedWith } from "@/lib/created-with";
import { usePlayer } from "@/lib/player";
import { useAuth } from "@/hooks/useAuth";
import { listMyTracks, listLikedTracks } from "@/lib/tracks.functions";
import { listSavedPrompts, deleteSavedPrompt, listPromptProjects, createPromptProject, renamePromptProject, deletePromptProject, updateSavedPromptOrganization } from "@/lib/ai.functions";
import { listFavoriteTracks } from "@/lib/playlists.functions";\nimport { listSongAnalyses } from "@/lib/song-analyzer.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

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
  allow_download: boolean;
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
    sourceType: track.source_type,
    sourceId: track.source_id,
    createdWith: track.created_with,
    allowDownload: track.allow_download === true,
    durationSeconds: track.duration_seconds,
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

const TABS = ["tracks", "playlists", "prompts", "favorites", "likes"] as const;
const TRACK_VISIBILITY_FILTERS = ["all", "public", "private"] as const;

function LibraryPage() {
  const { t, language } = useI18n();
  const { user, profile, loading } = useAuth();
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const [tab, setTab] = useState<(typeof TABS)[number]>("tracks");
  const [trackVisibility, setTrackVisibility] = useState<(typeof TRACK_VISIBILITY_FILTERS)[number]>("all");
  const [promptView, setPromptView] = useState<"all" | "projects">("all");
  const [promptSearch, setPromptSearch] = useState("");
  const handle = profile?.handle ? `@${profile.handle}` : t("nav.you");

  const mine = useQuery({ queryKey: ["library", "mine", user?.id], queryFn: () => listMyTracks(), enabled: Boolean(user) });
  const prompts = useQuery({ queryKey: ["library", "prompts", user?.id], queryFn: () => listSavedPrompts(), enabled: Boolean(user) });
  const projects = useQuery({ queryKey: ["library", "prompt-projects", user?.id], queryFn: () => listPromptProjects(), enabled: Boolean(user) });\n  const analyses = useQuery({ queryKey: ["library", "song-analyses", user?.id], queryFn: () => listSongAnalyses(), enabled: Boolean(user) });
  const liked = useQuery({ queryKey: ["library", "liked", user?.id], queryFn: () => listLikedTracks(), enabled: Boolean(user) });
  const favorites = useQuery({ queryKey: ["library", "favorites", user?.id], queryFn: () => listFavoriteTracks(), enabled: Boolean(user) });

  const myTracks = (mine.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const likedTracks = (liked.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const favoriteTracks = (favorites.data?.tracks ?? []).map((track: any) => toTrack(track as Row, handle));
  const publicTrackCount = myTracks.filter((track: Track) => track.isPublished).length;
  const privateTrackCount = myTracks.length - publicTrackCount;
  const filteredMyTracks = myTracks.filter((track: Track) => trackVisibility === "all" || (trackVisibility === "public" ? track.isPublished : !track.isPublished));

  const tabLabel = (value: (typeof TABS)[number]) => {
    if (value === "tracks") return t("library.myTracks");
    if (value === "playlists") return language === "el" ? "Λίστες αναπαραγωγής" : "Playlists";
    if (value === "prompts") return t("library.savedPrompts");
    if (value === "favorites") return language === "el" ? "Τα Αγαπημένα μου" : "My Favorites";
    return t("library.likedTracks");
  };
  const visibilityLabel = (value: (typeof TRACK_VISIBILITY_FILTERS)[number]) => value === "all" ? t("library.all") : value === "public" ? t("library.public") : t("library.private");

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

  const emptyMyTracks = trackVisibility === "all" ? t("library.noTracks") : t("library.noVisibilityTracks", { visibility: visibilityLabel(trackVisibility).toLowerCase() });

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">{t("library.title")}</h1>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all", tab === item ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon" : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent")}>{tabLabel(item)}</button>)}
        </div>

        {tab === "tracks" && (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {TRACK_VISIBILITY_FILTERS.map((filter) => {
                  const count = filter === "all" ? myTracks.length : filter === "public" ? publicTrackCount : privateTrackCount;
                  return <button key={filter} onClick={() => setTrackVisibility(filter)} aria-pressed={trackVisibility === filter} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs transition-all", trackVisibility === filter ? "border-accent/50 bg-accent/15 font-semibold text-accent" : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent")}>{visibilityLabel(filter)} ({count})</button>;
                })}
              </div>
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} className="shrink-0" />
            </div>
            <Section empty={emptyMyTracks} tracks={filteredMyTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, myTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "playlists" && user && <PlaylistLibraryPanel userId={user.id} />}

        {tab === "favorites" && (
          <>
            <div className="mt-3 flex justify-end"><TrackGridModeToggle mode={gridMode} onChange={setGridMode} /></div>
            <Section empty={language === "el" ? "Δεν έχεις ακόμη αποθηκεύσει τραγούδια στα Αγαπημένα σου." : "You have not saved any favorite tracks yet."} tracks={favoriteTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, favoriteTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "likes" && (
          <>
            <div className="mt-3 flex justify-end"><TrackGridModeToggle mode={gridMode} onChange={setGridMode} /></div>
            <Section empty={t("library.noLikes")} tracks={likedTracks} playing={playing} currentId={current?.id} onPlay={(track) => play(track, likedTracks)} gridMode={gridMode} />
          </>
        )}

        {tab === "prompts" && (
          <PromptProjectLibrary
            prompts={prompts.data?.prompts ?? []}
            projects={projects.data?.projects ?? []}
            analyses={analyses.data?.analyses ?? []}\n            loading={prompts.isLoading || projects.isLoading || analyses.isLoading}
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
  version_number: number | null; version_label: string | null; theme: string | null; genre: string | null;
  mood: string | null; language: string | null; tags: string | null; lyrics: string | null; note: string | null;
  created_at: string; updated_at: string;
};
type PromptProject = { id: string; name: string; created_at: string; updated_at: string };

function PromptProjectLibrary({ prompts, projects, analyses, loading, view, onViewChange, search, onSearchChange }: {
  prompts: SavedPrompt[]; projects: PromptProject[]; analyses: Array<{ id:string; project_id:string|null; name:string; model:string; summary:string }>; loading: boolean; view: "all" | "projects";
  onViewChange: (view: "all" | "projects") => void; search: string; onSearchChange: (value: string) => void;
}) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [promptDisplayMode, setPromptDisplayMode] = useState<"expanded" | "list">("list");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "";
  const matches = (p: SavedPrompt) => !q || [p.custom_name, p.title, projectName(p.project_id), p.theme, p.genre, p.mood, p.tags, p.lyrics, p.note].some((v) => v?.toLowerCase().includes(q));
  const filtered = prompts.filter(matches);
  const visibleProjects = projects.filter((project) => !q || project.name.toLowerCase().includes(q) || prompts.some((p) => p.project_id === project.id && matches(p)));
  const openProject = projects.find((project) => project.id === openProjectId) ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
    ]);
  };
  const createProject = async () => {
    const name = window.prompt(language === "el" ? "Όνομα project" : "Project name")?.trim();
    if (!name) return;
    setBusy(true); try { await createPromptProject({ data: { name } }); await refresh(); } finally { setBusy(false); }
  };
  const renameProject = async (project: PromptProject) => {
    const name = window.prompt(language === "el" ? "Νέο όνομα project" : "New project name", project.name)?.trim();
    if (!name || name === project.name) return;
    setBusy(true); try { await renamePromptProject({ data: { id: project.id, name } }); await refresh(); } finally { setBusy(false); }
  };
  const removeProject = async (project: PromptProject) => {
    if (!window.confirm(language === "el" ? "Να διαγραφεί το project; Τα prompts θα παραμείνουν στη βιβλιοθήκη χωρίς project." : "Delete this project? Its prompts will remain in your library with no project.")) return;
    setBusy(true); try { await deletePromptProject({ data: { id: project.id } }); await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
          {(["all", "projects"] as const).map((item) => <button key={item} onClick={() => onViewChange(item)} className={cn("rounded-lg px-4 py-2 text-xs font-semibold transition-colors", view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{item === "all" ? (language === "el" ? "Όλα τα Prompts" : "All Prompts") : (language === "el" ? "Projects" : "Projects")}</button>)}
        </div>
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={language === "el" ? "Αναζήτηση prompts, projects, style, mood, στίχων…" : "Search prompts, projects, style, mood, lyrics…"} className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/60" /></label>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={promptDisplayMode === "expanded"} onClick={() => setPromptDisplayMode("expanded")} className={cn("rounded-lg border p-2 text-xs", promptDisplayMode === "expanded" ? "border-accent/50 text-accent" : "border-white/10 text-muted-foreground")}>{language === "el" ? "Κάρτες" : "Cards"}</button>
          <button type="button" aria-pressed={promptDisplayMode === "list"} onClick={() => setPromptDisplayMode("list")} className={cn("rounded-lg border p-2 text-xs", promptDisplayMode === "list" ? "border-accent/50 text-accent" : "border-white/10 text-muted-foreground")}>{language === "el" ? "Λίστα" : "List"}</button>
        </div>
        <button disabled={busy} onClick={createProject} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-accent hover:bg-primary/15 disabled:opacity-50"><FolderPlus className="h-4 w-4" />{language === "el" ? "Νέο Project" : "New Project"}</button>
      </div>

      {view === "all" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((prompt) => <SavedPromptCard key={prompt.id} prompt={prompt} projects={projects} listMode={promptDisplayMode === "list"} />)}
          {!loading && filtered.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{q ? (language === "el" ? "Δεν βρέθηκαν prompts." : "No prompts found.") : t("library.noPrompts")}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {openProject ? (() => {
            const items = prompts.filter((p) => p.project_id === openProject.id && matches(p)).sort((a,b) => (a.version_number ?? 999999) - (b.version_number ?? 999999) || a.created_at.localeCompare(b.created_at));
            return <section className="space-y-4">
              <div className="glass rounded-2xl p-4">
                <button type="button" onClick={() => { setOpenProjectId(null); onSearchChange(""); }} className="mb-3 text-xs font-semibold text-accent">← Projects</button>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><Folder className="h-5 w-5 text-accent" /><h2 className="truncate font-display text-lg font-bold">{openProject.name}</h2></div><p className="mt-1 text-[11px] text-muted-foreground">{prompts.filter((p) => p.project_id === openProject.id).length} prompts</p></div>
                  <div className="flex gap-2"><button onClick={() => renameProject(openProject)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-4 w-4" /></button><button onClick={() => removeProject(openProject)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map((prompt) => <SavedPromptCard key={prompt.id} prompt={prompt} projects={projects} listMode={promptDisplayMode === "list"} />)}{items.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν prompts σε αυτό το project." : "No prompts in this project."}</p>}</div>
            </section>;
          })() : <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => {
                const count = prompts.filter((p) => p.project_id === project.id).length + analyses.filter((a) => a.project_id === project.id).length;
                return <article key={project.id} className="glass flex items-center gap-3 rounded-2xl p-4">
                  <button type="button" onClick={() => { setOpenProjectId(project.id); onSearchChange(""); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10"><Folder className="h-5 w-5 text-accent" /></span><span className="min-w-0"><span className="block truncate font-display font-bold">{project.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{count} prompts</span></span></button>
                  <div className="flex shrink-0 gap-1"><button onClick={() => renameProject(project)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-4 w-4" /></button><button onClick={() => removeProject(project)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
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

function SavedPromptCard({ prompt, projects, compact = false, listMode = false }: { prompt: SavedPrompt; projects: PromptProject[]; compact?: boolean; listMode?: boolean }) {
  const { t, language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const project = projects.find((p) => p.id === prompt.project_id);

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
  const move = async (projectId: string) => {
    const next = projectId || null;
    let version = prompt.version_number;
    if (next && next !== prompt.project_id) {
      const siblings = (await listSavedPrompts()).prompts.filter((p) => p.project_id === next);
      version = Math.max(0, ...siblings.map((p) => p.version_number ?? 0)) + 1;
    }
    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next, version_number: next ? version : null } }); await refresh();
  };

  return (
    <article className={cn("rounded-2xl border border-white/10 bg-black/20", compact ? "p-3" : "glass p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-display text-sm font-bold">{prompt.custom_name || prompt.title || prompt.theme || t("library.untitledPrompt")}</h3>{prompt.project_id && prompt.version_number && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-accent">V{prompt.version_number}{prompt.version_label ? ` · ${prompt.version_label}` : ""}</span>}</div>
          <p className="truncate text-[11px] text-muted-foreground">{[project?.name, prompt.genre, prompt.mood].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 gap-1"><button onClick={rename} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))} aria-label={t("library.copyPrompt")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent">{copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}</button><button onClick={remove} disabled={deleting} aria-label={t("library.deletePrompt")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive">{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div>
      </div>
      {listMode && <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />{expanded ? (language === "el" ? "Απόκρυψη" : "Hide") : (language === "el" ? "Προβολή prompt" : "Show prompt")}</button>}
      {(!listMode || expanded) && <div className="mt-3 flex items-center gap-2"><select value={prompt.project_id ?? ""} onChange={(e) => move(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"><option value="">{language === "el" ? "Χωρίς Project" : "No Project"}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{prompt.project_id && <button title={language === "el" ? "Αφαίρεση από project" : "Remove from project"} onClick={() => move("")} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent"><FolderX className="h-4 w-4" /></button>}</div>}
      {(!listMode || expanded) && !compact && prompt.tags && <pre className="mt-3 max-h-20 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">{prompt.tags}</pre>}
      {(!listMode || expanded) && !compact && prompt.lyrics && <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">{prompt.lyrics}</pre>}
    </article>
  );
}
