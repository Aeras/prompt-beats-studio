import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";

export type TrackContentKind = "prompt" | "lyrics";

type AnchorRect = Pick<DOMRect, "left" | "top" | "bottom" | "width">;

export function TrackContentOverlay({
  kind,
  content,
  anchorRect,
  onClose,
  onCopy,
  copied = false,
  returnFocusElement,
}: {
  kind: TrackContentKind;
  content: string;
  anchorRect: AnchorRect | null;
  onClose: () => void;
  onCopy?: () => void;
  copied?: boolean;
  returnFocusElement: HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusElement);
  const headingId = useId();

  useEffect(() => {
    returnFocusRef.current = returnFocusElement;
  }, [returnFocusElement]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex].focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [kind]);

  useEffect(() => () => {
    const trigger = returnFocusRef.current;
    if (trigger?.isConnected) trigger.focus();
  }, []);

  if (typeof document === "undefined") return null;

  const panelWidth = Math.min(anchorRect?.width ?? 360, window.innerWidth - 32);
  const left = Math.min(Math.max(16, anchorRect?.left ?? 16), window.innerWidth - panelWidth - 16);
  const top = Math.max(16, Math.min(Math.max(16, (anchorRect?.bottom ?? 16) + 8), Math.max(16, window.innerHeight - 420)));
  const heading = kind === "prompt" ? "Prompt" : "Lyrics";
  const isMobile = window.innerWidth < 640;

  const panel = (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} className="glass-strong flex max-h-[min(70vh,26rem)] flex-col rounded-2xl border border-white/15 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 id={headingId} className="font-display text-sm font-semibold">{heading}</h2>
        <div className="flex items-center gap-2">
          {kind === "prompt" && onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${heading.toLowerCase()}`}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div tabIndex={0} aria-label={`${heading} content`} className="min-h-0 overflow-y-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-muted-foreground">{content}</pre>
      </div>
    </div>
  );

  return createPortal(
    <>
      <button type="button" tabIndex={-1} aria-label="Close track content" className="fixed inset-0 z-[90] cursor-default bg-black/25 sm:bg-transparent" onClick={onClose} />
      {isMobile ? (
        <div className="fixed inset-x-3 bottom-0 z-[100] max-h-[85dvh]">{panel}</div>
      ) : (
        <div className="fixed z-[100]" style={{ width: panelWidth, left, top }}>{panel}</div>
      )}
    </>,
    document.body,
  );
}
