import { useState } from "react";
import { createPortal } from "react-dom";
import { Flag, Loader2, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { REPORT_CATEGORIES, submitTrackReport, type ReportCategory } from "@/lib/content-reports.functions";
import { cn } from "@/lib/utils";

export function ReportTrackControl({
  trackId,
  ownerId,
  isPublished,
  compact = false,
  iconOnly = true,
}: {
  trackId: string;
  ownerId: string;
  isPublished: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("copyright_ip");
  const [details, setDetails] = useState("");
  const [supportingUrl, setSupportingUrl] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.id === ownerId || !isPublished) return null;

  const close = () => {
    setOpen(false);
    setConfirming(false);
    setSuccess(false);
    setBusy(false);
    setError(null);
    setCategory("copyright_ip");
    setDetails("");
    setSupportingUrl("");
  };

  const validate = () => {
    if (category === "other" && details.trim().length < 5) {
      setError(t("report.detailsRequired"));
      return false;
    }
    if (supportingUrl.trim()) {
      try {
        const url = new URL(supportingUrl.trim());
        if (!["http:","https:"].includes(url.protocol)) throw new Error();
      } catch {
        setError(t("report.invalidUrl"));
        return false;
      }
    }
    setError(null);
    return true;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitTrackReport({ data: {
        trackId,
        category,
        details: details.trim() || undefined,
        supportingUrl: supportingUrl.trim() || undefined,
      } });
      setConfirming(false);
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("duplicate active report")) setError(t("report.duplicate"));
      else if (message.includes("rate limit")) setError(t("report.rateLimit"));
      else setError(t("report.submitError"));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const legalCategory = category === "copyright_ip" || category === "illegal_content";

  const modal = open && typeof document !== "undefined" && createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="report-track-title">
      <div className="glass-strong max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 id="report-track-title" className="font-display text-lg font-bold">{success ? t("report.receivedTitle") : t("report.title")}</h2>
          <button type="button" onClick={close} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        {success ? (
          <div className="mt-5 space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{t("report.receivedBody")}</p>
            <button type="button" onClick={close} className="w-full rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground">{t("common.close")}</button>
          </div>
        ) : confirming ? (
          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <h3 className="font-semibold">{t("report.confirmTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("report.confirmBody")}</p>
            </div>
            {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground hover:text-foreground">{t("common.cancel")}</button>
              <button type="button" disabled={busy} onClick={() => void submit()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("report.submit")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block text-xs text-muted-foreground">
              {t("report.reason")}
              <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm text-foreground">
                {REPORT_CATEGORIES.map((key) => <option key={key} value={key}>{t(`report.category.${key}`)}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("report.details")}
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={5} placeholder={category === "other" ? t("report.detailsRequiredPlaceholder") : t("report.detailsPlaceholder")} className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-foreground outline-none focus:border-accent/50" />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("report.supportingUrl")}
              <input value={supportingUrl} onChange={(e) => setSupportingUrl(e.target.value)} maxLength={1000} type="url" placeholder="https://" className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-foreground outline-none focus:border-accent/50" />
            </label>
            {legalCategory && <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100">{t("report.legalNotice")}</p>}
            {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
            <button type="button" onClick={() => { if (validate()) setConfirming(true); }} className="w-full rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground">{t("report.continue")}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );

  const label = t("report.action");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-amber-300/40 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
          compact ? "h-7 w-7" : iconOnly ? "h-8 w-8" : "h-9 gap-2 px-3 text-xs",
        )}
      >
        <Flag className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {!iconOnly && <span>{label}</span>}
      </button>
      {modal}
    </>
  );
}
