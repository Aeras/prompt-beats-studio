import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CopyCheck, Trash2 } from "lucide-react";

import { useI18n } from "@/i18n";
import {
  applyInstructionToAllRegularChoruses,
  updateArrangementInstruction,
  type ArrangementSection,
} from "@/lib/song-arrangement.shared";
import { cn } from "@/lib/utils";

type Props = {
  sections: ArrangementSection[];
  onChange: (next: ArrangementSection[]) => void;
  labelForSection: (value: string) => string;
};

export function SongBlueprintEditor({
  sections,
  onChange,
  labelForSection,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [appliedAllIndex, setAppliedAllIndex] = useState<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const showApplyAllFeedback = (structureIndex: number) => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    setAppliedAllIndex(structureIndex);
    feedbackTimerRef.current = window.setTimeout(() => {
      setAppliedAllIndex(null);
      feedbackTimerRef.current = null;
    }, 1200);
  };

  const entries = useMemo(() => sections, [sections]);
  const regularChorusCount = entries.filter((item) => item.sectionType === "Chorus").length;
  const activeCount = entries.filter((item) => item.instruction.trim()).length;

  if (!sections.length) return null;

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/[0.035]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-accent transition-transform", open ? "" : "-rotate-90")} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">{t("generator.blueprint.title")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {activeCount
              ? t("generator.blueprint.activeCount", { count: activeCount })
              : t("generator.blueprint.hint")}
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 p-3">
          <p className="text-xs leading-5 text-muted-foreground">{t("generator.blueprint.description")}</p>

          {entries.map((entry) => {
            const isOpen = openSectionId === entry.sectionId;
            const sameTypeCount = entries.filter((item) => item.sectionType === entry.sectionType).length;
            const displayLabel = sameTypeCount > 1
              ? `${labelForSection(entry.sectionType)} ${entry.occurrence}`
              : labelForSection(entry.sectionType);
            return (
              <div key={entry.sectionId} className="rounded-xl border border-white/10 bg-black/25">
                <button
                  type="button"
                  onClick={() => setOpenSectionId(isOpen ? null : entry.sectionId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen ? "" : "-rotate-90")} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{displayLabel}</span>
                  {entry.instruction.trim() && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={t("generator.blueprint.hasInstruction")} />}
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t border-white/10 p-3">
                    <textarea
                      value={entry.instruction}
                      onChange={(event) =>
                        onChange(
                          updateArrangementInstruction(
                            entries,
                            entry.sectionId,
                            event.target.value,
                          ),
                        )
                      }
                      rows={3}
                      maxLength={800}
                      placeholder={t("generator.blueprint.placeholder", { section: displayLabel })}
                      aria-label={t("generator.blueprint.sectionInstruction", { section: displayLabel })}
                      className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-5 outline-none transition-shadow placeholder:text-muted-foreground focus:border-accent/50"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">{entry.instruction.length}/800</span>
                      <div className="flex flex-wrap gap-2">
                        {entry.sectionType === "Chorus" && regularChorusCount > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onChange(applyInstructionToAllRegularChoruses(entries, entry.instruction));
                              showApplyAllFeedback(entry.structureIndex);
                            }}
                            disabled={!entry.instruction.trim()}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border border-accent/30 px-2.5 py-1.5 text-[11px] font-medium text-accent transition-all active:scale-95 disabled:opacity-40",
                              appliedAllIndex === entry.structureIndex && "bg-accent/15 ring-1 ring-accent/30",
                            )}
                          >
                            <CopyCheck className="h-3.5 w-3.5" />
                            {appliedAllIndex === entry.structureIndex
                              ? t("generator.blueprint.appliedAllChorus")
                              : t("generator.blueprint.applyAllChorus")}
                          </button>
                        )}
                        {entry.instruction && (
                          <button
                            type="button"
                            onClick={() => onChange(updateArrangementInstruction(entries, entry.sectionId, ""))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("generator.blueprint.clearSection")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}