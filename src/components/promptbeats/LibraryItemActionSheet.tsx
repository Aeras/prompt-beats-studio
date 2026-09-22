import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Copy, FolderInput, Pencil, Trash2 } from "lucide-react";

export type LibraryActionMenuAnchor = { x: number; y: number };
type PointerPoint = { x: number; y: number };

export function useLibraryLongPress(onLongPress: (point: PointerPoint) => void, disabled = false) {
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
    onPointerDown: (event: PointerEvent) => {
      if (disabled || event.pointerType === "mouse") return;
      firedRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        const point = startRef.current;
        if (!point) return;
        firedRef.current = true;
        onLongPress(point);
        if ("vibrate" in navigator) navigator.vibrate?.(12);
        clear();
      }, 550);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture: (event: MouseEvent) => {
      if (!firedRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      firedRef.current = false;
    },
  };
}

type LongPressButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  onLongPress: (point: PointerPoint) => void;
};

export function LibraryLongPressButton({ children, onLongPress, ...props }: LongPressButtonProps) {
  const longPress = useLibraryLongPress(onLongPress, props.disabled === true);
  return <button type="button" {...props} {...longPress}>{children}</button>;
}

type Props = {
  open: boolean;
  language: string;
  title: string;
  anchor: LibraryActionMenuAnchor | null;
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
  anchor,
  canDuplicate = false,
  canRename = true,
  canDelete = true,
  onMove,
  onDuplicate,
  onRename,
  onDelete,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<LibraryActionMenuAnchor>({ x: 12, y: 12 });
  const el = language === "el";

  useEffect(() => {
    if (!open || !anchor || typeof window === "undefined") return;
    const width = 238;
    const estimatedHeight = 250;
    setPosition({
      x: Math.max(12, Math.min(anchor.x, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(anchor.y, window.innerHeight - estimatedHeight - 12)),
    });
  }, [anchor, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || !anchor) return null;

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <>
      <button
        type="button"
        aria-label={el ? "Κλείσιμο μενού" : "Close menu"}
        className="fixed inset-0 z-[94] cursor-default bg-transparent"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={el ? `Ενέργειες για ${title}` : `Actions for ${title}`}
        className="glass-strong fixed z-[95] w-[238px] overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-1.5 shadow-2xl backdrop-blur-xl"
        style={{ left: position.x, top: position.y }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="truncate px-3 py-2 text-[11px] font-semibold text-muted-foreground">{title}</p>
        <button type="button" role="menuitem" onClick={() => run(onMove)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none">
          <FolderInput className="h-4 w-4 text-accent" />{el ? "Μετακίνηση σε φάκελο" : "Move to folder"}
        </button>
        {canDuplicate && onDuplicate && <button type="button" role="menuitem" onClick={() => run(onDuplicate)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none">
          <Copy className="h-4 w-4 text-accent" />{el ? "Δημιουργία αντιγράφου" : "Duplicate"}
        </button>}
        {canRename && onRename && <button type="button" role="menuitem" onClick={() => run(onRename)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none">
          <Pencil className="h-4 w-4 text-accent" />{el ? "Μετονομασία" : "Rename"}
        </button>}
        {canDelete && onDelete && <button type="button" role="menuitem" onClick={() => run(onDelete)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-300 hover:bg-red-500/[0.08] focus:bg-red-500/[0.08] focus:outline-none">
          <Trash2 className="h-4 w-4" />{el ? "Διαγραφή" : "Delete"}
        </button>}
      </div>
    </>
  );
}
