import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { BulkDeletePromptProjectsDialog } from "@/components/promptbeats/BulkDeletePromptProjectsDialog";
import {
  bulkDeletePromptProjects,
  type BulkDeletePromptProjectPlan,
} from "@/lib/project-bulk-delete.functions";
import {
  clearAllVisibleProjectSelections,
  exitProjectBulkSelection,
  getProjectBulkSelectionSnapshot,
  selectAllVisibleProjects,
  subscribeProjectBulkSelection,
} from "@/lib/project-bulk-selection";
import { useI18n } from "@/i18n";

export function ProjectBulkSelectionController({ controllerId }: { controllerId: string }) {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(
    subscribeProjectBulkSelection,
    getProjectBulkSelectionSnapshot,
    getProjectBulkSelectionSnapshot,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (
    typeof document === "undefined" ||
    !snapshot.active ||
    snapshot.controllerId !== controllerId
  ) {
    return null;
  }

  const selectedSet = new Set(snapshot.selectedIds);
  const allSelected =
    snapshot.visibleProjects.length > 0 &&
    snapshot.visibleProjects.every((project) => selectedSet.has(project.id));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-picker"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["library", "folder-breadcrumbs"], exact: false }),
      queryClient.invalidateQueries({ queryKey: ["song-universe"], exact: false }),
    ]);

  const confirm = async (plans: BulkDeletePromptProjectPlan[]) => {
    if (busy || plans.length === 0) return;
    setBusy(true);
    try {
      await bulkDeletePromptProjects({ data: { plans } });
      setReviewOpen(false);
      exitProjectBulkSelection();
      await refresh();
    } catch (error) {
      await refresh();
      window.alert(
        error instanceof Error
          ? error.message
          : language === "el"
            ? "Η μαζική διαγραφή απέτυχε. Δεν έγινε μερική διαγραφή."
            : "Bulk deletion failed. No partial deletion was performed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-x-3 bottom-[108px] z-[105] mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-background/95 p-3 shadow-2xl backdrop-blur-xl md:bottom-6">
        <div className="mr-auto min-w-0">
          <div className="text-sm font-semibold">
            {language === "el" ? "Επιλογή Projects" : "Select Projects"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {language === "el"
              ? `Επιλεγμένα: ${snapshot.selectedIds.length}`
              : `Selected: ${snapshot.selectedIds.length}`}
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => {
              if (event.target.checked) selectAllVisibleProjects();
              else clearAllVisibleProjectSelections();
            }}
            className="h-4 w-4"
          />
          {language === "el" ? "Επιλογή όλων" : "Select all"}
        </label>

        <button
          type="button"
          disabled={snapshot.selectedIds.length === 0 || busy}
          onClick={() => setReviewOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {language === "el"
            ? `Διαγραφή (${snapshot.selectedIds.length})`
            : `Delete (${snapshot.selectedIds.length})`}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setReviewOpen(false);
            exitProjectBulkSelection();
          }}
          aria-label={language === "el" ? "Ακύρωση επιλογής" : "Cancel selection"}
          title={language === "el" ? "Ακύρωση" : "Cancel"}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <BulkDeletePromptProjectsDialog
        open={reviewOpen}
        language={language}
        projectIds={snapshot.selectedIds}
        busy={busy}
        onClose={() => !busy && setReviewOpen(false)}
        onConfirm={confirm}
      />
    </>,
    document.body,
  );
}
