import { useEffect, useRef, useState } from "react";
import { Copy, FolderInput, FolderX, Loader2, X } from "lucide-react";

import type { LibraryActionMenuAnchor } from "./LibraryItemActionSheet";

type ProjectOption = { id: string; name: string };
type TransferMode = "copy" | "move" | null;

type Props = {
  open: boolean;
  anchor: LibraryActionMenuAnchor | null;
  language: string;
  title: string;
  currentProjectId: string | null;
  projects: ProjectOption[];
  busy: boolean;
  onClose: () => void;
  onDetach: () => Promise<void> | void;
  onCopy: (destinationProjectId: string) => Promise<void> | void;
  onMove: (destinationProjectId: string) => Promise<void> | void;
};

export function ProjectPromptActionMenu({
  open,
  anchor,
  language,
  title,
  currentProjectId,
  projects,
  busy,
  onClose,
  onDetach,
  onCopy,
  onMove,
}: Props) {
  const el = language === "el";
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<LibraryActionMenuAnchor>({ x: 12, y: 12 });
  const [transferMode, setTransferMode] = useState<TransferMode>(null);
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const availableProjects = projects.filter((project) => project.id !== currentProjectId);

  useEffect(() => {
    if (!open || !anchor || typeof window === "undefined") return;
    const width = 270;
    const estimatedHeight = 220;
    setPosition({
      x: Math.max(12, Math.min(anchor.x, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(anchor.y, window.innerHeight - estimatedHeight - 12)),
    });
  }, [anchor, open]);

  useEffect(() => {
    if (open) return;
    if (!transferMode) setDestinationProjectId("");
  }, [open, transferMode]);

  useEffect(() => {
    if (!open && !transferMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (transferMode) {
        setTransferMode(null);
        setDestinationProjectId("");
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, transferMode]);

  const beginTransfer = (mode: Exclude<TransferMode, null>) => {
    setTransferMode(mode);
    setDestinationProjectId(availableProjects[0]?.id ?? "");
    onClose();
  };

  const detach = async () => {
    if (
      !window.confirm(
        el
          ? "Να αφαιρεθεί αυτό το prompt από το Project; Θα παραμείνει αποθηκευμένο ως ανεξάρτητο prompt χωρίς version number."
          : "Remove this prompt from the Project? It will remain saved as a standalone prompt without a version number.",
      )
    )
      return;
    await onDetach();
  };

  const confirmTransfer = async () => {
    if (!transferMode || !destinationProjectId || busy) return;
    if (transferMode === "copy") await onCopy(destinationProjectId);
    else await onMove(destinationProjectId);
    setTransferMode(null);
    setDestinationProjectId("");
  };

  return (
    <>
      {open && anchor && (
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
            className="glass-strong fixed z-[95] w-[270px] overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-1.5 shadow-2xl backdrop-blur-xl"
            style={{ left: position.x, top: position.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="truncate px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              {title}
            </p>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void detach()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none disabled:opacity-50"
            >
              <FolderX className="h-4 w-4 text-accent" />
              {el ? "Αφαίρεση από το Project" : "Remove from Project"}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy || availableProjects.length === 0}
              onClick={() => beginTransfer("copy")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none disabled:opacity-40"
            >
              <Copy className="h-4 w-4 text-accent" />
              {el ? "Αντιγραφή σε άλλο Project" : "Copy to another Project"}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy || availableProjects.length === 0}
              onClick={() => beginTransfer("move")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none disabled:opacity-40"
            >
              <FolderInput className="h-4 w-4 text-accent" />
              {el ? "Μετακίνηση σε άλλο Project" : "Move to another Project"}
            </button>
            {availableProjects.length === 0 && (
              <p className="px-3 pb-2 pt-1 text-[10px] text-muted-foreground">
                {el
                  ? "Δεν υπάρχει άλλο Project διαθέσιμο για αντιγραφή ή μετακίνηση."
                  : "There is no other Project available for copy or move."}
              </p>
            )}
          </div>
        </>
      )}

      {transferMode && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
          <button
            type="button"
            aria-label={el ? "Κλείσιμο" : "Close"}
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (busy) return;
              setTransferMode(null);
              setDestinationProjectId("");
            }}
          />
          <div className="glass-strong relative z-[111] w-full max-w-md rounded-2xl border border-white/10 bg-background p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold">
                  {transferMode === "copy"
                    ? el
                      ? "Αντιγραφή σε άλλο Project"
                      : "Copy to another Project"
                    : el
                      ? "Μετακίνηση σε άλλο Project"
                      : "Move to another Project"}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">{title}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setTransferMode(null);
                  setDestinationProjectId("");
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              {el ? "Project προορισμού" : "Destination Project"}
              <select
                value={destinationProjectId}
                onChange={(event) => setDestinationProjectId(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
              >
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              {transferMode === "copy"
                ? el
                  ? "Το αρχικό prompt θα παραμείνει στο τωρινό Project. Το αντίγραφο θα πάρει το επόμενο νέο version number στο Project προορισμού."
                  : "The original prompt stays in the current Project. The copy receives the next new version number in the destination Project."
                : el
                  ? "Το prompt θα φύγει από το τωρινό Project και θα πάρει το επόμενο νέο version number στο Project προορισμού. Τα υπόλοιπα version numbers του αρχικού Project δεν αλλάζουν."
                  : "The prompt leaves the current Project and receives the next new version number in the destination Project. Existing source version numbers are not renumbered."}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setTransferMode(null);
                  setDestinationProjectId("");
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {el ? "Ακύρωση" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={busy || !destinationProjectId}
                onClick={() => void confirmTransfer()}
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {transferMode === "copy"
                  ? el
                    ? "Αντιγραφή"
                    : "Copy"
                  : el
                    ? "Μετακίνηση"
                    : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
