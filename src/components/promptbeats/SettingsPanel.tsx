import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { LanguageSelector } from "@/components/promptbeats/LanguageSelector";
import { TrackSourceFilter, useTrackSourcePreference } from "@/components/promptbeats/TrackSourceFilter";
import { useExternalMediaConsent } from "@/lib/external-media-consent";
import { useI18n } from "@/i18n";

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const external = useExternalMediaConsent();
  const source = useTrackSourcePreference();
  const el = language === "el";

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={el ? "Ρυθμίσεις" : "Settings"} onClick={onClose}>
      <div className="glass-strong max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0f] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b0b0f]/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            <div>
              <h2 className="font-display text-lg font-bold">{el ? "Ρυθμίσεις" : "Settings"}</h2>
              <p className="text-[11px] text-muted-foreground">{el ? "Προτιμήσεις εφαρμογής και περιεχομένου" : "App and content preferences"}</p>
            </div>
          </div>
          <button type="button" aria-label={el ? "Κλείσιμο" : "Close"} onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-accent/40 hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <h3 className="text-sm font-semibold">{el ? "Γλώσσα εφαρμογής" : "App language"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{el ? "Η επιλογή αποθηκεύεται στον λογαριασμό σας." : "Your choice is saved to your account."}</p>
            <LanguageSelector className="mt-3 border-white/10 bg-black/20" />
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">{el ? "Εξωτερικά μέσα" : "External media"}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {el
                    ? "Να επιτρέπεται η φόρτωση embedded players από υπηρεσίες τρίτων, όπως Suno και Udio."
                    : "Allow embedded players from third-party services such as Suno and Udio to load."}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">{el ? "Η άδεια ισχύει μόνο σε αυτόν τον browser/συσκευή." : "This permission applies only to this browser/device."}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={external.enabled}
                onClick={() => external.setEnabled(!external.enabled)}
                className={"relative mt-1 h-7 w-12 shrink-0 rounded-full border transition-colors " + (external.enabled ? "border-accent/60 bg-accent/35" : "border-white/15 bg-white/5")}
              >
                <span className={"absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform " + (external.enabled ? "translate-x-5" : "translate-x-0")} />
              </button>
            </div>
            <p className={"mt-3 text-xs font-semibold " + (external.enabled ? "text-accent" : "text-muted-foreground")}>
              {external.enabled ? (el ? "Επιτρέπονται" : "Allowed") : (el ? "Μπλοκαρισμένα" : "Blocked")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <h3 className="text-sm font-semibold">{el ? "Προτιμήσεις περιεχομένου" : "Content preferences"}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {el
                ? "Επιλέξτε ποια πηγή τραγουδιών θα εμφανίζεται από προεπιλογή στις λίστες. Τα φίλτρα κάθε σελίδας είναι προσωρινά."
                : "Choose which track source is shown by default in lists. Page-level filters are temporary."}
            </p>
            <TrackSourceFilter value={source.preference} onChange={(value) => void source.setPreference(value)} language={language} className="mt-4" />
            <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <p><strong className="text-foreground">{el ? "Όλα:" : "All:"}</strong> {el ? "uploads και εξωτερικές πηγές." : "uploads and external sources."}</p>
              <p><strong className="text-foreground">Uploads:</strong> {el ? "μόνο αρχεία που έχουν ανέβει στο PromptBeats." : "only files uploaded to PromptBeats."}</p>
              <p><strong className="text-foreground">External:</strong> {el ? "μόνο τραγούδια από εξωτερικές πηγές." : "only tracks from external providers."}</p>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
