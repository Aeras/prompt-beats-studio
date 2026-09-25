import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ProjectPrompt = {
  id: string;
  title: string | null;
  custom_name: string | null;
  version_number: number | null;
  version_label: string | null;
  theme: string | null;
};

type DeletePromptProjectDialogProps = {
  open: boolean;
  language: string;
  projectName: string;
  prompts: ProjectPrompt[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (deletePromptIds: string[]) => void | Promise<void>;
};

function promptLabel(prompt: ProjectPrompt) {
  if (prompt.version_label?.trim()) return prompt.version_label.trim();
  if (prompt.version_number != null) return `Version ${prompt.version_number}`;
  return prompt.custom_name || prompt.title || prompt.theme || "Prompt";
}

export function DeletePromptProjectDialog({
  open,
  language,
  projectName,
  prompts,
  busy,
  onClose,
  onConfirm,
}: DeletePromptProjectDialogProps) {
  const [deletePromptsEnabled, setDeletePromptsEnabled] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedPrompts = useMemo(
    () =>
      [...prompts].sort(
        (a, b) =>
          (a.version_number ?? Number.MAX_SAFE_INTEGER) -
          (b.version_number ?? Number.MAX_SAFE_INTEGER),
      ),
    [prompts],
  );

  if (!open) return null;

  const selectedCount = deletePromptsEnabled
    ? deleteAll
      ? sortedPrompts.length
      : selectedIds.size
    : 0;
  const remainingCount = Math.max(0, sortedPrompts.length - selectedCount);

  const close = () => {
    if (busy) return;
    setDeletePromptsEnabled(false);
    setDeleteAll(false);
    setSelectedIds(new Set());
    onClose();
  };

  const confirm = () => {
    const ids = deletePromptsEnabled
      ? deleteAll
        ? sortedPrompts.map((prompt) => prompt.id)
        : Array.from(selectedIds)
      : [];
    void onConfirm(ids);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-background p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <h2 id="delete-project-title" className="font-display text-lg font-bold">
          {language === "el" ? "Διαγραφή Project" : "Delete Project"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {language === "el"
            ? `Θα διαγραφεί το project «${projectName}». Από προεπιλογή, τα prompts και οι αναλύσεις του θα παραμείνουν στη βιβλιοθήκη χωρίς project.`
            : `The project “${projectName}” will be deleted. By default, its prompts and analyses will remain in your library without a project.`}
        </p>

        {sortedPrompts.length > 0 && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={deletePromptsEnabled}
                disabled={busy}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setDeletePromptsEnabled(enabled);
                  if (!enabled) {
                    setDeleteAll(false);
                    setSelectedIds(new Set());
                  }
                }}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {language === "el"
                  ? "Διαγραφή και prompts από αυτό το Project"
                  : "Also delete prompts from this Project"}
              </span>
            </label>

            {deletePromptsEnabled && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={deleteAll}
                    disabled={busy}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setDeleteAll(checked);
                      if (checked) setSelectedIds(new Set());
                    }}
                    className="h-4 w-4"
                  />
                  <span>{language === "el" ? "Όλα" : "All"}</span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {sortedPrompts.length}
                  </span>
                </label>

                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {sortedPrompts.map((prompt) => (
                    <label
                      key={prompt.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2 py-2 text-sm",
                        deleteAll
                          ? "cursor-not-allowed opacity-45"
                          : "cursor-pointer hover:bg-white/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={deleteAll || selectedIds.has(prompt.id)}
                        disabled={busy || deleteAll}
                        onChange={(event) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(prompt.id);
                            else next.delete(prompt.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate">{promptLabel(prompt)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
          {selectedCount === 0
            ? language === "el"
              ? `Θα διαγραφεί μόνο το Project. Και τα ${sortedPrompts.length} prompts θα παραμείνουν ως ανεξάρτητα Αποθηκευμένα Prompts.`
              : `Only the Project will be deleted. All ${sortedPrompts.length} prompts will remain as standalone Saved Prompts.`
            : language === "el"
              ? `Θα διαγραφεί το Project και ${selectedCount} από τα ${sortedPrompts.length} prompts. Τα υπόλοιπα ${remainingCount} θα παραμείνουν στα Αποθηκευμένα Prompts.`
              : `The Project and ${selectedCount} of ${sortedPrompts.length} prompts will be deleted. The remaining ${remainingCount} will stay in Saved Prompts.`}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {language === "el" ? "Ακύρωση" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {selectedCount === 0
              ? language === "el"
                ? "Διαγραφή Project"
                : "Delete Project"
              : selectedCount === sortedPrompts.length
                ? language === "el"
                  ? "Διαγραφή Project + όλων των prompts"
                  : "Delete Project + all prompts"
                : language === "el"
                  ? `Διαγραφή Project + ${selectedCount} prompts`
                  : `Delete Project + ${selectedCount} prompts`}
          </button>
        </div>
      </div>
    </div>
  );
}
