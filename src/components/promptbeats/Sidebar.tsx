import { useState } from "react";
import {
  BarChart3,
  Compass,
  Flame,
  Library,
  Lightbulb,
  LogIn,
  LogOut,
  MapPinned,
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

export const NAV = [
  { id: "discover", labelKey: "nav.discover", icon: Compass },
  { id: "trending", labelKey: "nav.trending", icon: Flame },
  { id: "studio", labelKey: "nav.studio", icon: Sparkles },
  { id: "songAnalyzer", labelKey: null, icon: ScanSearch },
  { id: "lyricsReview", labelKey: null, icon: TextSearch },
  { id: "inspirationWall", labelKey: null, icon: Lightbulb },
  { id: "storyMap", labelKey: null, icon: MapPinned },
  { id: "songUniverse", labelKey: null, icon: Orbit },
  { id: "library", labelKey: "nav.library", icon: Library },
  { id: "management", labelKey: "nav.management", icon: BarChart3 },
] as const satisfies ReadonlyArray<{
  id: string;
  labelKey: TranslationKey | null;
  icon: typeof Compass;
}>;

export type NavId = (typeof NAV)[number]["id"];
const STAFF_ONLY: NavId[] = ["management"];
const NAV_TO: Record<NavId, string> = {
  discover: "/",
  trending: "/trending",
  studio: "/generate",
  songAnalyzer: "/song-analyzer",
  lyricsReview: "/lyrics-review",
  inspirationWall: "/inspiration-wall",
  storyMap: "/story-map",
  songUniverse: "/song-universe",
  library: "/library",
  management: "/management",
};

export function SidebarNav({
  active,
  onNavigate,
  onSubmit,
}: {
  active: NavId;
  onNavigate: () => void;
  onSubmit: () => void;
}) {
  const { user, profile } = useAuth();
  const { isBanned, canViewUsers } = useModeration();
  const generatorAccess = useFeatureAccess("ai_generator");
  const analyzerAccess = useFeatureAccess("song_analyzer");
  const lyricsReviewAccess = useFeatureAccess("lyrics_review");
  const inspirationWallAccess = useFeatureAccess("inspiration_wall");
  const storyMapAccess = useFeatureAccess("story_map");
  const songUniverseAccess = useFeatureAccess("song_universe");
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
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

      <nav className="flex flex-col gap-1">
        {NAV.filter(
          (item) =>
            (item.id !== "studio" || generatorAccess.allowed) &&
            (item.id !== "songAnalyzer" || analyzerAccess.allowed) &&
            (item.id !== "lyricsReview" || lyricsReviewAccess.allowed) &&
            (item.id !== "inspirationWall" || inspirationWallAccess.allowed) &&
            (item.id !== "storyMap" || storyMapAccess.allowed) &&
            (item.id !== "songUniverse" || songUniverseAccess.allowed) &&
            (!STAFF_ONLY.includes(item.id) || canViewUsers),
        ).map((item) => {
          const isActive = active === item.id;
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
                  isActive
                    ? "text-primary drop-shadow-[0_0_8px_var(--neon)]"
                    : "group-hover:text-accent",
                )}
              />
              <span className="truncate">{item.labelKey ? t(item.labelKey) : fallbackLabel}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent glow-electric" />
              )}
            </Link>
          );
        })}
      </nav>

      {!isBanned && (
        <button
          onClick={onSubmit}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Plus className="h-4 w-4" />
          {t("nav.submitTrack")}
        </button>
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
          <Link to="/auth" className="glass flex items-center gap-3 rounded-2xl p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10">
              <LogIn className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t("nav.signIn")}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t("nav.signInHint")}</p>
            </div>
          </Link>
        )}
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
