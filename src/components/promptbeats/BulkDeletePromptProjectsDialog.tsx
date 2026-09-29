import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import {
  previewBulkDeletePromptProjects,
  type BulkDeletePromptProjectPlan,
} from "@/lib/project-bulk-delete.functions";

type PreviewPrompt = {
  id: string;
  projectId: string | null;
  title: string | null;
  customName: string | null;
  versionNumber: number | null;
  versionLabel: string | null;
  theme: string | null;
};

type PreviewProject = {
  id: string;
  name: string;
  universe: { id: string; title: string } | null;
  prompts: PreviewPrompt[];
};

type Props = {
  open: boolean;
  language: string;
  projectIds: string[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (plans: BulkDeletePromptProjectPlan[]) => void | Promise<void>;
};

function promptTitle(prompt: PreviewPrompt) {
  return prompt.customName || prompt.title || prompt.theme || "Prompt";
}

function promptVersion(prompt: PreviewPrompt) {
  if (prompt.versionNumber != null) return `V${prompt.versionNumber}`;
  if (prompt.versionLabel?.trim()) return prompt.versionLabel.trim();
  return null;
}

function promptLabel(prompt: PreviewPrompt) {
  const version = promptVersion(prompt);
  return version ? `${promptTitle(prompt)} — ${version}` : promptTitle(prompt);
}

export function BulkDeletePromptProjectsDialog({
  open,
  language,
  projectIds,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [projects, setProjects] = useState<PreviewProject[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const projectKey = projectIds.join(":");
  useEffect(() => {
    if (!open || projectIds.length === 0) return;
    setExpandedIds(new Set());
    setSelectedPromptIds(new Set());
    setProjects([]);
    setError("");
    let cancelled = false;
    setLoading(true);
    void previewBulkDeletePromptProjects({ data: { projectIds } })
      .then((result) => {
        if (!cancelled) setProjects(result.projects as PreviewProject[]);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : language === "el"
                ? "Δεν ήταν δυνατός ο έλεγχος διαγραφής."
                : "Could not review the deletion.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // projectKey intentionally refreshes the authoritative preview when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectKey, language]);

  const promptsByProject = useMemo(() => {
    const map = new Map<string, PreviewPrompt[]>();
    for (const project of projects) map.set(project.id, [...project.prompts]);
    return map;
  }, [projects]);

  if (!open) return null;

  const totalPromptCount = projects.reduce((sum, project) => sum + project.prompts.length, 0);
  const selectedPromptCount = selectedPromptIds.size;
  const remainingPromptCount = Math.max(0, totalPromptCount - selectedPromptCount);
  const universeLinks = projects.filter((project) => project.universe);

  const toggleAllProjectPrompts = (projectId: string, checked: boolean) => {
    const projectPrompts = promptsByProject.get(projectId) ?? [];
    setSelectedPromptIds((current) => {
      const next = new Set(current);
      for (const prompt of projectPrompts) {
        if (checked) next.add(prompt.id);
        else next.delete(prompt.id);
      }
      return next;
    });
  };

  const confirm = () => {
    const plans = projects.map((project) => ({
      projectId: project.id,
      deletePromptIds: project.prompts
        .filter((prompt) => selectedPromptIds.has(prompt.id))
        .map((prompt) => prompt.id),
    }));
    void onConfirm(plans);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-projects-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-background p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <h2 id="bulk-delete-projects-title" className="font-display text-lg font-bold">
          {language === "el" ? "Έλεγχος μαζικής διαγραφής" : "Review bulk deletion"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {language === "el"
            ? "Τα επιλεγμένα Projects θα διαγραφούν. Διάλεξε ποια prompts/versions θέλεις να διαγραφούν μαζί τους. Όσα δεν επιλεγούν θα παραμείνουν ως ανεξάρτητα Αποθηκευμένα Prompts."
            : "The selected Projects will be deleted. Choose which prompts/versions should be deleted with them. Unselected prompts will remain as standalone Saved Prompts."}
        </p>

        {loading ? (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/10 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {language === "el" ? "Έλεγχος Projects..." : "Reviewing Projects..."}
          </div>
        ) : error ? (
          <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {projects.map((project) => {
              const projectPrompts = promptsByProject.get(project.id) ?? [];
              const selectedForProject = projectPrompts.filter((prompt) =>
                selectedPromptIds.has(prompt.id),
              ).length;
              const allSelected =
                projectPrompts.length > 0 && selectedForProject === projectPrompts.length;
              const partiallySelected = selectedForProject > 0 && !allSelected;
              const expanded = expandedIds.has(project.id);

              return (
                <div key={project.id} className="rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={
                        language === "el"
                          ? `Διαγραφή όλων των prompts του ${project.name}`
                          : `Delete all prompts from ${project.name}`
                      }
                      checked={allSelected}
                      disabled={busy || projectPrompts.length === 0}
                      ref={(node) => {
                        if (node) node.indeterminate = partiallySelected;
                      }}
                      onChange={(event) =>
                        toggleAllProjectPrompts(project.id, event.target.checked)
                      }
                      className="h-4 w-4 shrink-0"
                    />
                    <button
                      type="button"
                      disabled={projectPrompts.length === 0}
                      onClick={() =>
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(project.id)) next.delete(project.id);
                          else next.add(project.id);
                          return next;
                        })
                      }
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-accent disabled:opacity-35"
                      aria-label={language === "el" ? "Προβολή εκδόσεων" : "Show versions"}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{project.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {projectPrompts.length} {language === "el" ? "εκδόσεις" : "versions"}
                        {selectedForProject > 0
                          ? ` · ${selectedForProject} ${language === "el" ? "για διαγραφή" : "selected"}`
                          : ""}
                      </div>
                      {project.universe && (
                        <div className="mt-1 truncate text-[11px] text-accent/85">
                          Song Universe: {project.universe.title}
                        </div>
                      )}
                    </div>
                  </div>

                  {expanded && projectPrompts.length > 0 && (
                    <div className="border-t border-white/10 px-3 py-2">
                      <div className="space-y-1">
                        {projectPrompts.map((prompt) => (
                          <label
                            key={prompt.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/5"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPromptIds.has(prompt.id)}
                              disabled={busy}
                              onChange={(event) => {
                                setSelectedPromptIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(prompt.id);
                                  else next.delete(prompt.id);
                                  return next;
                                });
                              }}
                              className="h-4 w-4 shrink-0"
                            />
                            <span className="min-w-0 flex-1 truncate">{promptLabel(prompt)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">
              {language === "el" ? "Πρόκειται να διαγραφούν:" : "About to delete:"}
            </div>
            <div className="mt-2 space-y-1">
              <div>{projects.length} Projects</div>
              <div>{selectedPromptCount} prompts / versions</div>
              <div>
                {remainingPromptCount}{" "}
                {language === "el"
                  ? "prompts / versions θα παραμείνουν standalone"
                  : "prompts / versions will remain standalone"}
              </div>
              {universeLinks.length > 0 && (
                <div className="text-accent">
                  {universeLinks.length}{" "}
                  {language === "el"
                    ? "Projects θα αφαιρεθούν από Song Universe"
                    : "Projects will be removed from Song Universe"}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {language === "el" ? "Ακύρωση" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy || loading || Boolean(error) || projects.length === 0}
            onClick={confirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {language === "el"
              ? `Διαγραφή ${projects.length || projectIds.length} Projects`
              : `Delete ${projects.length || projectIds.length} Projects`}
          </button>
        </div>
      </div>
    </div>
  );
}
