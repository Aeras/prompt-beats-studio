import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Copy, Loader2, Mail, MoreHorizontal, Share2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import {
  createTrackShareLink,
  listMyShareManagement,
  recordTrackPublicShare,
  updateTrackShareLink,
} from "@/lib/track-sharing.functions";

type Props = {
  trackId: string;
  ownerId: string;
  isPublished: boolean;
  promptIsPublic: boolean;
  lyricsIsPublic: boolean;
  trackTitle?: string;
  iconOnly?: boolean;
  compact?: boolean;
};

type ShareDestination = "whatsapp" | "facebook" | "messenger" | "viber" | "telegram" | "email";

function BrandBadge({ label }: { label: string }) {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-xs font-bold tracking-tight text-foreground shadow-inner shadow-white/5">
      {label}
    </span>
  );
}

export function ShareTrackButton({
  trackId,
  ownerId,
  isPublished,
  promptIsPublic,
  lyricsIsPublic,
  trackTitle,
  iconOnly = false,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const sharingAccess = useFeatureAccess("sharing_public_links");
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const isOwner = user?.id === ownerId;
  const [open, setOpen] = useState(false);
  const [includePrompt, setIncludePrompt] = useState(promptIsPublic);
  const [includeLyrics, setIncludeLyrics] = useState(lyricsIsPublic);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [optionBusy, setOptionBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startY: number; lastY: number; lastTime: number } | null>(null);

  const title = trackTitle?.trim() || (language === "el" ? "Τραγούδι στο PromptBeats" : "Song on PromptBeats");
  const shareText = language === "el" ? `Άκουσε το «${title}» στο PromptBeats` : `Listen to “${title}” on PromptBeats`;

  const invalidateSharedLinks = () =>
    queryClient.invalidateQueries({ queryKey: ["library", "shared-links"], exact: false });

  const recordShare = async () => {
    if (!user || isOwner) return;
    try {
      await recordTrackPublicShare({ data: { trackId } });
    } catch {
      // Sharing should still work if analytics recording fails.
    }
  };

  const prepareOwnerLink = async () => {
    setBusy(true);
    setError("");
    try {
      const management = await listMyShareManagement();
      const track = management.tracks.find((item) => item.track_id === trackId);
      const active = track?.owner_links.find((link) => !link.revoked_at);

      if (active) {
        const nextPrompt = active.include_prompt && promptIsPublic;
        const nextLyrics = active.include_lyrics && lyricsIsPublic;
        setShareId(active.id);
        setIncludePrompt(nextPrompt);
        setIncludeLyrics(nextLyrics);
        setShareUrl(`${window.location.origin}/share/${active.token}`);
        return;
      }

      if (!sharingAccess.allowed) {
        setError(language === "el" ? "Η δημιουργία νέων public links δεν είναι διαθέσιμη." : "Creating new public links is not available.");
        return;
      }

      const result = await createTrackShareLink({
        data: {
          trackId,
          includePrompt: promptIsPublic,
          includeLyrics: lyricsIsPublic,
        },
      });
      setShareId(result.id);
      setIncludePrompt(result.include_prompt && promptIsPublic);
      setIncludeLyrics(result.include_lyrics && lyricsIsPublic);
      setShareUrl(`${window.location.origin}/share/${result.token}`);
      await invalidateSharedLinks();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : language === "el"
            ? "Δεν ήταν δυνατή η προετοιμασία της κοινοποίησης."
            : "Could not prepare sharing.",
      );
    } finally {
      setBusy(false);
    }
  };

  const closeShareHub = () => {
    setDragY(0);
    setDragging(false);
    dragState.current = null;
    setOpen(false);
  };

  const startSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches) return;
    dragState.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !dragging) return;
    const delta = Math.max(0, event.clientY - dragState.current.startY);
    dragState.current.lastY = event.clientY;
    dragState.current.lastTime = performance.now();
    setDragY(delta);
  };

  const endSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - dragState.current.lastTime);
    const velocity = Math.max(0, (event.clientY - dragState.current.lastY) / elapsed);
    const shouldClose = dragY >= 90 || (dragY >= 45 && velocity >= 0.65);
    dragState.current = null;
    setDragging(false);
    if (shouldClose) {
      closeShareHub();
    } else {
      setDragY(0);
    }
  };

  const openShareHub = () => {
    setCopied(false);
    setError("");
    setDragY(0);
    setOpen(true);

    if (isOwner) {
      void prepareOwnerLink();
      return;
    }

    setShareId(null);
    setIncludePrompt(promptIsPublic);
    setIncludeLyrics(lyricsIsPublic);
    setShareUrl(`${window.location.origin}/track/${trackId}`);
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await recordShare();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(language === "el" ? "Δεν ήταν δυνατή η αντιγραφή του link." : "Could not copy the link.");
    }
  };

  const updateOwnerOption = async (kind: "prompt" | "lyrics", checked: boolean) => {
    if (!isOwner || !shareId || optionBusy) return;
    const previousPrompt = includePrompt;
    const previousLyrics = includeLyrics;
    const nextPrompt = kind === "prompt" ? checked : includePrompt;
    const nextLyrics = kind === "lyrics" ? checked : includeLyrics;

    setIncludePrompt(nextPrompt);
    setIncludeLyrics(nextLyrics);
    setOptionBusy(true);
    setError("");
    try {
      await updateTrackShareLink({
        data: {
          shareId,
          includePrompt: nextPrompt,
          includeLyrics: nextLyrics,
        },
      });
      await invalidateSharedLinks();
    } catch (err) {
      setIncludePrompt(previousPrompt);
      setIncludeLyrics(previousLyrics);
      setError(
        err instanceof Error
          ? err.message
          : language === "el"
            ? "Δεν ήταν δυνατή η ενημέρωση των επιλογών κοινοποίησης."
            : "Could not update sharing options.",
      );
    } finally {
      setOptionBusy(false);
    }
  };

  const openDestination = async (destination: ShareDestination) => {
    if (!shareUrl) return;
    await recordShare();

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const encodedCombined = encodeURIComponent(`${shareText} ${shareUrl}`);

    if (destination === "messenger") {
      window.location.href = `fb-messenger://share/?link=${encodedUrl}`;
      return;
    }
    if (destination === "viber") {
      window.location.href = `viber://forward?text=${encodedCombined}`;
      return;
    }

    const destinations: Record<Exclude<ShareDestination, "messenger" | "viber">, string> = {
      whatsapp: `https://wa.me/?text=${encodedCombined}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedCombined}`,
    };

    const target = destinations[destination];
    if (destination === "email") {
      window.location.href = target;
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    await recordShare();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const modal = open && typeof document !== "undefined" && createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-song-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeShareHub();
      }}
    >
      <div
        className="glass-strong w-full max-w-lg rounded-t-3xl p-5 sm:rounded-3xl sm:p-6"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex touch-none select-none items-start justify-between gap-3 sm:touch-auto sm:select-auto"
          onPointerDown={startSheetDrag}
          onPointerMove={moveSheetDrag}
          onPointerUp={endSheetDrag}
          onPointerCancel={endSheetDrag}
        >
          <div>
            <h2 id="share-song-title" className="font-display text-lg font-bold">
              {language === "el" ? "Κοινοποίηση τραγουδιού" : "Share song"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isOwner
                ? language === "el"
                  ? "Χρησιμοποίησε το διαχειριζόμενο link ή επίλεξε εφαρμογή."
                  : "Use the managed link or choose an app."
                : language === "el"
                  ? "Αντέγραψε το link ή επίλεξε πού θέλεις να το κοινοποιήσεις."
                  : "Copy the link or choose where to share it."}
            </p>
          </div>
          <button
            type="button"
            onClick={closeShareHub}
            aria-label={language === "el" ? "Κλείσιμο" : "Close"}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isPublished && isOwner && (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            {language === "el"
              ? "Το τραγούδι είναι Private. Το link θα ενημερώνει ότι ο δημιουργός το έκανε ιδιωτικό μέχρι να γίνει ξανά Public."
              : "This track is Private. The link will show that the creator made it private until it becomes Public again."}
          </p>
        )}

        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
            <div className="min-w-0 flex-1 px-2">
              <p className="truncate text-xs text-muted-foreground">
                {busy
                  ? language === "el"
                    ? "Προετοιμασία link..."
                    : "Preparing link..."
                  : shareUrl || (language === "el" ? "Το link δεν είναι διαθέσιμο" : "Link unavailable")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={busy || !shareUrl}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied
                ? language === "el"
                  ? "Αντιγράφηκε"
                  : "Copied"
                : language === "el"
                  ? "Αντιγραφή"
                  : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {language === "el" ? "Κοινοποίηση σε" : "Share to"}
          </p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("whatsapp")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <BrandBadge label="WA" />
              WhatsApp
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("facebook")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <BrandBadge label="f" />
              Facebook
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("messenger")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 sm:hidden">
              <BrandBadge label="M" />
              Messenger
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("viber")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 sm:hidden">
              <BrandBadge label="V" />
              Viber
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("telegram")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <BrandBadge label="TG" />
              Telegram
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void openDestination("email")} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground shadow-inner shadow-white/5"><Mail className="h-5 w-5" /></span>
              Email
            </button>
            <button type="button" disabled={busy || !shareUrl} onClick={() => void nativeShare()} className="flex flex-col items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <span className="grid h-11 w-11 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent shadow-inner shadow-white/5"><MoreHorizontal className="h-5 w-5" /></span>
              {language === "el" ? "Περισσότερα" : "More"}
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground sm:hidden">
            {language === "el"
              ? "Instagram, TikTok και άλλες εγκατεστημένες εφαρμογές εμφανίζονται από το «Περισσότερα», όταν το υποστηρίζει η συσκευή."
              : "Instagram, TikTok and other installed apps are available through “More” when supported by the device."}
          </p>
        </div>

        {isOwner && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {language === "el" ? "Περιεχόμενο του link" : "Link content"}
              </p>
              {optionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <span>
                  <span className="block text-sm font-medium">Prompt</span>
                  <span className="text-[11px] text-muted-foreground">
                    {promptIsPublic
                      ? language === "el"
                        ? "Επιτρέπεται από τις ρυθμίσεις του τραγουδιού"
                        : "Allowed by track settings"
                      : language === "el"
                        ? "Private στις ρυθμίσεις του τραγουδιού"
                        : "Private in track settings"}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={includePrompt}
                  disabled={!promptIsPublic || !shareId || busy || optionBusy}
                  onChange={(event) => void updateOwnerOption("prompt", event.target.checked)}
                  className="h-4 w-4 accent-current"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <span>
                  <span className="block text-sm font-medium">Lyrics</span>
                  <span className="text-[11px] text-muted-foreground">
                    {lyricsIsPublic
                      ? language === "el"
                        ? "Επιτρέπονται από τις ρυθμίσεις του τραγουδιού"
                        : "Allowed by track settings"
                      : language === "el"
                        ? "Private στις ρυθμίσεις του τραγουδιού"
                        : "Private in track settings"}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={includeLyrics}
                  disabled={!lyricsIsPublic || !shareId || busy || optionBusy}
                  onChange={(event) => void updateOwnerOption("lyrics", event.target.checked)}
                  className="h-4 w-4 accent-current"
                />
              </label>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        type="button"
        onClick={openShareHub}
        aria-label={language === "el" ? "Κοινοποίηση" : "Share"}
        className={iconOnly
          ? `grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent ${compact ? "h-7 w-7" : "h-8 w-8"}`
          : "inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"}
      >
        <Share2 className="h-4 w-4" />
        {!iconOnly && (language === "el" ? "Κοινοποίηση" : "Share")}
      </button>
      {modal}
    </>
  );
}
