import { Compass, Flame, Sparkles, Library, Plus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { id: "discover", label: "Discover Feed", icon: Compass },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "studio", label: "AI Prompt Studio", icon: Sparkles },
  { id: "library", label: "My Library", icon: Library },
] as const;

export type NavId = (typeof NAV)[number]["id"];

export function SidebarNav({
  active,
  onSelect,
  onSubmit,
}: {
  active: NavId;
  onSelect: (id: NavId) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-neon glow-neon">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tight">PromptBeats</p>
          <p className="truncate text-[11px] text-muted-foreground">promptbeats.app</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
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
            </button>
          );
        })}
      </nav>

      <button
        onClick={onSubmit}
        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.02] active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Submit Track
      </button>

      <div className="mt-auto">
        <div className="glass flex items-center gap-3 rounded-2xl p-3">
          <img
            src="https://i.pravatar.cc/80?img=15"
            alt="Your profile avatar"
            width={40}
            height={40}
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-full ring-2 ring-primary/60"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">@nikos.k</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Signed in · Pro
            </p>
          </div>
          <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
