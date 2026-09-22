import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { useI18n } from "@/i18n";
import {
  appendArrangementSection,
  duplicateArrangementSection,
  moveArrangementSection,
  removeArrangementSection,
  type ArrangementSection,
} from "@/lib/song-arrangement.shared";
import { cn } from "@/lib/utils";
import { ArrangementSectionCard } from "@/components/promptbeats/ArrangementSectionCard";
import { ArrangementSectionEditor } from "@/components/promptbeats/ArrangementSectionEditor";

type Props = {
  sections: ArrangementSection[];
  availableSectionTypes: string[];
  labelForSection: (value: string) => string;
  onChange: (next: ArrangementSection[]) => void;
  advancedView?: React.ReactNode;
};

function sectionLabel(
  sections: ArrangementSection[],
  section: ArrangementSection,
  labelForSection: (value: string) => string,
) {
  const sameTypeCount = sections.filter((item) => item.sectionType === section.sectionType).length;
  return sameTypeCount > 1
    ? `${labelForSection(section.sectionType)} ${section.occurrence}`
    : labelForSection(section.sectionType);
}

export function VisualSongArrangement({
  sections,
  availableSectionTypes,
  labelForSection,
  onChange,
  advancedView,
}: Props) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.sectionId ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!sections.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !sections.some((section) => section.sectionId === selectedId)) {
      setSelectedId(sections[0]!.sectionId);
    }
  }, [sections, selectedId]);

  const selectedSection = useMemo(
    () => sections.find((section) => section.sectionId === selectedId) ?? null,
    [sections, selectedId],
  );

  const commitDuplicate = (sectionId: string) => {
    const next = duplicateArrangementSection(sections, sectionId);
    onChange(next);
    const sourceIndex = next.findIndex((section) => section.sectionId === sectionId);
    const duplicate = sourceIndex >= 0 ? next[sourceIndex + 1] : null;
    if (duplicate) setSelectedId(duplicate.sectionId);
  };

  const commitRemove = (sectionId: string) => {
    const index = sections.findIndex((section) => section.sectionId === sectionId);
    const next = removeArrangementSection(sections, sectionId);
    onChange(next);
    const replacement = next[Math.min(Math.max(index, 0), Math.max(next.length - 1, 0))] ?? null;
    setSelectedId(replacement?.sectionId ?? null);
  };

  const commitMove = (sectionId: string, toIndex: number) => {
    onChange(moveArrangementSection(sections, sectionId, toIndex));
    setSelectedId(sectionId);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-accent/20 bg-accent/[0.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {t("generator.arrangement.title")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("generator.arrangement.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen((value) => !value)}
          disabled={sections.length >= 40}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-accent/30 px-3 text-[11px] font-medium text-accent disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("generator.arrangement.add")}
        </button>
      </div>

      {addOpen && (
        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2">
          {availableSectionTypes.map((sectionType) => (
            <button
              key={sectionType}
              type="button"
              onClick={() => {
                const next = appendArrangementSection(sections, sectionType);
                onChange(next);
                setSelectedId(next[next.length - 1]?.sectionId ?? null);
                setAddOpen(false);
              }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground hover:border-accent/40 hover:text-accent"
            >
              {labelForSection(sectionType)}
            </button>
          ))}
        </div>
      )}

      {sections.length ? (
        <>
          <div className="hidden gap-2 overflow-x-auto pb-2 md:flex">
            {sections.map((section) => (
              <ArrangementSectionCard
                key={section.sectionId}
                section={section}
                label={sectionLabel(sections, section, labelForSection)}
                selected={section.sectionId === selectedId}
                onSelect={() => setSelectedId(section.sectionId)}
              />
            ))}
          </div>

          <div className="space-y-2 md:hidden">
            {sections.map((section) => {
              const open = section.sectionId === selectedId;
              return (
                <div key={section.sectionId} className="rounded-xl border border-white/10 bg-black/25">
                  <button
                    type="button"
                    onClick={() => setSelectedId(open ? null : section.sectionId)}
                    aria-expanded={open}
                    className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
                  >
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {sectionLabel(sections, section, labelForSection)}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                      E {section.energy ?? "—"}
                    </span>
                    {section.instruction.trim() && <span className="h-2 w-2 rounded-full bg-accent" aria-label={t("generator.blueprint.hasInstruction")} />}
                  </button>
                  {open && (
                    <div className="border-t border-white/10 p-3">
                      <ArrangementSectionEditor
                        sections={sections}
                        sectionId={section.sectionId}
                        labelForSection={labelForSection}
                        onChange={onChange}
                        onDuplicate={commitDuplicate}
                        onRemove={commitRemove}
                        onMove={commitMove}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedSection && (
            <div className="hidden md:block">
              <ArrangementSectionEditor
                sections={sections}
                sectionId={selectedSection.sectionId}
                labelForSection={labelForSection}
                onChange={onChange}
                onDuplicate={commitDuplicate}
                onRemove={commitRemove}
                onMove={commitMove}
              />
            </div>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">
          {t("generator.arrangement.empty")}
        </p>
      )}

      {advancedView && (
        <div className="border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center gap-2 py-1 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen ? "" : "-rotate-90")} />
            {t("generator.arrangement.advancedBlueprint")}
          </button>
          {advancedOpen && <div className="mt-2">{advancedView}</div>}
        </div>
      )}
    </div>
  );
}
