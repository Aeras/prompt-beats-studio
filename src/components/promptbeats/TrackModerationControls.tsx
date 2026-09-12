import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useModeration } from "@/hooks/useModeration";
import {
  TRACK_MODERATION_REASONS,
  deleteStaffTrack,
  getStaffTrack,
  lockStaffTrack,
  unlockStaffTrack,
} from "@/lib/track-moderation.functions";

type Action = "lock" | "unlock" | "delete" | null;

export function TrackModerationControls({ trackId }: { trackId: string }) {
  const moderation = useModeration();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);
  const [reasonCode, setReasonCode] = useState<(typeof TRACK_MODERATION_REASONS)[number]["code"] | "">("");
  const [reasonText, setReasonText] = useState("");
  const enabled = moderation.canLockTracks;
  const {
    data: track,
    isLoading: isTrackLoading,
    isError: isTrackError,
    error: trackError,
  } = useQuery({
    queryKey: ["staff-track", trackId],
    queryFn: () => getStaffTrack({ data: { trackId } }),
    enabled,
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (moderation.isError && moderation.canLockTracks) {
      console.error("[TrackModerationControls] moderation context failed", moderation.error);
    }
    if (isTrackError) {
      console.error("[TrackModerationControls] staff track fetch failed", trackError);
    }
  }, [isTrackError, moderation.canLockTracks, moderation.error, moderation.isError, trackError]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tracks"] });
    void queryClient.invalidateQueries({ queryKey: ["public-track", trackId] });
    void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["public-artist"] });
    void queryClient.invalidateQueries({ queryKey: ["staff-track", trackId] });
  };

  const lock = useMutation({
    mutationFn: () => lockStaffTrack({ data: { trackId, reasonCode: reasonCode as (typeof TRACK_MODERATION_REASONS)[number]["code"], reasonText } }),
    onSuccess: () => { toast.success("Track locked for review"); setAction(null); setReasonCode(""); setReasonText(""); refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not lock track"),
  });
  const unlock = useMutation({
    mutationFn: () => unlockStaffTrack({ data: { trackId } }),
    onSuccess: () => { toast.success("Track unlocked"); setAction(null); refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not unlock track"),
  });
  const remove = useMutation({
    mutationFn: () => deleteStaffTrack({ data: { trackId } }),
    onSuccess: () => { toast.success("Track permanently deleted"); setAction(null); refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete track"),
  });

  if (!enabled) return null;
  if (moderation.isLoading) return null;
  if (moderation.isError) {
    return <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">Track moderation could not be loaded.</p>;
  }
  if (isTrackLoading) return null;
  if (isTrackError) {
    return <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">Track moderation could not be loaded.</p>;
  }
  if (!track) return null;
  const busy = lock.isPending || unlock.isPending || remove.isPending;
  const locked = track.moderation_status === "locked";
  const validReason = Boolean(reasonCode) && (reasonCode !== "other" || Boolean(reasonText.trim()));

  return (
    <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Staff track moderation</div>
        <span className={locked ? "text-xs text-amber-200" : "text-xs text-emerald-300"}>{locked ? "Locked for review" : "Active"}</span>
      </div>
      {locked && <p className="mt-2 text-xs text-muted-foreground">This track is hidden from normal public discovery while it is under review.</p>}
      <details className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
        <summary className="cursor-pointer text-xs text-primary">Inspect track content</summary>
        <p className="mt-3 text-sm font-semibold">{track.title}</p>
        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{track.prompt || "No prompt provided."}</p>
        {track.lyrics && <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{track.lyrics}</pre>}
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        {locked ? (
          <button disabled={busy} onClick={() => setAction("unlock")} className="rounded-xl border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-50">Unlock track</button>
        ) : (
          <button disabled={busy} onClick={() => setAction("lock")} className="rounded-xl border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50">Lock for review</button>
        )}
        {moderation.canDeleteTracks && track.can_delete_track === true && <button disabled={busy} onClick={() => setAction("delete")} className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete permanently</button>}
      </div>

      {action && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" className="glass-strong w-full max-w-md rounded-3xl p-6">
          <AlertTriangle className="h-6 w-6 text-amber-300" />
          <h2 className="mt-3 font-display text-lg font-bold">{action === "lock" ? "Lock track for review?" : action === "unlock" ? "Unlock this track?" : "Delete this track permanently?"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{action === "lock" ? "The track will be hidden from normal public discovery until staff unlocks it." : action === "unlock" ? "The track will become available again without changing the creator's visibility setting." : "This cannot be undone and removes the track record."}</p>
          {action === "lock" && <div className="mt-4 space-y-2"><label className="text-xs text-muted-foreground">Reason<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"><option value="">Select a reason</option>{TRACK_MODERATION_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></label>{reasonCode === "other" && <textarea value={reasonText} onChange={(event) => setReasonText(event.target.value)} maxLength={500} placeholder="Enter the reason" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm" />}</div>}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button disabled={busy} onClick={() => setAction(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground">Cancel</button>
            <button disabled={busy || (action === "lock" && !validReason)} onClick={() => action === "lock" ? lock.mutate() : action === "unlock" ? unlock.mutate() : remove.mutate()} className={action === "delete" ? "rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50" : "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"}>{busy ? "Working…" : action === "lock" ? "Confirm lock" : action === "unlock" ? "Confirm unlock" : "Delete permanently"}</button>
          </div>
        </div>
      </div>}
    </section>
  );
}
