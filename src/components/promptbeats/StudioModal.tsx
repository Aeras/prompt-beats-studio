import { useState } from "react";
import { Sparkles, X, Wand2, Loader2, Music, Plus, Trash2, ImagePlus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { GENRES } from "@/lib/tracks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createTrack } from "@/lib/tracks.functions";
import { useModeration } from "@/hooks/useModeration";

type Row = {
  key: string;
  file: File | null;
  cover: File | null;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
};

const emptyRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  file: null,
  cover: null,
  title: "",
  genre: "",
  prompt: "",
  lyrics: "",
});

const stripExt = (name: string) => name.replace(/\.(mp3|wav)$/i, "");

const inputCls =
  "h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

export function StudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { isBanned } = useModeration();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!open) return null;

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickFile = (key: string, file: File | null) =>
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? { ...r, file, title: r.title.trim() ? r.title : file ? stripExt(file.name) : r.title }
          : r,
      ),
    );

  const uploadOne = async (file: File, token: string | undefined) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const payload = (await res.json()) as { url?: string; key?: string; error?: string };
    if (!res.ok || !payload.url) throw new Error(payload.error ?? "Upload failed");
    return payload;
  };

  const uploadCover = async (file: File): Promise<string> => {
    if (!user) throw new Error("You must be signed in to upload a cover.");
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("track-covers").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(`Cover upload failed: ${error.message}`);
    const { data } = supabase.storage.from("track-covers").getPublicUrl(path);
    return data.publicUrl;
  };

  const uploadAll = async () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (isBanned) {
      setStatus("Your account is suspended, so uploads are disabled.");
      return;
    }
    setStatus(null);
    for (const r of rows) {
      if (!r.file) return setStatus("Every track block needs an MP3 or WAV file.");
      if (!r.title.trim()) return setStatus("Every track needs a title.");
      if (!r.genre) return setStatus("Pick a genre for every track.");
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      let done = 0;
      const uploads = await Promise.all(
        rows.map(async (r) => {
          const payload = await uploadOne(r.file!, token);
          const cover_url = r.cover ? await uploadCover(r.cover) : null;
          done += 1;
          setStatus(`Uploaded ${done}/${rows.length} file(s)…`);
          return { row: r, payload, cover_url };
        }),
      );

      setStatus("Saving tracks…");
      await Promise.all(
        uploads.map(({ row, payload, cover_url }) =>
          createTrack({
            data: {
              title: row.title.trim(),
              genre: row.genre,
              prompt: row.prompt,
              lyrics: row.lyrics,
              audio_url: payload.url!,
              audio_type: "upload",
              ...(payload.key ? { audio_key: payload.key } : {}),
              ...(cover_url ? { cover_url } : {}),
              is_published: true,
            },
          }),
        ),
      );

      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      setStatus(`${uploads.length} track(s) published!`);
      setRows([emptyRow()]);
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
              <h2 className="truncate text-lg font-bold">Upload tracks</h2>
              <p className="truncate text-xs text-muted-foreground">MP3 / WAV only — add as many as you like</p>
            </div>
          </div>
          <button aria-label="Close studio" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        {isBanned && (
          <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Your account is suspended, so uploading is disabled.
          </p>
        )}

        {!isBanned && (
        <div className="mt-6 space-y-5">
          {rows.map((r, i) => (
            <section key={r.key} className="space-y-3 rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-widest text-accent">Track {i + 1}</p>
                {rows.length > 1 && (
                  <button
                    aria-label={`Remove track ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <label
                htmlFor={`pb-audio-${r.key}`}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
              >
                <Music className="h-4 w-4 shrink-0" />
                <span className="truncate">{r.file ? r.file.name : "Choose or drop an .mp3 / .wav file"}</span>
              </label>
              <input
                id={`pb-audio-${r.key}`}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={(e) => pickFile(r.key, e.target.files?.[0] ?? null)}
                className="hidden"
              />

              <label
                htmlFor={`pb-cover-${r.key}`}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
              >
                {r.cover ? (
                  <img
                    src={URL.createObjectURL(r.cover)}
                    alt={`Cover preview for track ${i + 1}`}
                    className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <ImagePlus className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {r.cover ? r.cover.name : "Upload cover art (optional) — JPG / PNG / WebP"}
                </span>
              </label>
              <input
                id={`pb-cover-${r.key}`}
                type="file"
                accept="image/*"
                onChange={(e) => update(r.key, { cover: e.target.files?.[0] ?? null })}
                className="hidden"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                  placeholder="Track title"
                  aria-label={`Track ${i + 1} title`}
                  className={inputCls}
                />
                <select
                  value={r.genre}
                  onChange={(e) => update(r.key, { genre: e.target.value })}
                  aria-label={`Track ${i + 1} genre`}
                  className={
                    "h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60 " +
                    (r.genre ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  <option value="" disabled className="bg-[#0a0a0c]">
                    Select Music Genre
                  </option>
                  {GENRES.filter((g) => g !== "All").map((g) => (
                    <option key={g} value={g} className="bg-[#0a0a0c]">
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                value={r.prompt}
                onChange={(e) => update(r.key, { prompt: e.target.value })}
                rows={3}
                placeholder="AI prompt used to create this track"
                aria-label={`Track ${i + 1} AI prompt`}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_25%,transparent)]"
              />

              <textarea
                value={r.lyrics}
                onChange={(e) => update(r.key, { lyrics: e.target.value })}
                rows={4}
                placeholder="Lyrics (optional) — line breaks are preserved"
                aria-label={`Track ${i + 1} lyrics (optional)`}
                className="w-full resize-y whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_25%,transparent)]"
              />
            </section>
          ))}

          <button
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/40 px-4 py-3 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            <Plus className="h-4 w-4" /> Add Another Track
          </button>

          {status && <p className="text-center text-xs text-accent">{status}</p>}

          <button
            onClick={uploadAll}
            disabled={busy || isBanned}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {isBanned ? "Uploads disabled" : user ? "Upload All" : "Sign in to upload"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
