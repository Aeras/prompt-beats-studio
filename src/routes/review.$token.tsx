import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, MessageSquareReply, Music2 } from "lucide-react";

import {
  addPrivateReviewComment,
  getPrivateReviewLinkInfo,
  getPrivateReviewSession,
  joinPrivateReviewSession,
} from "@/lib/private-review.functions";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/review/$token")({
  head: () => ({
    meta: [
      { title: "Private Review — PromptBeats" },
      { name: "description", content: "Private PromptBeats review session." },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: PrivateReviewPage,
});

function PrivateReviewPage() {
  const { token } = Route.useParams();
  const { language } = useI18n();
  const el = language === "el";
  const queryClient = useQueryClient();
  const storageKey = `pb:private-review:${token}`;
  const [reviewerKey, setReviewerKey] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [comment, setComment] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [songPanel, setSongPanel] = useState<"prompt" | "lyrics" | null>(null);

  useEffect(() => {
    try {
      setReviewerKey(window.localStorage.getItem(storageKey));
    } catch {
      setReviewerKey(null);
    }
  }, [storageKey]);

  const info = useQuery({
    queryKey: ["private-review-link-info", token],
    queryFn: () => getPrivateReviewLinkInfo({ data: { token } }),
    retry: false,
  });

  const session = useQuery({
    queryKey: ["private-review-session", token, reviewerKey],
    queryFn: () => getPrivateReviewSession({ data: { token, reviewerKey: reviewerKey! } }),
    enabled: Boolean(reviewerKey),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () =>
      joinPrivateReviewSession({ data: { token, displayName, pin: pin.trim() || null } }),
    onSuccess: (result) => {
      try {
        window.localStorage.setItem(storageKey, result.reviewer_key);
      } catch {
        // Private review credentials remain in memory when storage is unavailable.
      }
      setReviewerKey(result.reviewer_key);
    },
  });

  const post = useMutation({
    mutationFn: () =>
      addPrivateReviewComment({
        data: { token, reviewerKey: reviewerKey!, body: comment, parentCommentId: replyParentId },
      }),
    onSuccess: async () => {
      setComment("");
      setReplyParentId(null);
      await queryClient.invalidateQueries({ queryKey: ["private-review-session", token] });
    },
  });

  const data = session.data?.state === "active" ? session.data : null;
  const rootComments = useMemo(() => data?.comments ?? [], [data]);

  if (info.isLoading)
    return <ScreenMessage text={el ? "Φόρτωση review..." : "Loading review..."} loading />;
  if (info.isError || !info.data || info.data.state === "unavailable")
    return (
      <ScreenMessage
        text={el ? "Το review link δεν είναι διαθέσιμο." : "This review link is unavailable."}
      />
    );

  if (!reviewerKey) {
    if (info.data.state !== "active")
      return (
        <ScreenMessage
          text={
            info.data.state === "expired"
              ? el
                ? "Το review έχει λήξει."
                : "This review has expired."
              : el
                ? "Το review έχει κλείσει."
                : "This review has been closed."
          }
        />
      );
    return (
      <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
        <div className="glass-strong mx-auto max-w-lg rounded-3xl p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Private Review
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold">{info.data.project_name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {el
              ? "Δήλωσε ένα όνομα για να αφήσεις feedback."
              : "Enter a display name to leave feedback."}
          </p>
          <label className="mt-5 block text-xs font-semibold text-muted-foreground">
            {el ? "Όνομα" : "Display name"}
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
            maxLength={80}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"
          />
          {info.data.requires_pin && (
            <>
              <label className="mt-4 block text-xs font-semibold text-muted-foreground">PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 20))}
                maxLength={20}
                type="password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"
              />
            </>
          )}
          {join.error && (
            <p className="mt-3 text-xs text-red-400">
              {join.error instanceof Error ? join.error.message : "Error"}
            </p>
          )}
          <button
            type="button"
            disabled={
              !displayName.trim() || join.isPending || (info.data.requires_pin && pin.length < 4)
            }
            onClick={() => join.mutate()}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-bold text-accent disabled:opacity-40"
          >
            {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Άνοιγμα review" : "Open review"}
          </button>
        </div>
      </div>
    );
  }

  if (session.isLoading)
    return <ScreenMessage text={el ? "Φόρτωση review..." : "Loading review..."} loading />;
  if (session.data?.state === "expired" || session.data?.state === "closed")
    return (
      <ScreenMessage
        text={
          session.data.state === "expired"
            ? el
              ? "Το review έχει λήξει."
              : "This review has expired."
            : el
              ? "Το review έχει κλείσει."
              : "This review has been closed."
        }
      />
    );
  if (!data)
    return (
      <ScreenMessage
        text={el ? "Δεν ήταν δυνατή η φόρτωση του review." : "The review could not be loaded."}
      />
    );
  const isSongReview = data.sourceType === "track";
  const effectiveSongPanel =
    songPanel ?? (data.includePrompt ? "prompt" : data.includeLyrics ? "lyrics" : null);

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <section className="glass-strong rounded-3xl p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Private Review
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
                {data.snapshot.title || data.snapshot.projectName}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {isSongReview
                  ? el
                    ? "Song Review"
                    : "Song Review"
                  : `${data.snapshot.projectName} · ${data.snapshot.versionLabel || `V${data.snapshot.versionNumber ?? "?"}`}`}
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-muted-foreground">
              {data.commentVisibility === "shared"
                ? el
                  ? "Κοινό review"
                  : "Shared review"
                : el
                  ? "Ιδιωτικό feedback"
                  : "Private feedback"}
            </span>
          </div>
          {data.creatorMessage && (
            <div className="mt-4 rounded-2xl border border-accent/15 bg-accent/[0.035] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                {el ? "Μήνυμα δημιουργού" : "Creator note"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {data.creatorMessage}
              </p>
            </div>
          )}
        </section>

        {data.audio && (
          <section className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 text-accent" />
              <h2 className="font-display text-lg font-semibold">{data.audio.title}</h2>
            </div>
            {data.audio.coverUrl && (
              <img
                src={data.audio.coverUrl}
                alt=""
                className="mt-3 h-28 w-28 rounded-xl object-cover"
              />
            )}
            <audio controls src={data.audio.audioUrl} className="mt-4 w-full" />
          </section>
        )}

        {isSongReview ? (
          (data.includePrompt || data.includeLyrics) && (
            <section className="glass rounded-2xl p-5">
              <div className="flex flex-wrap gap-2">
                {data.includePrompt && (
                  <button
                    type="button"
                    onClick={() => setSongPanel("prompt")}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${effectiveSongPanel === "prompt" ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}
                  >
                    <FileText className="h-4 w-4" />
                    Prompt
                  </button>
                )}
                {data.includeLyrics && (
                  <button
                    type="button"
                    onClick={() => setSongPanel("lyrics")}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${effectiveSongPanel === "lyrics" ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}
                  >
                    <FileText className="h-4 w-4" />
                    Lyrics
                  </button>
                )}
              </div>
              {effectiveSongPanel === "prompt" && data.includePrompt && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
                  <h2 className="font-display text-lg font-semibold">Prompt</h2>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
                    {data.snapshot.prompt}
                  </pre>
                </div>
              )}
              {effectiveSongPanel === "lyrics" && data.includeLyrics && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
                  <h2 className="font-display text-lg font-semibold">Lyrics</h2>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7 text-muted-foreground">
                    {data.snapshot.lyrics}
                  </pre>
                </div>
              )}
            </section>
          )
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              {data.snapshot.tags && (
                <section className="glass rounded-2xl p-5">
                  <h2 className="font-display text-lg font-semibold">Music Style</h2>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 font-sans text-sm leading-6 text-muted-foreground">
                    {data.snapshot.tags}
                  </pre>
                </section>
              )}
              {data.snapshot.note && (
                <section className="glass rounded-2xl p-5">
                  <h2 className="font-display text-lg font-semibold">Producer&apos;s Note</h2>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 font-sans text-sm leading-6 text-muted-foreground">
                    {data.snapshot.note}
                  </pre>
                </section>
              )}
            </div>
            {data.snapshot.lyrics && (
              <section className="glass rounded-2xl p-5">
                <h2 className="font-display text-xl font-semibold">Lyrics</h2>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 font-sans text-sm leading-7 text-muted-foreground">
                  {data.snapshot.lyrics}
                </pre>
              </section>
            )}
          </>
        )}

        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{el ? "Σχόλια" : "Comments"}</h2>
            <span className="text-[10px] text-muted-foreground">{data.comments.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {rootComments.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{item.authorName}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString(el ? "el-GR" : "en-GB")}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setReplyParentId(item.id);
                    setComment("");
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-accent"
                >
                  <MessageSquareReply className="h-3 w-3" />
                  {el ? "Απάντηση" : "Reply"}
                </button>
              </div>
            ))}
            {rootComments.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted-foreground">
                {el ? "Δεν υπάρχουν σχόλια ακόμη." : "No comments yet."}
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-accent/15 p-3">
            {replyParentId && (
              <p className="mb-2 text-[10px] text-accent">
                {el ? "Απάντηση σε υπάρχον σχόλιο" : "Replying to a comment"}
              </p>
            )}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 2000))}
              rows={3}
              maxLength={2000}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 p-3 text-sm"
              placeholder={el ? "Γράψε το feedback σου..." : "Write your feedback..."}
            />
            {post.error && (
              <p className="mt-2 text-xs text-red-400">
                {post.error instanceof Error ? post.error.message : "Error"}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              {replyParentId && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyParentId(null);
                    setComment("");
                  }}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs"
                >
                  {el ? "Ακύρωση reply" : "Cancel reply"}
                </button>
              )}
              <button
                type="button"
                disabled={!comment.trim() || post.isPending}
                onClick={() => post.mutate()}
                className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
              >
                {post.isPending ? "…" : el ? "Αποστολή" : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ScreenMessage({ text, loading = false }: { text: string; loading?: boolean }) {
  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="glass mx-auto flex max-w-xl items-center justify-center gap-2 rounded-3xl p-8 text-center text-sm text-muted-foreground">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {text}
      </div>
    </div>
  );
}
