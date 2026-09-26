import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useAccountPreferences } from "@/lib/account-preferences";
import { draftFingerprint, useDraftAutosave } from "@/lib/draft-autosave";

export type StandalonePromptEditValues = {
  custom_name: string | null;
  theme: string | null;
  genre: string | null;
  mood: string | null;
  language: string | null;
  tags: string | null;
  lyrics: string | null;
  note: string | null;
};

type EditProps = {
  open: boolean;
  language: string;
  prompt: StandalonePromptEditValues;
  busy: boolean;
  onClose: () => void;
  onSave: (values: StandalonePromptEditValues) => void | Promise<void>;
};

export function EditStandalonePromptDialog({
  open,
  language,
  prompt,
  busy,
  onClose,
  onSave,
}: EditProps) {
  const el = language === "el";
  const { preferences, userId } = useAccountPreferences();
  const [draft, setDraft] = useState<StandalonePromptEditValues>(prompt);
  const draftScope = `standalone-prompt:${draftFingerprint(JSON.stringify(prompt))}`;

  useEffect(() => {
    if (open) setDraft(prompt);
  }, [open, prompt]);

  const clearDraft = useDraftAutosave({
    ownerId: userId,
    scope: draftScope,
    enabled: open && preferences.autoSaveDrafts,
    value: draft,
    onRestore: setDraft,
    isEmpty: (value) => JSON.stringify(value) === JSON.stringify(prompt),
  });

  if (!open) return null;

  const field = (key: keyof StandalonePromptEditValues, value: string) =>
    setDraft((current) => ({ ...current, [key]: value || null }));

  const saveDraft = async () => {
    await onSave(draft);
    clearDraft();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-background p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <h2 className="font-display text-lg font-bold">
          {el ? "Επεξεργασία Prompt" : "Edit Prompt"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {el
            ? "Οι αλλαγές αποθηκεύονται στο ίδιο ανεξάρτητο Prompt."
            : "Changes are saved to this same standalone Prompt."}
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label={el ? "Όνομα" : "Name"}
            value={draft.custom_name ?? ""}
            onChange={(v) => field("custom_name", v)}
            maxLength={200}
          />
          <Field
            label={el ? "Γλώσσα" : "Language"}
            value={draft.language ?? ""}
            onChange={(v) => field("language", v)}
            maxLength={80}
          />
          <Field
            label="Theme"
            value={draft.theme ?? ""}
            onChange={(v) => field("theme", v)}
            maxLength={500}
            wide
          />
          <Field
            label={el ? "Μουσικό στυλ" : "Music Style"}
            value={draft.genre ?? ""}
            onChange={(v) => field("genre", v)}
            maxLength={500}
          />
          <Field
            label="Mood"
            value={draft.mood ?? ""}
            onChange={(v) => field("mood", v)}
            maxLength={120}
          />
          <Area
            label={el ? "Prompt / Tags" : "Prompt / Tags"}
            value={draft.tags ?? ""}
            onChange={(v) => field("tags", v)}
            maxLength={4000}
            wide
          />
          <Area
            label={el ? "Στίχοι" : "Lyrics"}
            value={draft.lyrics ?? ""}
            onChange={(v) => field("lyrics", v)}
            maxLength={12000}
            rows={10}
            wide
          />
          <Area
            label={el ? "Σημειώσεις παραγωγής" : "Production Notes"}
            value={draft.note ?? ""}
            onChange={(v) => field("note", v)}
            maxLength={6000}
            rows={5}
            wide
          />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {el ? "Ακύρωση" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Αποθήκευση αλλαγών" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm outline-none focus:border-accent/50"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  maxLength,
  rows = 5,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <textarea
        value={value}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm outline-none focus:border-accent/50"
      />
    </label>
  );
}

type ProjectOption = { id: string; name: string };
type RevisionProps = {
  open: boolean;
  language: string;
  projects: ProjectOption[];
  busy: boolean;
  onClose: () => void;
  onReplace: () => void;
  onAddToProject: (projectId: string) => void | Promise<void>;
};

export function StandalonePromptRevisionDialog({
  open,
  language,
  projects,
  busy,
  onClose,
  onReplace,
  onAddToProject,
}: RevisionProps) {
  const el = language === "el";
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    if (open) setProjectId("");
  }, [open]);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full rounded-t-2xl border border-white/10 bg-background p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <h2 className="font-display text-lg font-bold">
          {el ? "Ανεξάρτητο Prompt" : "Standalone Prompt"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {el
            ? "Οι αλλαγές που θα κάνετε θα αντικαταστήσουν το υπάρχον αποθηκευμένο Prompt. Αν θέλετε να διατηρήσετε την παλιά και τη νέα έκδοση, προσθέστε πρώτα το Prompt σε Project."
            : "The changes you make will replace this saved Prompt. To keep both the old and new versions, add the Prompt to a Project first."}
        </p>
        {projects.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-muted-foreground">
              {el ? "Προσθήκη σε Project" : "Add to Project"}
            </label>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm"
            >
              <option value="">{el ? "Επιλέξτε Project…" : "Choose Project…"}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={onReplace}
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 disabled:opacity-50"
          >
            {el ? "Συνέχεια και αντικατάσταση" : "Continue and replace"}
          </button>
          <button
            type="button"
            disabled={busy || !projectId}
            onClick={() => projectId && void onAddToProject(projectId)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Προσθήκη σε Project" : "Add to Project"}
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {el ? "Ακύρωση" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
