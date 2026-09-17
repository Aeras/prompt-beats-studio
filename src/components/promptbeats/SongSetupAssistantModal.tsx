import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateSongSetup,
  type SongSetupDraft,
} from "@/lib/song-setup-assistant.functions";
import { AI_TARGET_PLATFORM_LABEL, type AITargetPlatform } from "@/lib/ai-target-platforms";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

const fields: Array<{
  key: keyof SongSetupDraft;
  label: string;
  multiline?: boolean;
  rows?: number;
}> = [
  { key: "theme", label: "Theme", multiline: true, rows: 4 },
  { key: "musicStyle", label: "Music Style", multiline: true, rows: 2 },
  { key: "mood", label: "Mood", multiline: true, rows: 2 },
  { key: "instruments", label: "Instruments", multiline: true, rows: 2 },
  { key: "bpm", label: "BPM" },
  { key: "songStructure", label: "Song Structure", multiline: true, rows: 2 },
  { key: "productionStyle", label: "Production Style", multiline: true, rows: 4 },
  { key: "additionalInstructions", label: "Additional Instructions", multiline: true, rows: 5 },
  { key: "language", label: "Language" },
];

export function SongSetupAssistantModal({
  open,
  onOpenChange,
  targetPlatform,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlatform: AITargetPlatform;
  onApply: (draft: SongSetupDraft) => void;
}) {
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<SongSetupDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const clean = description.trim();
    if (clean.length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateSongSetup({ data: { description: clean, targetPlatform } });
      setDraft(result.setup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a song setup. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (key: keyof SongSetupDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-white/10 bg-[#0e0e12]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <DialogTitle>Song Setup Assistant</DialogTitle>
          </div>
          <DialogDescription>
            Describe the song you have in mind in ordinary language. The assistant will turn your idea into a complete Advanced Mode setup for {AI_TARGET_PLATFORM_LABEL[targetPlatform]} — it will not write the song itself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="song-setup-description" className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
                Describe your song
              </label>
              <span className="text-[11px] text-muted-foreground">Gemini 3.8 Flash · {description.length}/2500</span>
            </div>
            <textarea
              id="song-setup-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2500}
              rows={6}
              placeholder="Example: I want a fun Greek summer song about two people meeting again at a beach party. Blend reggaeton, cumbia and soft rock, with guitars and lively percussion. Keep it playful rather than sentimental..."
              className={`${fieldClass} resize-y`}
            />
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy || description.trim().length < 10}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Building setup…" : draft ? "Regenerate Setup" : "Generate Setup"}
          </button>

          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>

        {draft && (
          <div className="space-y-3 rounded-2xl border border-accent/20 bg-accent/[0.03] p-4">
            <div>
              <h3 className="text-sm font-semibold text-accent">Advanced setup preview</h3>
              <p className="mt-1 text-xs text-muted-foreground">Review or edit any field before applying it to Advanced Mode.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <label
                  key={field.key}
                  className={field.key === "theme" || field.key === "productionStyle" || field.key === "additionalInstructions" ? "sm:col-span-2" : ""}
                >
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</span>
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
            Close
          </button>
          {draft && (
            <button
              type="button"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              <Sparkles className="h-4 w-4" />
              Apply to Advanced
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
