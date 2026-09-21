import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Flag, Loader2, MessageSquareWarning, UserCheck, X } from "lucide-react";
import { toast } from "sonner";

import { ModerationCaseThread } from "@/components/promptbeats/ModerationCaseThread";
import { TrackModerationControls } from "@/components/promptbeats/TrackModerationControls";
import {
  type ContentReport,
  type ReportScope,
  type ReportStatus,
} from "@/lib/content-reports.functions";
import {
  getContentReportClient,
  listContentReportsClient,
} from "@/lib/content-reports.client";
import { takeModerationCase } from "@/lib/moderation-cases.functions";
import { useI18n, type AppTranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";

const scopes: ReportScope[] = ["open","under_review","resolved","all"];

function reportCategoryKey(category: ContentReport["category"]) {
  return `report.category.${category}` as AppTranslationKey;
}
function reportStatusKey(status: ReportStatus) {
  return `management.reportStatus.${status}` as AppTranslationKey;
}

function ReportDetail({
  reportId,
  isAdmin,
  onClose,
}: {
  reportId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const el = language === "el";
  const qc = useQueryClient();
  const { data: report, isLoading, isError } = useQuery({
    queryKey: ["content-report", reportId],
    queryFn: () => getContentReportClient(reportId),
  });

  const take = useMutation({
    mutationFn: () => takeModerationCase({ data: { reportId } }),
    onSuccess: async () => {
      toast.success(el ? "Η υπόθεση αναλήφθηκε." : "Case assigned to you.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["content-report", reportId] }),
        qc.invalidateQueries({ queryKey: ["content-reports"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : (el ? "Δεν ήταν δυνατή η ανάληψη της υπόθεσης." : "Could not take case.")),
  });

  const content = (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="report-detail-title" className="glass-strong max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="report-detail-title" className="font-display text-lg font-bold">{report?.case_id ? (el ? "Υπόθεση Moderation" : "Moderation Case") : t("management.reportDetails")}</h2>
            {report && <p className="mt-1 text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString(el ? "el-GR" : "en-US")}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        {isLoading && <p className="mt-5 text-sm text-muted-foreground">{t("management.reportsLoading")}</p>}
        {isError && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{t("management.reportsError")}</p>}

        {report && <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("management.reportTrack")}</p>
              <p className="mt-1 text-sm font-medium">{report.track_title}</p>
              <Link to="/track/$id" params={{ id: report.target_id }} target="_blank" className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"><ExternalLink className="h-3.5 w-3.5" />{t("management.reportOpenTrack")}</Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("management.reportCreator")}</p>
              <p className="mt-1 text-sm">{report.creator_artist_alias || report.creator_display_name || (report.creator_handle ? `@${report.creator_handle}` : report.target_owner_id || "—")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{report.track_moderation_status}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-semibold">{t(reportCategoryKey(report.category))}</p>
            {report.details && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{report.details}</p>}
            {report.supporting_url && <a href={report.supporting_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 break-all text-xs text-accent hover:underline"><ExternalLink className="h-3.5 w-3.5" />{t("management.reportSupportingUrl")}</a>}
          </div>

          {isAdmin ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("management.reportReporter")}</p>
              <p className="mt-1 text-sm">{report.reporter_display_name || (report.reporter_handle ? `@${report.reporter_handle}` : report.reporter_email || report.reporter_user_id || "—")}</p>
              {report.reporter_email && <p className="mt-1 text-xs text-muted-foreground">{report.reporter_email}</p>}
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-muted-foreground">{t("management.reportNoReporterIdentity")}</p>
          )}

          <TrackModerationControls trackId={report.target_id} />

          {!report.case_id && report.status !== "resolved_action_taken" && report.status !== "resolved_no_violation" && report.status !== "dismissed_abuse" && <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{el ? "Η αναφορά δεν έχει ακόμη αναληφθεί." : "This report has not been taken yet."}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{el ? "Με την ανάληψη δημιουργείται η πραγματική υπόθεση, καταγράφεται ο χειριστής και ξεκινά το case-based ιστορικό επικοινωνίας." : "Taking the report creates the moderation case, records its handler, and starts the case-based communication history."}</p>
                <button type="button" disabled={take.isPending} onClick={() => take.mutate()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {take.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  {el ? "Ανάληψη Υπόθεσης" : "Take Case"}
                </button>
              </div>
            </div>
          </div>}

          {report.case_id && <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><MessageSquareWarning className="h-4 w-4 text-accent" /><p className="text-sm font-semibold">{el ? "Case workspace" : "Case workspace"}</p></div>
              <p className="text-xs text-muted-foreground">{el ? "Ανατέθηκε σε:" : "Assigned to:"} {report.case_assigned_label || "—"}</p>
            </div>
            <ModerationCaseThread caseId={report.case_id} staffView onChanged={() => {
              void qc.invalidateQueries({ queryKey: ["content-report", reportId] });
              void qc.invalidateQueries({ queryKey: ["content-reports"] });
            }} />
          </div>}

          {!report.case_id && (report.status === "resolved_action_taken" || report.status === "resolved_no_violation" || report.status === "dismissed_abuse") && <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-semibold">{el ? "Legacy ολοκληρωμένη αναφορά" : "Legacy resolved report"}</p>
            <p className="mt-2 text-xs text-muted-foreground">{el ? "Η αναφορά ολοκληρώθηκε πριν ενεργοποιηθεί το σύστημα Moderation Cases." : "This report was resolved before Moderation Cases was enabled."}</p>
            {report.resolution && <p className="mt-3 whitespace-pre-wrap text-sm">{report.resolution}</p>}
          </div>}
        </div>}
      </div>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function ReportsManagementPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t, language } = useI18n();
  const el = language === "el";
  const [scope, setScope] = useState<ReportScope>("open");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["content-reports", scope],
    queryFn: () => listContentReportsClient(scope),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const scopeLabel = (value: ReportScope) =>
    value === "open" ? t("management.reportOpen") :
    value === "under_review" ? t("management.reportUnderReview") :
    value === "resolved" ? t("management.reportResolved") :
    t("management.reportAll");

  return <div className="space-y-4">
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{t("management.reports")}</p></div>
      <p className="mt-1 text-xs text-muted-foreground">{t("management.reportsSubtitle")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {scopes.map((value) => <button key={value} type="button" onClick={() => setScope(value)} className={cn("rounded-full border px-3 py-1.5 text-xs", scope === value ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:text-foreground")}>{scopeLabel(value)}</button>)}
      </div>
    </div>

    {isLoading && <p className="text-sm text-muted-foreground">{t("management.reportsLoading")}</p>}
    {isError && <p className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.reportsError")}</p>}
    {!isLoading && !isError && data.length === 0 && <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">{t("management.reportsNone")}</p>}

    {data.length > 0 && <div className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t("management.reportDate")}</th>
              <th className="px-4 py-3 font-medium">{t("management.reportTrack")}</th>
              <th className="px-4 py-3 font-medium">{t("management.reportCreator")}</th>
              <th className="px-4 py-3 font-medium">{t("management.reportReason")}</th>
              <th className="px-4 py-3 font-medium">{el ? "Υπόθεση" : "Case"}</th>
              {isAdmin && <th className="px-4 py-3 font-medium">{t("management.reportReporter")}</th>}
              <th className="px-4 py-3 font-medium">{t("management.reportAction")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((report) => <tr key={report.id} className="border-t border-white/5 align-top">
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString(el ? "el-GR" : "en-US")}</td>
              <td className="max-w-52 px-4 py-3"><span className="block truncate font-medium">{report.track_title}</span></td>
              <td className="max-w-48 px-4 py-3 text-xs text-muted-foreground"><span className="block truncate">{report.creator_artist_alias || report.creator_display_name || (report.creator_handle ? `@${report.creator_handle}` : "—")}</span></td>
              <td className="max-w-56 px-4 py-3 text-xs">{t(reportCategoryKey(report.category))}</td>
              <td className="max-w-52 px-4 py-3 text-xs">
                {report.case_id ? <span className="block">
                  <span className="font-medium text-foreground">{report.case_status?.replaceAll("_"," ")}</span>
                  <span className="mt-1 block truncate text-muted-foreground">{report.case_assigned_label || (el ? "Χωρίς ανάθεση" : "Unassigned")}</span>
                  {(report.case_unread_count ?? 0) > 0 && <span className="mt-1 inline-flex rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black">{report.case_unread_count} {el ? "νέα" : "new"}</span>}
                </span> : <span className="text-muted-foreground">{t(reportStatusKey(report.status))}</span>}
              </td>
              {isAdmin && <td className="max-w-52 px-4 py-3 text-xs text-muted-foreground"><span className="block truncate">{report.reporter_display_name || (report.reporter_handle ? `@${report.reporter_handle}` : report.reporter_email || "—")}</span></td>}
              <td className="px-4 py-3"><button type="button" onClick={() => setSelectedReportId(report.id)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-accent hover:border-accent/40">{report.case_id ? (el ? "Άνοιγμα υπόθεσης" : "Open case") : t("management.reportDetails")}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {selectedReportId && <ReportDetail reportId={selectedReportId} isAdmin={isAdmin} onClose={() => setSelectedReportId(null)} />}
  </div>;
}
