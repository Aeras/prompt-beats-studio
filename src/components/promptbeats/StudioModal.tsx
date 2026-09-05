import { useState } from "react";
import { Sparkles, X, Wand2, Save } from "lucide-react";
import { STUDIO_TAGS } from "@/lib/tracks";

export function StudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState(
    "italo disco, 122 bpm, octave bass sequencer, glassy DX7 bells, vocoder backing vocals",
  );
  const [lyrics, setLyrics] = useState("[Intro]\nAutomatic, velvet heart\n\n[Drop]\nDance until the circuits part");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="glass-strong max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-neon glow-neon">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">AI Prompt Studio</h2>
              <p className="truncate text-xs text-muted-foreground">Craft the sound, then write the words</p>
            </div>
          </div>
          <button aria-label="Close studio" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <label htmlFor="pb-prompt" className="text-xs uppercase tracking-widest text-accent">
              Style prompt
            </label>
            <textarea
              id="pb-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_25%,transparent)]"
            />
          </section>

          <section className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-accent">Structure tags</p>
            <div className="flex flex-wrap gap-2">
              {STUDIO_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setLyrics((l) => `${l}\n\n${tag}\n`)}
                  className="rounded-full border border-primary/50 bg-primary/10 px-3.5 py-1.5 font-display text-xs text-primary shadow-[0_0_14px_-4px_var(--neon)] transition-all hover:bg-primary/20 hover:shadow-[0_0_18px_-2px_var(--neon)]"
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <label htmlFor="pb-lyrics" className="text-xs uppercase tracking-widest text-accent">
              Lyrics
            </label>
            <textarea
              id="pb-lyrics"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={10}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm leading-relaxed outline-none transition-shadow focus:border-accent/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--electric)_25%,transparent)]"
            />
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95">
              <Wand2 className="h-4 w-4" /> Generate track
            </button>
            <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Save className="h-4 w-4" /> Save draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
