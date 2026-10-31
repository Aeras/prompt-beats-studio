import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CompactDropdown } from "@/components/ui/compact-dropdown";
import { useI18n } from "@/i18n";
import { musicInspirationCopy } from "@/i18n/music-inspiration";
import type {
  InspirationApplyPlan,
  InspirationApplyField,
  InspirationGroupAction,
} from "@/lib/music-inspiration-apply.shared";
export function ResearchDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false),
    id = useId();
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card/30">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full justify-between whitespace-normal text-left"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {title}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </Button>
      <div id={id} hidden={!open} className="min-w-0 space-y-3 p-3 [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}
export function displayInspirationGroup(values: Record<string, unknown>, empty: string): string {
  const result = Object.entries(values)
    .flatMap(([key, v]) => {
      if (key === "songBlueprint" && Array.isArray(v))
        return v.map((s) =>
          [s.sectionType, s.energy == null ? "—" : s.energy + "/5", s.instruction]
            .filter(Boolean)
            .join(" · "),
        );
      if (key === "songStructure") return [];
      return Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
    })
    .join("\n");
  return result || empty;
}
export function MusicInspirationPreview({
  plan,
  onAction,
  busy,
}: {
  plan: InspirationApplyPlan;
  onAction: (field: InspirationApplyField, action: InspirationGroupAction) => void;
  busy: boolean;
}) {
  const { language } = useI18n(),
    t = musicInspirationCopy[language];
  const [dropdown, setDropdown] = useState("");
  return (
    <div className="min-w-0 space-y-3" data-testid="music-inspiration-preview">
      <p role="status">
        {t.changesCount}: {plan.appliedFields.length} · {t.destructiveCount}:{" "}
        {plan.destructiveFields.length}
      </p>
      {plan.groups.map((g) => (
        <article
          key={g.field}
          className="min-w-0 rounded-xl border border-border/60 bg-card/40 p-3"
          data-testid={"inspiration-group-" + g.field}
        >
          <h4 className="mb-2 text-sm font-semibold">{t[g.field]}</h4>
          <CompactDropdown
            contentClassName="music-inspiration-scroll"
            placeholder={t[g.field]}
            searchPlaceholder={t.search}
            emptyText={t.empty}
            open={dropdown === g.field}
            onOpenChange={(v) => setDropdown(v ? g.field : "")}
            disabled={busy || !g.available}
            value={g.action}
            onValueChange={(v) => onAction(g.field, v as InspirationGroupAction)}
            options={[
              { value: "keep", label: t.keep },
              ...(g.field !== "bpm" && g.field !== "arrangement"
                ? [{ value: "add", label: t.add }]
                : []),
              { value: "replace", label: t.replaceGroup },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {!g.available ? t.noResult : g.changed ? t.willChange : t.noChanges}
          </p>
          {g.issue && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {g.issue === "length"
                ? t.issueLength
                : g.issue === "conflict"
                  ? t.issueConflict
                  : t.issueUnsupported}
            </p>
          )}
          <ResearchDisclosure title={t.expandGroup + ": " + t[g.field]}>
            {[
              [t.currentValue, g.current],
              [t.proposedValue, g.proposed],
              [t.resultValue, g.next],
            ].map(([label, value]) => (
              <div key={label as string}>
                <h5 className="text-xs font-semibold text-muted-foreground">{label as string}</h5>
                <p className="whitespace-pre-wrap text-sm">
                  {label === t.proposedValue && !g.available
                    ? t.noResult
                    : displayInspirationGroup(value as Record<string, unknown>, t.emptyValue)}
                </p>
              </div>
            ))}
          </ResearchDisclosure>
          {g.action === "add" &&
            (g.field === "productionStyle" || g.field === "additionalInstructions") && (
              <p className="mt-2 text-xs text-muted-foreground">{t.addReview}</p>
            )}
        </article>
      ))}
    </div>
  );
}
