import { useRef } from "react";
import { Copy, FolderInput, Pencil, Trash2, X } from "lucide-react";

type PointerPoint = { x: number; y: number };

export function useLibraryLongPress(onLongPress: () => void, disabled = false) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<PointerPoint | null>(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (disabled || event.pointerType === "mouse") return;
      firedRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        onLongPress();
        if ("vibrate" in navigator) navigator.vibrate?.(12);
        clear();
      }, 550);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture: (event: React.MouseEvent) => {
      if (!firedRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      firedRef.current = false;
    },
  };
}

type Props = {
  open: boolean;
  language: string;
  title: string;
  canDuplicate?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  onMove: () => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function LibraryItemActionSheet({
  open,
  language,
  title,
  canDuplicate = false,
  canRename = true,
  canDelete = true,
  onMove,
  onDuplicate,
  onRename,
  onDelete,
  onClose,
}: Props) {
  if (!open) return null;
  const el = language === "el";

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end bg-black/70 backdrop-blur-sm sm:hidden" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={el ? "Ενέργειες στοιχείου" : "Item actions"}
        className="glass-strong w-full rounded-t-3xl border border-white/10 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{el ? "Ενέργειες" : "Actions"}</p>
            <h3 className="mt-1 truncate font-display text-base font-bold">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-muted-foreground" aria-label={el ? "Κλείσιμο" : "Close"}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
          <button type="button" onClick={() => run(onMove)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold">
            <FolderInput className="h-4 w-4 text-accent" />{el ? "Μετακίνηση σε φάκελο" : "Move to folder"}
          </button>
          {canDuplicate && onDuplicate && <button type="button" onClick={() => run(onDuplicate)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold">
            <Copy className="h-4 w-4 text-accent" />{el ? "Δημιουργία αντιγράφου" : "Duplicate"}
          </button>}
          {canRename && onRename && <button type="button" onClick={() => run(onRename)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold">
            <Pencil className="h-4 w-4 text-accent" />{el ? "Μετονομασία" : "Rename"}
          </button>}
          {canDelete && onDelete && <button type="button" onClick={() => run(onDelete)} className="flex w-full items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/[0.04] px-4 py-3 text-left text-sm font-semibold text-red-300">
            <Trash2 className="h-4 w-4" />{el ? "Διαγραφή" : "Delete"}
          </button>}
        </div>
      </section>
    </div>
  );
}
