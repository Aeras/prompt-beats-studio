import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAiModelSelection } from "@/hooks/useAiModelSelection";
import { useModeration } from "@/hooks/useModeration";
import { generateSongSetup, type SongSetupDraft } from "@/lib/song-setup-assistant.functions";
import { AI_TARGET_PLATFORM_LABEL, type AITargetPlatform } from "@/lib/ai-target-platforms";
import { useI18n, type AppTranslationKey } from "@/i18n";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";

const SONG_SETUP_DESCRIPTION_LIMIT = 2500;

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

const fields: Array<{
  key: keyof SongSetupDraft;
  labelKey: AppTranslationKey;
  multiline?: boolean;
  rows?: number;
}> = [
  { key: "theme", labelKey: "generator.theme", multiline: true, rows: 4 },
  { key: "musicStyle", labelKey: "generator.musicStyle", multiline: true, rows: 2 },
  { key: "mood", labelKey: "generator.mood", multiline: true, rows: 2 },
  { key: "instruments", labelKey: "generator.instruments", multiline: true, rows: 2 },
  { key: "bpm", labelKey: "generator.bpm" },
  { key: "songStructure", labelKey: "generator.songStructure", multiline: true, rows: 2 },
  { key: "productionStyle", labelKey: "generator.productionStyle", multiline: true, rows: 4 },
  {
    key: "additionalInstructions",
    labelKey: "generator.additionalInstructions",
    multiline: true,
    rows: 5,
  },
  { key: "language", labelKey: "generator.language" },
];

const copy = {
  en: {
    title: "Song Setup Assistant",
    description: (platform: string) =>
      `Describe the song you have in mind in ordinary language. The assistant will turn your idea into a complete Advanced Mode setup for ${platform} — it will not write the song itself.`,
    describe: "Describe your song",
    placeholder:
      "Example: I want a fun Greek summer song about two people meeting again at a beach party. Blend reggaeton, cumbia and soft rock, with guitars and lively percussion. Keep it playful rather than sentimental...",
    building: "Building setup…",
    generate: "Generate Setup",
    regenerate: "Regenerate Setup",
    reset: "Reset",
    preview: "Advanced setup preview",
    previewHint: "Review or edit any field before applying it to Advanced Mode.",
    apply: "Apply to Advanced",
    fallbackError: "Could not generate a song setup. Please try again.",
  },
  el: {
    title: "Βοηθός Ρύθμισης Τραγουδιού",
    description: (platform: string) =>
      `Περίγραψε το τραγούδι που έχεις στο μυαλό σου με απλά λόγια. Ο βοηθός θα μετατρέψει την ιδέα σου σε πλήρη ρύθμιση της Προηγμένης λειτουργίας για ${platform} — δεν θα γράψει το ίδιο το τραγούδι.`,
    describe: "Περίγραψε το τραγούδι σου",
    placeholder:
      "Παράδειγμα: Θέλω ένα διασκεδαστικό ελληνικό καλοκαιρινό τραγούδι για δύο ανθρώπους που ξανασυναντιούνται σε ένα beach party. Συνδύασε reggaeton, cumbia και soft rock, με κιθάρες και ζωηρά κρουστά. Να είναι ανάλαφρο και όχι μελό...",
    building: "Δημιουργία ρύθμισης…",
    generate: "Δημιουργία ρύθμισης",
    regenerate: "Νέα δημιουργία",
    reset: "Επαναφορά",
    preview: "Προεπισκόπηση προηγμένης ρύθμισης",
    previewHint:
      "Έλεγξε ή επεξεργάσου οποιοδήποτε πεδίο πριν το εφαρμόσεις στην Προηγμένη λειτουργία.",
    apply: "Εφαρμογή στο Προηγμένο",
    fallbackError: "Δεν ήταν δυνατή η δημιουργία της ρύθμισης. Δοκίμασε ξανά.",
  },
} as const;

export function SongSetupAssistantModal({
  open,
  onOpenChange,
  targetPlatform,
  onApply,
  prefillDescription = null,
  prefillSourceLabel = null,
  prefillKey = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlatform: AITargetPlatform;
  onApply: (draft: SongSetupDraft) => void;
  prefillDescription?: string | null;
  prefillSourceLabel?: string | null;
  prefillKey?: string | null;
}) {
  const { language, t } = useI18n();
  const { preferences, userId } = useAccountPreferences();
  const moderation = useModeration();
  const isSuperAdmin = moderation.isSuperAdmin;
  const descriptionLimit = isSuperAdmin ? undefined : SONG_SETUP_DESCRIPTION_LIMIT;
  const text = copy[language];
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<SongSetupDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const aiModel = useAiModelSelection("aiTools");
  const clearSongSetupDraft = useDraftAutosave({
    ownerId: userId,
    scope: `song-setup:${prefillKey ?? targetPlatform}`,
    enabled: open && preferences.autoSaveDrafts,
    value: { description, draft },
    onRestore: (saved) => {
      setDescription(
        descriptionLimit == null
          ? saved.description
          : saved.description.slice(0, SONG_SETUP_DESCRIPTION_LIMIT),
      );
      setDraft(saved.draft);
    },
    isEmpty: (saved) => !saved.description.trim() && saved.draft === null,
  });

  useEffect(() => {
    if (!open || moderation.isLoading || !prefillKey || !prefillDescription) return;
    setDescription(
      descriptionLimit == null
        ? prefillDescription
        : prefillDescription.slice(0, SONG_SETUP_DESCRIPTION_LIMIT),
    );
    setDraft(null);
    setError(null);
  }, [descriptionLimit, moderation.isLoading, open, prefillDescription, prefillKey]);

  useEffect(() => {
    if (moderation.isLoading || isSuperAdmin || description.length <= SONG_SETUP_DESCRIPTION_LIMIT)
      return;
    setDescription((current) => current.slice(0, SONG_SETUP_DESCRIPTION_LIMIT));
  }, [description.length, isSuperAdmin, moderation.isLoading]);

  const generate = async () => {
    const clean = description.trim();
    if (clean.length < 10 || busy || aiModel.unavailable) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateSongSetup({
        data: {
          description: clean,
          targetPlatform,
          requestKey: (requestKeyRef.current ??= crypto.randomUUID()),
          ...(aiModel.selectedModel ? { model: aiModel.selectedModel } : {}),
        },
      });
      setDraft(result.setup);
      requestKeyRef.current = null;
    } catch (err) {
      setError(
        err instanceof Error && (language === "en" || isSuperAdmin)
          ? err.message
          : text.fallbackError,
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (busy) return;
    clearSongSetupDraft();
    setDescription("");
    setDraft(null);
    setError(null);
    requestKeyRef.current = null;
  };

  const updateDraft = (key: keyof SongSetupDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const canReset = description.length > 0 || draft !== null || error !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-white/10 bg-[#0e0e12]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <DialogTitle>{text.title}</DialogTitle>
          </div>
          <DialogDescription>
            {text.description(AI_TARGET_PLATFORM_LABEL[targetPlatform])}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {prefillSourceLabel && (
            <div className="rounded-xl border border-accent/20 bg-accent/[0.04] px-3 py-2 text-xs text-muted-foreground">
              {language === "el" ? "Πηγή" : "Source"}:{" "}
              <span className="font-medium text-foreground">{prefillSourceLabel}</span>
              <span className="ml-1">
                {language === "el"
                  ? "— μεταφέρθηκαν μόνο τα πεδία Creative Direction που επέλεξες να κρατήσεις."
                  : "— only the Creative Direction fields you chose to keep were transferred."}
              </span>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor="song-setup-description"
                className="text-xs font-semibold uppercase tracking-wider text-foreground/90"
              >
                {text.describe}
              </label>
              <div className="flex items-center gap-2">
                {aiModel.showSelector && (
                  <select
                    aria-label={language === "el" ? "Μοντέλο AI" : "AI model"}
                    value={aiModel.selectedModel}
                    onChange={(event) => aiModel.setSelectedModel(event.target.value)}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
                  >
                    {aiModel.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {descriptionLimit == null
                    ? description.length
                    : `${description.length}/${SONG_SETUP_DESCRIPTION_LIMIT}`}
                </span>
              </div>
            </div>
            <textarea
              id="song-setup-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={descriptionLimit}
              rows={6}
              placeholder={text.placeholder}
              className={`${fieldClass} resize-y`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy || description.trim().length < 10 || aiModel.unavailable}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {busy ? text.building : draft ? text.regenerate : text.generate}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || !canReset}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              {text.reset}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
        </div>

        {draft && (
          <div className="space-y-3 rounded-2xl border border-accent/20 bg-accent/[0.03] p-4">
            <div>
              <h3 className="text-sm font-semibold text-accent">{text.preview}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{text.previewHint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <label
                  key={field.key}
                  className={
                    field.key === "theme" ||
                    field.key === "productionStyle" ||
                    field.key === "additionalInstructions"
                      ? "sm:col-span-2"
                      : ""
                  }
                >
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(field.labelKey)}
                  </span>
                  {field.multiline ? (
                    <textarea
                      value={draft[field.key]}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      rows={field.rows ?? 2}
                      className={`${fieldClass} resize-y`}
                    />
                  ) : (
                    <input
                      value={draft[field.key]}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      className={fieldClass}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:space-x-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("common.close")}
          </button>
          {draft && (
            <button
              type="button"
              onClick={() => {
                onApply(draft);
                clearSongSetupDraft();
                onOpenChange(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              <Sparkles className="h-4 w-4" />
              {text.apply}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
