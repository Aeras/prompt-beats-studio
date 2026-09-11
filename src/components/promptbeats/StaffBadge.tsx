import { ShieldCheck, Sparkles } from "lucide-react";

export function StaffBadge({ badge }: { badge: string | null | undefined }) {
  if (!badge) return null;
  const isTeam = badge === "PromptBeats Team";
  return <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary" aria-label={badge}>
    {isTeam ? <Sparkles className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
    {badge}
  </span>;
}
