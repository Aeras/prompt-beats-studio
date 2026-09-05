import { useRef, useState } from "react";
import { Sparkles, X, Wand2, Save, Loader2, Music } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { STUDIO_TAGS, GENRES } from "@/lib/tracks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createTrack } from "@/lib/tracks.functions";

export function StudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Synthwave");
  const [audioType, setAudioType] = useState<"link" | "upload">("link");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "italo disco, 122 bpm, octave bass sequencer, glassy DX7 bells, vocoder backing vocals",
  );
  const [lyrics, setLyrics] = useState("[Intro]\nAutomatic, velvet heart\n\n[Drop]\nDance until the circuits part");

  if (!open) return null;

  const publish = async (isPublished: boolean) => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (!title.trim()) return setStatus("Give your track a title first.");
    if (audioType === "upload" && !file) return setStatus("Choose an .mp3 or .wav file to upload.");
    if (audioType === "link" && !/^https?:\/\//i.test(externalUrl.trim()))
      return setStatus("Paste a valid link (Suno, Udio, …) starting with https://");

    setBusy(true);
    setStatus(audioType === "upload" ? "Uploading audio…" : "Saving track…");
    try {
      let audioUrl = externalUrl.trim();
      let audioKey: string | undefined;

      if (audioType === "upload" && file) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body,
        });
        const payload = (await res.json()) as { url?: string; key?: string; error?: string };
        if (!res.ok || !payload.url) throw new Error(payload.error ?? "Upload failed");
        audioUrl = payload.url;
        audioKey = payload.key;
      }

      setStatus("Saving track…");
      await createTrack({
        data: {
          title: title.trim(),
          genre,
          prompt,
          lyrics,
          audio_url: audioUrl,
          audio_type: audioType,
          ...(audioKey ? { audio_key: audioKey } : {}),
          is_published: isPublished,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      setStatus(isPublished ? "Track published!" : "Draft saved.");
      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

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
          <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Track title"
              aria-label="Track title"
              className="h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              aria-label="Genre"
              className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60"
            >
              {GENRES.filter((g) => g !== "All").map((g) => (
                <option key={g} value={g} className="bg-[#0a0a0c]">
                  {g}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-accent">Audio source</p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/40 p-1">
              {(
                [
                  ["link", "External URL"],
                  ["upload", "Direct MP3 Upload"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudioType(value)}
                  aria-pressed={audioType === value}
                  className={
                    audioType === value
                      ? "rounded-xl bg-gradient-neon px-3 py-2 text-xs font-semibold text-primary-foreground glow-neon"
                      : "rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-accent"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {audioType === "link" ? (
              <input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://suno.com/song/… or Udio link"
                aria-label="External track URL"
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
              />
            ) : (
              <>
                <label
                  htmlFor="pb-audio"
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <Music className="h-4 w-4 shrink-0" />
                  <span className="truncate">{file ? file.name : "Choose an .mp3 / .wav file to upload"}</span>
                </label>
                <input
                  ref={fileRef}
                  id="pb-audio"
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/wav"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </>
            )}
          </section>

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

          {status && <p className="text-center text-xs text-accent">{status}</p>}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => publish(true)}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {user ? "Publish track" : "Sign in to publish"}
            </button>
            <button
              onClick={() => publish(false)}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Save draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
