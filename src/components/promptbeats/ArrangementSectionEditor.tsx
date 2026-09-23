import { ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";

import { useI18n } from "@/i18n";
import {
  applyEnergyToAllRegularChoruses,
  applyInstructionToAllRegularChoruses,
  type ArrangementSection,
  type SongEnergyLevel,
  updateArrangementEnergy,
  updateArrangementInstruction,
} from "@/lib/song-arrangement.shared";
import { cn } from "@/lib/utils";

const ENERGY_LABEL_KEYS = {
  1: "generator.arrangement.energy1",
  2: "generator.arrangement.energy2",
  3: "generator.arrangement.energy3",
  4: "generator.arrangement.energy4",
  5: "generator.arrangement.energy5",
} as const;

type Props = {
  sections: ArrangementSection[];
  sectionId: string;
  labelForSection: (value: string) => string;
  onChange: (next: ArrangementSection[]) => void;
  onDuplicate: (sectionId: string) => void;
  onRemove: (sectionId: string) => void;
  onMove: (sectionId: string, toIndex: number) => void;
};

function displayLabel(
  sections: ArrangementSection[],
  section: ArrangementSection,
  labelForSection: (value: string) => string,
) {
  const sameTypeCount = sections.filter((item) => item.sectionType === section.sectionType).length;
  return sameTypeCount > 1
    ? `${labelForSection(section.sectionType)} ${section.occurrence}`
    : labelForSection(section.sectionType);
}

export function ArrangementSectionEditor({
  sections,
  sectionId,
  labelForSection,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: Props) {
  const { t } = useI18n();
  const section = sections.find((item) => item.sectionId === sectionId);
  if (!section) return null;

  const label = displayLabel(sections, section, labelForSection);
  const index = sections.findIndex((item) => item.sectionId === sectionId);
  const regularChorusCount = sections.filter((item) => item.sectionType === "Chorus").length;

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("generator.arrangement.sectionDetails")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMove(section.sectionId, index - 1)}
            disabled={index <= 0}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground disabled:opacity-35"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            {t("generator.arrangement.moveUp")}
          </button>
          <button
            type="button"
            onClick={() => onMove(section.sectionId, index + 1)}
            disabled={index >= sections.length - 1}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground disabled:opacity-35"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {t("generator.arrangement.moveDown")}
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(section.sectionId)}
            disabled={sections.length >= 40}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/25 px-2.5 text-[11px] text-accent disabled:opacity-35"
          >
            <Copy className="h-3.5 w-3.5" />
            {t("generator.arrangement.duplicate")}
          </button>
          <button
            type="button"
            onClick={() => onRemove(section.sectionId)}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[11px] text-muted-foreground hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("generator.arrangement.remove")}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("generator.arrangement.energy")}
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("generator.arrangement.energy")}
        >
          {([1, 2, 3, 4, 5] as SongEnergyLevel[]).map((energy) => (
            <button
              key={energy}
              type="button"
              aria-pressed={section.energy === energy}
              onClick={() =>
                onChange(
                  updateArrangementEnergy(
                    sections,
                    section.sectionId,
                    section.energy === energy ? null : energy,
                  ),
                )
              }
              className={cn(
                "min-h-10 min-w-10 rounded-xl border px-3 text-xs font-semibold transition-colors",
                section.energy === energy
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-white/10 text-muted-foreground hover:border-accent/35 hover:text-foreground",
              )}
            >
              {energy}
            </button>
          ))}
          {section.sectionType === "Chorus" && regularChorusCount > 1 && section.energy != null && (
            <button
              type="button"
              onClick={() => onChange(applyEnergyToAllRegularChoruses(sections, section.energy))}
              className="min-h-10 rounded-xl border border-accent/25 px-3 text-[11px] font-medium text-accent"
            >
              {t("generator.arrangement.applyEnergyAllChorus")}
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {section.energy == null
            ? t("generator.arrangement.energyUnset")
            : t(ENERGY_LABEL_KEYS[section.energy])}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("generator.blueprint.title")}
        </label>
        <textarea
          value={section.instruction}
          onChange={(event) =>
            onChange(updateArrangementInstruction(sections, section.sectionId, event.target.value))
          }
          rows={4}
          maxLength={800}
          placeholder={t("generator.blueprint.placeholder", { section: label })}
          aria-label={t("generator.blueprint.sectionInstruction", { section: label })}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-5 outline-none transition-shadow placeholder:text-muted-foreground focus:border-accent/50"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {section.instruction.length}/800
          </span>
          {section.sectionType === "Chorus" &&
            regularChorusCount > 1 &&
            section.instruction.trim() && (
              <button
                type="button"
                onClick={() =>
                  onChange(applyInstructionToAllRegularChoruses(sections, section.instruction))
                }
                className="rounded-lg border border-accent/25 px-2.5 py-1.5 text-[11px] font-medium text-accent"
              >
                {t("generator.blueprint.applyAllChorus")}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
