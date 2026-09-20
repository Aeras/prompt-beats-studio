import { useState } from "react";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import {
  createTrackShareLink,
  recordTrackPublicShare,
} from "@/lib/track-sharing.functions";

type Props = {
  trackId: string;
  ownerId: string;
  isPublished: boolean;
  promptIsPublic: boolean;
  lyricsIsPublic: boolean;
};

export function ShareTrackButton({
  trackId,
  ownerId,
  isPublished,
  promptIsPublic,
  lyricsIsPublic,
}: Props) {
  const { user } = useAuth();
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const isOwner = user?.id === ownerId;
  const [open, setOpen] = useState(false);
  const [includePrompt, setIncludePrompt] = useState(promptIsPublic);
  const [includeLyrics, setIncludeLyrics] = useState(lyricsIsPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const copyPublic = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (user && !isOwner) await recordTrackPublicShare({ data: { trackId } });
    } catch {
      // Sharing should still work if analytics recording fails.
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // Fall through to clipboard when native share is cancelled/unavailable.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const createOwnerLink = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createTrackShareLink({
        data: { trackId, includePrompt, includeLyrics },
      });
      const url = `${window.location.origin}/share/${result.token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      await queryClient.invalidateQueries({ queryKey: ["library", "shared-links"], exact: false });
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "el" ? "Η δημιουργία link απέτυχε." : "Could not create share link."));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner) {
    return (
      <button
        type="button"
        onClick={copyPublic}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        {copied ? (language === "el" ? "Αντιγράφηκε" : "Copied") : (language === "el" ? "Κοινοποίηση" : "Share")}
      </button>
    );
  }

  const modal = open && typeof document !== "undefined" && createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="glass-strong w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">{language === "el" ? "Κοινοποίηση τραγουδιού" : "Share song"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {language === "el" ? "Δημιούργησε διαχειριζόμενο link κοινοποίησης." : "Create a managed share link."}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>

        {!isPublished && (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            {language === "el"
              ? "Το τραγούδι είναι Private. Το link θα ενημερώνει ότι ο δημιουργός το έκανε ιδιωτικό μέχρι να γίνει ξανά Public."
              : "This track is Private. The link will show that the creator made it private until it becomes Public again."}
          </p>
        )}

        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
            <span><span className="block text-sm font-medium">Prompt</span><span className="text-[11px] text-muted-foreground">{promptIsPublic ? (language === "el" ? "Επιτρέπεται από τις ρυθμίσεις του τραγουδιού" : "Allowed by track settings") : (language === "el" ? "Private στις ρυθμίσεις του τραγουδιού" : "Private in track settings")}</span></span>
            <input type="checkbox" checked={includePrompt} disabled={!promptIsPublic} onChange={(e) => setIncludePrompt(e.target.checked)} className="h-4 w-4 accent-current" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
            <span><span className="block text-sm font-medium">Lyrics</span><span className="text-[11px] text-muted-foreground">{lyricsIsPublic ? (language === "el" ? "Επιτρέπονται από τις ρυθμίσεις του τραγουδιού" : "Allowed by track settings") : (language === "el" ? "Private στις ρυθμίσεις του τραγουδιού" : "Private in track settings")}</span></span>
            <input type="checkbox" checked={includeLyrics} disabled={!lyricsIsPublic} onChange={(e) => setIncludeLyrics(e.target.checked)} className="h-4 w-4 accent-current" />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        <button type="button" onClick={createOwnerLink} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {busy ? (language === "el" ? "Δημιουργία..." : "Creating...") : copied ? (language === "el" ? "Link αντιγράφηκε" : "Link copied") : (language === "el" ? "Δημιουργία & αντιγραφή link" : "Create & copy link")}
        </button>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIncludePrompt(promptIsPublic);
          setIncludeLyrics(lyricsIsPublic);
          setError("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
      >
        <Share2 className="h-4 w-4" />
        {language === "el" ? "Κοινοποίηση" : "Share"}
      </button>
      {modal}
    </>
  );
}
