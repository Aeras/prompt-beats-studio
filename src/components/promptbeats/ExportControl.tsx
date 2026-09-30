import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, ListChecks, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectBulkSelectionController } from "@/components/promptbeats/ProjectBulkSelectionController";
import {
  buildProjectExportDocument,
  buildPromptExportDocument,
  type ExportFormat,
  type ProjectExportMode,
} from "@/lib/export-center.shared";
import { downloadExportDocument, downloadProjectSeparateExport } from "@/lib/export-center.browser";
import { getProjectExportSource, getPromptExportSource } from "@/lib/export-center.functions";
import {
  activateProjectBulkSelection,
  getProjectBulkSelectionSnapshot,
  registerBulkSelectableProject,
  subscribeProjectBulkSelection,
  toggleProjectBulkSelection,
} from "@/lib/project-bulk-selection";
import { useI18n } from "@/i18n";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAccountPreferences } from "@/lib/account-preferences";
import { cn } from "@/lib/utils";

const formats: Array<{ value: ExportFormat; label: string; extension: string }> = [
  { value: "txt", label: "TXT", extension: ".txt" },
  { value: "md", label: "Markdown", extension: ".md" },
  { value: "html", label: "HTML", extension: ".html" },
  { value: "json", label: "JSON", extension: ".json" },
];

export function ExportControl({
  kind,
  id,
  name,
  compact = false,
}: {
  kind: "prompt" | "project";
  id: string;
  name: string;
  compact?: boolean;
}) {
  const { language } = useI18n();
  const featureAccess = useFeatureAccess("export_center");
  const { preferences } = useAccountPreferences();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(preferences.exportFormat);
  const [mode, setMode] = useState<ProjectExportMode>("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkEligible, setBulkEligible] = useState(false);
  const controlRef = useRef<HTMLSpanElement | null>(null);
  const bulkSnapshot = useSyncExternalStore(
    subscribeProjectBulkSelection,
    getProjectBulkSelectionSnapshot,
    getProjectBulkSelectionSnapshot,
  );

  useEffect(() => {
    if (kind !== "project" || typeof window === "undefined") return;
    const element = controlRef.current;
    const eligible =
      window.location.pathname === "/library" && Boolean(element?.closest("article"));
    setBulkEligible(eligible);
    if (!eligible) return;
    return registerBulkSelectableProject({ id, name });
  }, [id, kind, name]);

  useEffect(() => {
    if (!open) {
      setError("");
      setBusy(false);
      return;
    }
    setFormat(preferences.exportFormat);
  }, [open, preferences.exportFormat]);

  const isProject = kind === "project";
  const text =
    language === "el"
      ? {
          action: "Εξαγωγή",
          selectProjects: "Επιλογή Projects",
          promptTitle: "Εξαγωγή Prompt",
          projectTitle: "Εξαγωγή Project",
          promptDescription: "Επίλεξε τη μορφή αρχείου για αυτό το αποθηκευμένο Prompt.",
          projectDescription: "Επίλεξε αν θέλεις ένα ενιαίο αρχείο ή ξεχωριστά αρχεία μέσα σε ZIP.",
          mode: "Τρόπος εξαγωγής",
          oneFile: "Ολόκληρο Project — ένα αρχείο",
          oneFileHint: "Project, Creation Notes και όλες οι εκδόσεις σε ένα αρχείο.",
          separate: "Project + Prompts — ξεχωριστά αρχεία",
          separateHint: "Ένα summary και ένα αρχείο ανά έκδοση, όλα μέσα σε ένα ZIP.",
          format: "Μορφή",
          cancel: "Ακύρωση",
          exporting: "Δημιουργία…",
          export: "Εξαγωγή",
          fallbackError: "Η εξαγωγή απέτυχε. Δοκίμασε ξανά.",
        }
      : {
          action: "Export",
          selectProjects: "Select Projects",
          promptTitle: "Export Prompt",
          projectTitle: "Export Project",
          promptDescription: "Choose the file format for this saved Prompt.",
          projectDescription: "Choose one complete file or separate files packaged in a ZIP.",
          mode: "Export mode",
          oneFile: "Entire Project — one file",
          oneFileHint: "Project, Creation Notes and every Prompt version in one file.",
          separate: "Project + Prompts — separate files",
          separateHint: "One summary plus one file per version, packaged in one ZIP.",
          format: "Format",
          cancel: "Cancel",
          exporting: "Creating…",
          export: "Export",
          fallbackError: "Export failed. Please try again.",
        };

  const runExport = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "prompt") {
        const source = await getPromptExportSource({ data: { promptId: id } });
        const document = buildPromptExportDocument(source, language);
        downloadExportDocument(document, format, source.prompt.name || name);
      } else {
        const source = await getProjectExportSource({ data: { projectId: id } });
        if (mode === "separate") {
          downloadProjectSeparateExport(source, format, language);
        } else {
          const document = buildProjectExportDocument(source, language);
          downloadExportDocument(document, format, source.project.name || name);
        }
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : text.fallbackError);
    } finally {
      setBusy(false);
    }
  };

  const projectSelected = bulkSnapshot.selectedIds.includes(id);
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonSize = compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <span
      ref={controlRef}
      data-pb-project-bulk-id={bulkEligible && isProject ? id : undefined}
      className="inline-flex shrink-0 items-center gap-1"
    >
      {bulkEligible && isProject && bulkSnapshot.active ? (
        <label
          className={cn(
            "grid shrink-0 cursor-pointer place-items-center rounded-lg border transition-colors",
            buttonSize,
            projectSelected
              ? "border-accent/60 bg-accent/15 text-accent"
              : "border-white/10 text-muted-foreground hover:border-accent/40",
          )}
          title={projectSelected ? name : text.selectProjects}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={projectSelected}
            onChange={() => toggleProjectBulkSelection(id)}
            aria-label={`${text.selectProjects}: ${name}`}
          />
        </label>
      ) : (
        <>
          {bulkEligible && isProject && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                activateProjectBulkSelection(id);
              }}
              aria-label={`${text.selectProjects}: ${name}`}
              title={text.selectProjects}
              className={cn(
                "grid shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent",
                buttonSize,
              )}
            >
              <ListChecks className={iconSize} />
            </button>
          )}

          {featureAccess.allowed && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={text.action}
              title={text.action}
              className={cn(
                "grid shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent",
                buttonSize,
              )}
            >
              <Download className={iconSize} />
            </button>
          )}
        </>
      )}

      {bulkEligible && isProject && (
        <ProjectBulkSelectionController controllerId={id} />
      )}

      {featureAccess.allowed && (
        <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{isProject ? text.projectTitle : text.promptTitle}</DialogTitle>
              <DialogDescription>
                {isProject ? text.projectDescription : text.promptDescription}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {isProject && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
                    {text.mode}
                  </legend>
                  {(
                    [
                      ["single", text.oneFile, text.oneFileHint],
                      ["separate", text.separate, text.separateHint],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                        mode === value
                          ? "border-accent/50 bg-accent/[0.08]"
                          : "border-white/10 bg-black/20 hover:border-white/20",
                      )}
                    >
                      <input
                        type="radio"
                        name={`export-mode-${id}`}
                        value={value}
                        checked={mode === value}
                        onChange={() => setMode(value)}
                        className="mt-1 accent-current"
                      />
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  {text.format}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {formats.map((item) => (
                    <label
                      key={item.value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                        format === item.value
                          ? "border-accent/50 bg-accent/[0.08] text-accent"
                          : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20",
                      )}
                    >
                      <input
                        type="radio"
                        name={`export-format-${id}`}
                        value={item.value}
                        checked={format === item.value}
                        onChange={() => setFormat(item.value)}
                        className="accent-current"
                      />
                      <span className="text-sm font-semibold">{item.label}</span>
                      <span className="ml-auto text-[10px] opacity-70">{item.extension}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-300"
                >
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {text.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runExport}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {busy ? text.exporting : text.export}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </span>
  );
}
