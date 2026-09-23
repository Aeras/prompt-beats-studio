import { useMemo, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageSquareReply, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPrivateReviewCreatorReply,
  closePrivateReviewSession,
  createPrivateReviewSession,
  getMyPrivateReviewSession,
  listMyPrivateReviewSessions,
} from "@/lib/private-review.functions";
import { privateReviewExpiryDate, privateReviewUrl } from "@/lib/private-review.shared";
import { listProjectVersionLinkedTracks } from "@/lib/project-version-tracks.functions";

type VersionOption = {
  id: string;
  version_number: number | null;
  version_label: string | null;
};

type Props = {
  projectId: string;
  projectName: string;
  versions: VersionOption[];
  language: string;
  onClose: () => void;
};

export function PrivateReviewManager({ projectId, projectName, versions, language, onClose }: Props) {
  const el = language === "el";
  const queryClient = useQueryClient();
  const latest = versions.at(-1);
  const [versionId, setVersionId] = useState(latest?.id ?? "");
  const [creatorMessage, setCreatorMessage] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [expiryDays, setExpiryDays] = useState(7);
  const [pin, setPin] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [trackId, setTrackId] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reviewerFilter, setReviewerFilter] = useState<string>("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const sessions = useQuery({
    queryKey: ["private-review-sessions", projectId],
    queryFn: () => listMyPrivateReviewSessions({ data: { projectId } }),
  });

  const linkedTracks = useQuery({
    queryKey: ["private-review-linked-tracks", projectId, versionId],
    queryFn: () => listProjectVersionLinkedTracks({ data: { projectId, versionId } }),
    enabled: Boolean(versionId && includeAudio),
  });

  const ownerSession = useQuery({
    queryKey: ["private-review-owner-session", selectedSessionId, reviewerFilter],
    queryFn: () => getMyPrivateReviewSession({ data: { sessionId: selectedSessionId!, reviewerId: reviewerFilter || null } }),
    enabled: Boolean(selectedSessionId),
  });

  const createMutation = useMutation({
    mutationFn: () => createPrivateReviewSession({
      data: {
        projectId,
        versionPromptId: versionId,
        creatorMessage,
        commentVisibility: visibility,
        expiresAt: privateReviewExpiryDate(expiryDays),
        pin: pin.trim() || null,
        sharedTrackId: includeAudio ? trackId || null : null,
      },
    }),
    onSuccess: async (result) => {
      setCreatedToken(result.token);
      await queryClient.invalidateQueries({ queryKey: ["private-review-sessions", projectId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (sessionId: string) => closePrivateReviewSession({ data: { sessionId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["private-review-sessions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["private-review-owner-session"], exact: false }),
      ]);
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => addPrivateReviewCreatorReply({ data: { sessionId: selectedSessionId!, parentCommentId: replyParentId!, body: replyBody } }),
    onSuccess: async () => {
      setReplyBody("");
      setReplyParentId(null);
      await queryClient.invalidateQueries({ queryKey: ["private-review-owner-session"], exact: false });
    },
  });

  const tracks = linkedTracks.data?.tracks ?? [];
  const availableTracks = tracks.filter((track) => !track.unavailable && track.audio_url);
  const selectedVersionLabel = useMemo(() => {
    const index = versions.findIndex((version) => version.id === versionId);
    const version = versions[index];
    return version?.version_label || `V${version?.version_number ?? index + 1}`;
  }, [versions, versionId]);

  const copyCreatedLink = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(privateReviewUrl(createdToken));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0c0c10] p-4 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Private Review Link</p>
            <h2 className="mt-1 font-display text-xl font-bold">{projectName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{el ? "Προσωρινό, περιορισμένο review συγκεκριμένης έκδοσης." : "Temporary, limited review of a specific version."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold">{el ? "Νέο review" : "New review"}</h3>

            <label className="mt-4 block text-[11px] font-semibold text-muted-foreground">{el ? "Έκδοση" : "Version"}</label>
            <select value={versionId} onChange={(e) => { setVersionId(e.target.value); setTrackId(""); }} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
              {versions.map((version, index) => <option key={version.id} value={version.id}>{version.version_label || `V${version.version_number ?? index + 1}`}</option>)}
            </select>

            <label className="mt-4 block text-[11px] font-semibold text-muted-foreground">{el ? "Τι feedback ζητάς; (προαιρετικό)" : "What feedback do you want? (optional)"}</label>
            <textarea value={creatorMessage} onChange={(e) => setCreatorMessage(e.target.value.slice(0,1000))} rows={3} maxLength={1000} className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />

            <div className="mt-4">
              <p className="text-[11px] font-semibold text-muted-foreground">{el ? "Ορατότητα σχολίων" : "Comment visibility"}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setVisibility("shared")} className={`rounded-xl border p-3 text-left text-xs ${visibility === "shared" ? "border-accent/50 bg-accent/10" : "border-white/10"}`}>
                  <span className="font-semibold">{el ? "Κοινό review" : "Shared review"}</span>
                  <span className="mt-1 block text-muted-foreground">{el ? "Οι reviewers βλέπουν τα σχόλια των άλλων." : "Reviewers can see each other's comments."}</span>
                </button>
                <button type="button" onClick={() => setVisibility("private")} className={`rounded-xl border p-3 text-left text-xs ${visibility === "private" ? "border-accent/50 bg-accent/10" : "border-white/10"}`}>
                  <span className="font-semibold">{el ? "Ιδιωτικό feedback" : "Private feedback"}</span>
                  <span className="mt-1 block text-muted-foreground">{el ? "Κάθε reviewer βλέπει μόνο το δικό του thread." : "Each reviewer sees only their own thread."}</span>
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{el ? "Η επιλογή κλειδώνει με τη δημιουργία του link." : "This choice is locked when the link is created."}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-muted-foreground">{el ? "Διάρκεια" : "Duration"}
                <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
                  <option value={1}>1 {el ? "ημέρα" : "day"}</option>
                  <option value={3}>3 {el ? "ημέρες" : "days"}</option>
                  <option value={7}>7 {el ? "ημέρες" : "days"}</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">PIN ({el ? "προαιρετικό" : "optional"})
                <input value={pin} onChange={(e) => setPin(e.target.value.slice(0,20))} minLength={4} maxLength={20} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm" placeholder="••••" />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={includeAudio} onChange={(e) => { setIncludeAudio(e.target.checked); if (!e.target.checked) setTrackId(""); }} />
              {el ? "Συμπερίληψη audio" : "Include audio"}
            </label>
            {includeAudio && (
              <div className="mt-2">
                {linkedTracks.isLoading ? <p className="text-xs text-muted-foreground">{el ? "Φόρτωση συνδεδεμένων tracks..." : "Loading linked tracks..."}</p> : (
                  <select value={trackId} onChange={(e) => setTrackId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
                    <option value="">{el ? "Επίλεξε συγκεκριμένο linked track" : "Select a specific linked track"}</option>
                    {availableTracks.map((track) => <option key={track.track_id} value={track.track_id}>{track.is_primary ? "★ " : ""}{track.title}</option>)}
                  </select>
                )}
                {!linkedTracks.isLoading && availableTracks.length === 0 && <p className="mt-1 text-[10px] text-amber-300">{el ? "Η έκδοση δεν έχει διαθέσιμο linked audio." : "This version has no available linked audio."}</p>}
              </div>
            )}

            {createMutation.error && <p className="mt-3 text-xs text-red-400">{createMutation.error instanceof Error ? createMutation.error.message : "Error"}</p>}
            <button type="button" disabled={!versionId || createMutation.isPending || (includeAudio && !trackId)} onClick={() => createMutation.mutate()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-bold text-accent disabled:opacity-40">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {el ? `Δημιουργία link για ${selectedVersionLabel}` : `Create link for ${selectedVersionLabel}`}
            </button>

            {createdToken && (
              <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{el ? "Το link δημιουργήθηκε" : "Link created"}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{privateReviewUrl(createdToken)}</p>
                <button type="button" onClick={copyCreatedLink} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? (el ? "Αντιγράφηκε" : "Copied") : (el ? "Αντιγραφή" : "Copy")}
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold">{el ? "Review sessions" : "Review sessions"}</h3>
            {sessions.isLoading && <p className="mt-3 text-xs text-muted-foreground">{el ? "Φόρτωση..." : "Loading..."}</p>}
            <div className="mt-3 space-y-2">
              {(sessions.data ?? []).map((session) => (
                <div key={session.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => { setSelectedSessionId(session.id); setReviewerFilter(""); }} className="min-w-0 text-left">
                      <p className="text-xs font-semibold">{session.versionLabel || `V${session.versionNumber ?? "?"}`}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{session.reviewerCount} reviewers · {session.commentCount} comments · {session.state}</p>
                    </button>
                    {session.state === "active" && <button type="button" onClick={() => closeMutation.mutate(session.id)} disabled={closeMutation.isPending} className="rounded-lg border border-red-400/20 px-2 py-1 text-[10px] text-red-300">{el ? "Κλείσιμο" : "Close"}</button>}
                  </div>
                </div>
              ))}
              {!sessions.isLoading && (sessions.data ?? []).length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">{el ? "Δεν υπάρχουν review links ακόμη." : "No review links yet."}</p>}
            </div>
          </section>
        </div>

        {selectedSessionId && ownerSession.data && (
          <section className="mt-5 rounded-2xl border border-accent/20 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{el ? "Feedback" : "Feedback"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{ownerSession.data.reviewers.length} reviewers · {ownerSession.data.comments.length} {el ? "ορατά σχόλια" : "visible comments"}</p>
              </div>
              <select value={reviewerFilter} onChange={(e) => setReviewerFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
                <option value="">{el ? "Όλοι οι reviewers" : "All reviewers"}</option>
                {ownerSession.data.reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} ({reviewer.commentCount ?? 0})</option>)}
              </select>
            </div>

            <div className="mt-4 space-y-2">
              {ownerSession.data.comments.map((comment) => (
                <div key={comment.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold">{comment.authorName}{comment.threadReviewerName && comment.authorType === "creator" ? ` → ${comment.threadReviewerName}` : ""}</p>
                    <p className="text-[9px] text-muted-foreground">{new Date(comment.createdAt).toLocaleString(el ? "el-GR" : "en-GB")}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{comment.body}</p>
                  {ownerSession.data.state === "active" && <button type="button" onClick={() => { setReplyParentId(comment.id); setReplyBody(""); }} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-accent"><MessageSquareReply className="h-3 w-3" />{el ? "Απάντηση" : "Reply"}</button>}
                </div>
              ))}
              {ownerSession.data.comments.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">{el ? "Δεν υπάρχουν σχόλια για αυτό το φίλτρο." : "No comments for this filter."}</p>}
            </div>

            {replyParentId && (
              <div className="mt-3 rounded-xl border border-accent/20 p-3">
                <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value.slice(0,2000))} rows={2} maxLength={2000} className="w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs" placeholder={el ? "Απάντηση στον reviewer..." : "Reply to reviewer..."} />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => { setReplyParentId(null); setReplyBody(""); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">{el ? "Ακύρωση" : "Cancel"}</button>
                  <button type="button" disabled={!replyBody.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate()} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40">{replyMutation.isPending ? "…" : (el ? "Αποστολή" : "Send")}</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
