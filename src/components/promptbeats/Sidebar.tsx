import { Compass, Flame, Sparkles, Library, Plus, LogIn, LogOut } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModeration } from "@/hooks/useModeration";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo.png.asset.json";

export const NAV = [
  { id: "discover", label: "Discover Feed", icon: Compass },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "studio", label: "AI Prompt Studio", icon: Sparkles },
  { id: "library", label: "My Library", icon: Library },
] as const;

export type NavId = (typeof NAV)[number]["id"];

const NAV_TO: Record<NavId, string> = {
  discover: "/",
  trending: "/trending",
  studio: "/generate",
  library: "/library",
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
  const { isBanned } = useModeration();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        {NAV.map((item) => {
          const isActive = active === item.id;
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
              <span className="truncate">{item.label}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent glow-electric" />}
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
        Submit Track
      </button>
      )}

      <div className="mt-auto">
        {user ? (
          <div className="glass flex items-center gap-3 rounded-2xl p-3">
            <img
              src={profile?.avatar_url ?? `https://i.pravatar.cc/80?u=${user.id}`}
              alt="Your profile avatar"
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-full ring-2 ring-primary/60"
            />
            <div className="min-w-0 flex-1">
              {profile?.handle ? (
                <Link
                  to="/u/$handle"
                  params={{ handle: profile.handle }}
                  className="truncate text-sm font-medium hover:text-accent"
                >
                  @{profile.handle}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">@you</p>
              )}
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Signed in
              </p>
            </div>
            <button
              aria-label="Sign out"
              onClick={signOut}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
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
              <p className="truncate text-sm font-medium">Sign in</p>
              <p className="truncate text-[11px] text-muted-foreground">Upload tracks &amp; save prompts</p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
