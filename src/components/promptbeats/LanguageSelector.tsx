import { Languages } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function LanguageSelector({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const { user } = useAuth();

  // Signed-in users manage their persistent language preference in Edit Profile.
  // Compact selectors are kept only for guests on standalone pages.
  if (user && compact) return null;

  return (
    <div className={cn(compact ? "inline-flex items-center gap-2" : "rounded-2xl border border-white/10 bg-black/20 p-3", className)}>
      {compact && <Languages className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {!compact && <label className="text-[11px] uppercase tracking-widest text-muted-foreground" htmlFor="pb-interface-language">{t("language.label")}</label>}
      <select
        id={compact ? undefined : "pb-interface-language"}
        aria-label={t("language.label")}
        value={language}
        onChange={(event) => setLanguage(event.target.value === "el" ? "el" : "en")}
        className={compact ? "h-9 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-foreground outline-none focus:border-accent/60" : "mt-2 h-9 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground outline-none focus:border-accent/60"}
      >
        <option value="en" className="bg-[#0a0a0c]">{t("language.english")}</option>
        <option value="el" className="bg-[#0a0a0c]">{t("language.greek")}</option>
      </select>
    </div>
  );
}
