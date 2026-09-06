import { useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { GENRES } from "@/lib/tracks";
import { deleteTrack, updateTrack } from "@/lib/tracks.functions";
import { useAuth } from "@/hooks/useAuth";

export type EditableTrack = {
  id: string;
  user_id?: string | null;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  audio_url: string;
  audio_type: string;
};

const inputCls =
  "h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60";

/** Edit + delete controls, rendered only for the track's owner. */
export function TrackOwnerActions({ track, compact = false }: { track: EditableTrack; compact?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(track.title);
  const [genre, setGenre] = useState(track.genre);
  const [prompt, setPrompt] = useState(track.prompt);
  const [lyrics] = useState(track.lyrics);

  if (!user || !track.user_id || user.id !== track.user_id) return null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tracks"] }),
      queryClient.invalidateQueries({ queryKey: ["public-artist"] }),
      queryClient.invalidateQueries({ queryKey: ["public-track"] }),
    ]);
  };

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError("Give your track a title.");
    if (!genre) return setError("Pick a genre.");
    setBusy(true);
    try {
      await updateTrack({
        data: {
          id: track.id,
          title: title.trim(),
          genre,
          prompt,
          lyrics,
          audio_url: track.audio_url,
          audio_type: "upload",
          is_published: true,
        },
      });
      await refresh();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteTrack({ data: { id: track.id } });
      await refresh();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this track.");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent " +
    (compact ? "h-7 w-7" : "h-8 w-8");

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button aria-label="Edit track" title="Edit track" onClick={() => setEditing(true)} className={btn}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="Delete track"
          title="Delete track"
          onClick={() => setConfirming(true)}
          className={btn + " hover:border-destructive/60 hover:text-destructive"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="glass-strong max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7">
            <header className="flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-bold">Edit track</h2>
              <button aria-label="Close" onClick={() => setEditing(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="mt-5 space-y-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Track title" className={inputCls} />
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                aria-label="Music Genre"
                className={inputCls}
              >
                {GENRES.filter((g) => g !== "All").map((g) => (
                  <option key={g} value={g} className="bg-[#0a0a0c]">
                    {g}
                  </option>
                ))}
              </select>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                aria-label="Style prompt"
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none focus:border-primary/60"
              />
              {error && <p className="text-center text-xs text-destructive">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={save}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-sm space-y-4 rounded-3xl p-6">
            <h2 className="font-display text-lg font-bold">Delete “{track.title}”?</h2>
            <p className="text-sm text-muted-foreground">This permanently removes the track and its audio file.</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={remove}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
