import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Compass,
  ExternalLink,
  Flame,
  Home,
  Library,
  Lightbulb,
  LogIn,
  LogOut,
  MapPinned,
  Music2,
  Orbit,
  Plus,
  Sparkles,
  ScanSearch,
  Settings,
  TextSearch,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModeration } from "@/hooks/useModeration";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/locales/en";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo.png.asset.json";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { SettingsPanel } from "@/components/promptbeats/SettingsPanel";
import { LanguageSelector } from "@/components/promptbeats/LanguageSelector";
import type { PrimaryDomain } from "@/lib/primary-navigation";

export const NAV = [
  { id: "home", labelKey: "nav.home", icon: Home },
  { id: "studio", labelKey: "nav.create", icon: Sparkles },
  { id: "discover", labelKey: "nav.discover", icon: Compass },
  { id: "library", labelKey: "nav.library", icon: Library },
  { id: "trending", labelKey: "nav.trending", icon: Flame },
  { id: "songAnalyzer", labelKey: null, icon: ScanSearch },
  { id: "lyricsReview", labelKey: null, icon: TextSearch },
  { id: "inspirationWall", labelKey: null, icon: Lightbulb },
  { id: "storyMap", labelKey: null, icon: MapPinned },
  { id: "songUniverse", labelKey: null, icon: Orbit },
  { id: "management", labelKey: "nav.management", icon: BarChart3 },
] as const satisfies ReadonlyArray<{
  id: string;
  labelKey: TranslationKey | null;
  icon: typeof Compass;
}>;

export type NavId = (typeof NAV)[number]["id"];
const STAFF_ONLY: NavId[] = ["management"];
const PRIMARY_NAV_IDS: NavId[] = ["home", "studio", "discover", "library"];
const CREATE_TOOL_NAV_IDS: NavId[] = [
  "songAnalyzer",
  "lyricsReview",
  "inspirationWall",
  "storyMap",
  "songUniverse",
];
const PRIMARY_NAV_DOMAINS: Partial<Record<NavId, PrimaryDomain>> = {
  home: "home",
  studio: "create",
  discover: "discover",
  library: "library",
};
const NAV_TO: Record<NavId, string> = {
  home: "/",
  discover: "/discover",
  trending: "/trending",
  studio: "/create",
  songAnalyzer: "/song-analyzer",
  lyricsReview: "/lyrics-review",
  inspirationWall: "/inspiration-wall",
  storyMap: "/story-map",
  songUniverse: "/song-universe",
  library: "/library",
  management: "/management",
};

const MUSIC_CREATION_PLATFORMS = [
  {
    name: "Suno",
    url: "https://suno.com/",
    descriptionEl: "Prompt, στίχοι και δομή για δημιουργία πλήρους τραγουδιού.",
    descriptionEn: "Use prompts, lyrics, and song structure to create a full track.",
  },
  {
    name: "Udio",
    url: "https://www.udio.com/",
    descriptionEl: "Prompt και custom στίχοι για δημιουργία και επεξεργασία τραγουδιού.",
    descriptionEn: "Use prompts and custom lyrics to create and edit a song.",
  },
  {
    name: "TopMediai",
    url: "https://www.topmediai.com/app/ai-music/",
    descriptionEl: "Στίχοι, style, mood και μουσικές οδηγίες για πλήρες τραγούδι.",
    descriptionEn: "Use lyrics, style, mood, and musical direction for a full song.",
  },
  {
    name: "Eleven Music",
    url: "https://elevenlabs.io/music",
    descriptionEl: "Prompt, στίχοι, όργανα και δομή για δημιουργία ολοκληρωμένου audio.",
    descriptionEn: "Use prompts, lyrics, instruments, and structure to create complete audio.",
  },
  {
    name: "Mureka",
    url: "https://www.mureka.ai/",
    descriptionEl: "Custom στίχοι και style με δομή Verse, Chorus και Bridge.",
    descriptionEn: "Use custom lyrics and style with Verse, Chorus, and Bridge structure.",
  },
  {
    name: "Producer.ai",
    url: "https://www.producer.ai/",
    descriptionEl: "Sound direction και στίχοι για δημιουργία full-length τραγουδιών.",
    descriptionEn: "Use sound direction and lyrics to create full-length songs.",
  },
] as const;

export function SidebarNav({
  active,
  primaryDomain,
  onNavigate,
  onSubmit,
}: {
  active: NavId;
  primaryDomain: PrimaryDomain | null;
  onNavigate: () => void;
  onSubmit: () => void;
}) {
  const { user, profile } = useAuth();
  const { isBanned, canViewUsers } = useModeration();
  const analyzerAccess = useFeatureAccess("song_analyzer");
  const lyricsReviewAccess = useFeatureAccess("lyrics_review");
  const inspirationWallAccess = useFeatureAccess("inspiration_wall");
  const storyMapAccess = useFeatureAccess("story_map");
  const songUniverseAccess = useFeatureAccess("song_universe");
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [externalPlatformsOpen, setExternalPlatformsOpen] = useState(false);
  const isVisible = (item: (typeof NAV)[number]) =>
    (item.id !== "songAnalyzer" || analyzerAccess.allowed) &&
    (item.id !== "lyricsReview" || lyricsReviewAccess.allowed) &&
    (item.id !== "inspirationWall" || inspirationWallAccess.allowed) &&
    (item.id !== "storyMap" || storyMapAccess.allowed) &&
    (item.id !== "songUniverse" || songUniverseAccess.allowed) &&
    (!STAFF_ONLY.includes(item.id) || canViewUsers);
  const renderNavItem = (item: (typeof NAV)[number], primary = false) => {
    const isActive = primary ? primaryDomain === PRIMARY_NAV_DOMAINS[item.id] : active === item.id;
    const fallbackLabel =
      item.id === "songAnalyzer"
        ? "AI Song Analyzer"
        : item.id === "lyricsReview"
          ? "Lyrics Review"
          : item.id === "inspirationWall"
            ? "Inspiration Wall"
            : item.id === "storyMap"
              ? "Story Map"
              : item.id === "songUniverse"
                ? "Song Universes"
                : item.id;
    return (
      <Link
        key={item.id}
        to={NAV_TO[item.id]}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
          isActive
            ? "glass text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        )}
      >
        <item.icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-all",
            isActive ? "text-primary drop-shadow-[0_0_8px_var(--neon)]" : "group-hover:text-accent",
          )}
        />
        <span className="truncate">{item.labelKey ? t(item.labelKey) : fallbackLabel}</span>
        {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent glow-electric" />}
      </Link>
    );
  };
  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5 pb-28">
      <div className="flex items-center gap-3">
        <img
          src={logoAsset.url}
          alt="PromptBeats logo"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl glow-neon"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tight">PromptBeats</p>
          <p className="truncate text-[11px] text-muted-foreground">promptbeats.app</p>
        </div>
      </div>

      {externalPlatformsOpen ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setExternalPlatformsOpen(false)}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {language === "el" ? "Επιστροφή" : "Back"}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-accent" />
              <h2 className="font-display text-base font-bold text-foreground">
                {language === "el" ? "Πλατφόρμες δημιουργίας μουσικής" : "Music creation platforms"}
              </h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {language === "el"
                ? "Το PromptBeats σας βοηθά να αναπτύξετε την ιδέα, τους στίχους, τη δομή και το prompt του τραγουδιού σας. Για τη δημιουργία του τελικού audio μπορείτε να συνεχίσετε σε μία εξωτερική πλατφόρμα μουσικής."
                : "PromptBeats helps you develop your song idea, lyrics, structure, and prompt. To create the final audio, you can continue on an external music platform."}
            </p>
          </div>

          <div className="space-y-2">
            {MUSIC_CREATION_PLATFORMS.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setExternalPlatformsOpen(false);
                  onNavigate();
                }}
                className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:border-accent/35 hover:bg-accent/[0.05]"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/[0.07] text-xs font-bold text-accent">
                  {platform.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{platform.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {language === "el" ? platform.descriptionEl : platform.descriptionEn}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <>
          <nav className="flex flex-col gap-1">
            {NAV.filter((item) => PRIMARY_NAV_IDS.includes(item.id) && isVisible(item)).map(
              (item) => renderNavItem(item, true),
            )}
          </nav>

          <div className="space-y-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("nav.discover")}
            </p>
            <nav className="flex flex-col gap-1">
              {NAV.filter((item) => item.id === "trending" && isVisible(item)).map((item) =>
                renderNavItem(item),
              )}
            </nav>
          </div>

          <div className="space-y-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("nav.createTools")}
            </p>
            <nav className="flex flex-col gap-1">
              {NAV.filter((item) => CREATE_TOOL_NAV_IDS.includes(item.id) && isVisible(item)).map(
                (item) => renderNavItem(item),
              )}
            </nav>
          </div>

          {NAV.filter((item) => STAFF_ONLY.includes(item.id) && isVisible(item)).map((item) =>
            renderNavItem(item),
          )}

          {!isBanned && (
            <button
              onClick={onSubmit}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              {t("nav.submitTrack")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setExternalPlatformsOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-accent/35 hover:bg-accent/[0.05] hover:text-foreground"
          >
            <Music2 className="h-[18px] w-[18px] shrink-0 text-accent" />
            <span className="min-w-0 flex-1 leading-snug">
              {language === "el" ? "Πλατφόρμες δημιουργίας μουσικής" : "Music creation platforms"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
        </>
      )}

      <div className="mt-auto">
        {user ? (
          <div className="glass flex items-center gap-3 rounded-2xl p-3">
            <img
              src={getUserAvatarUrl(profile?.avatar_url)}
              alt={t("onboarding.avatarPreview")}
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-full ring-2 ring-primary/60"
            />
            <div className="min-w-0 flex-1">
              {profile?.handle ? (
                <Link
                  to="/$handle"
                  params={{ handle: `@${profile.handle}` }}
                  className="truncate text-sm font-medium hover:text-accent"
                >
                  @{profile.handle}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">{t("nav.you")}</p>
              )}
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t("nav.signedIn")}
              </p>
            </div>
            <button
              type="button"
              aria-label={language === "el" ? "Ρυθμίσεις" : "Settings"}
              title={language === "el" ? "Ρυθμίσεις" : "Settings"}
              onClick={() => setSettingsOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/5 hover:text-accent"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              aria-label={t("nav.signOut")}
              onClick={signOut}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Link to="/auth" className="glass flex items-center gap-3 rounded-2xl p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10">
                <LogIn className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t("nav.signIn")}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t("nav.signInHint")}</p>
              </div>
            </Link>
            <div className="flex justify-start px-1">
              <LanguageSelector compact />
            </div>
          </div>
        )}
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
