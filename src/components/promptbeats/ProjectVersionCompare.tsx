import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getProjectVersionsForCompare } from "@/lib/ai.functions";
import {
  compareProjectVersions,
  type ArrangementSectionDiff,
  type LyricsSectionDiff,
  type ProjectVersionDiff,
  type ScalarFieldDiff,
  type StructureItemDiff,
  type WordDiffToken,
} from "@/lib/project-version-diff.shared";
import { cn } from "@/lib/utils";

type HistoryVersion = {
  id: string;
  version_number: number | null;
  parent_prompt_id: string | null;
  created_at: string;
  version_change_metadata: {
    title: string;
    summary: string;
  } | null;
};

type Props = {
  projectId: string;
  leftId: string;
  rightId: string;
  versions: HistoryVersion[];
  language: string;
  onClose: () => void;
  onSelectRight: (id: string) => void;
};

function statusLabel(status: string, language: string) {
  const el = language === "el";
  if (status === "added") return el ? "Προστέθηκε" : "Added";
  if (status === "removed") return el ? "Αφαιρέθηκε" : "Removed";
  if (status === "moved") return el ? "Μετακινήθηκε" : "Moved";
  if (status === "changed") return el ? "Άλλαξε" : "Changed";
  return el ? "Χωρίς αλλαγή" : "No changes";
}

function StatusBadge({ status, language }: { status: string; language: string }) {
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
      status === "added" && "border-emerald-400/30 text-emerald-300",
      status === "removed" && "border-red-400/30 text-red-300",
      status === "changed" && "border-amber-400/30 text-amber-300",
      status === "moved" && "border-accent/30 text-accent",
      status === "unchanged" && "border-white/10 text-muted-foreground",
    )}>
      {statusLabel(status, language)}
    </span>
  );
}

function SideBySide({
  label,
  status,
  before,
  after,
  leftLabel,
  rightLabel,
  language,
}: {
  label: string;
  status: string;
  before: React.ReactNode;
  after: React.ReactNode;
  leftLabel: string;
  rightLabel: string;
  language: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <StatusBadge status={status} language={language} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{leftLabel}</p>
          <div className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">{before || "—"}</div>
        </div>
        <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{rightLabel}</p>
          <div className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">{after || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function tokenView(tokens: WordDiffToken[], side: "before" | "after") {
  return tokens
    .filter((token) => side === "before" ? token.status !== "added" : token.status !== "removed")
    .map((token, index) => (
      <span
        key={index}
        className={cn(
          token.status === "removed" && "rounded bg-red-500/15 text-red-200 line-through decoration-red-300/50",
          token.status === "added" && "rounded bg-emerald-500/15 text-emerald-200",
        )}
      >
        {token.value}
      </span>
    ));
}

function fieldSummary(diff: ProjectVersionDiff, language: string) {
  const el = language === "el";
  const groups: string[] = [];
  if (diff.lyrics.some((item) => item.status !== "unchanged")) groups.push(el ? "Στίχοι" : "Lyrics");
  if (diff.structure.some((item) => item.status !== "unchanged")) groups.push(el ? "Δομή" : "Structure");
  if (diff.arrangement.some((item) => item.status !== "unchanged")) groups.push("Arrangement");
  if (diff.fields.some((item) => item.status !== "unchanged")) groups.push(el ? "Ρυθμίσεις" : "Fields");
  return groups;
}

export function ProjectVersionCompare({
  projectId,
  leftId,
  rightId,
  versions,
  language,
  onClose,
  onSelectRight,
}: Props) {
  const el = language === "el";
  const [changesOnly, setChangesOnly] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setChangesOnly(true);
    }
  }, []);

  const compareQuery = useQuery({
    queryKey: ["project-version-compare", projectId, leftId, rightId],
    queryFn: () => getProjectVersionsForCompare({ data: { projectId, leftId, rightId } }),
    enabled: Boolean(projectId && leftId && rightId && leftId !== rightId),
  });

  const diff = useMemo(() => {
    if (!compareQuery.data) return null;
    return compareProjectVersions(compareQuery.data.left, compareQuery.data.right);
  }, [compareQuery.data]);

  const leftVersion = versions.find((version) => version.id === leftId) ?? null;
  const rightVersion = versions.find((version) => version.id === rightId) ?? null;
  const leftLabel = `V${leftVersion?.version_number ?? "?"}`;
  const rightLabel = `V${rightVersion?.version_number ?? "?"}`;

  const between = useMemo(() => {
    const left = leftVersion?.version_number;
    const right = rightVersion?.version_number;
    if (left == null || right == null) return [];
    const min = Math.min(left, right);
    const max = Math.max(left, right);
    return versions.filter((version) => {
      const n = version.version_number;
      return n != null && n > min && n <= max;
    });
  }, [leftVersion?.version_number, rightVersion?.version_number, versions]);

  const fields = (diff?.fields ?? []).filter((item) => !changesOnly || item.status !== "unchanged");
  const structure = (diff?.structure ?? []).filter((item) => !changesOnly || item.status !== "unchanged");
  const arrangement = (diff?.arrangement ?? []).filter((item) => !changesOnly || item.status !== "unchanged");
  const lyrics = (diff?.lyrics ?? []).filter((item) => !changesOnly || item.status !== "unchanged");

  return (
    <section className="glass rounded-2xl border border-accent/25 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{el ? "Σύγκριση εκδόσεων" : "Version Compare"}</p>
          <h3 className="mt-1 font-display text-lg font-bold">{leftLabel} ↔ {rightLabel}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground" aria-label={el ? "Κλείσιμο σύγκρισης" : "Close compare"}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{el ? `Σύγκρινε το ${leftLabel} με` : `Compare ${leftLabel} with`}</span>
          <select
            value={rightId}
            onChange={(event) => onSelectRight(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs"
          >
            {versions.filter((version) => version.id !== leftId).map((version) => {
              const previous = version.id === leftVersion?.parent_prompt_id;
              return <option key={version.id} value={version.id}>V{version.version_number ?? "?"}{previous ? (el ? " — Προηγούμενη έκδοση" : " — Previous version") : ""}</option>;
            })}
          </select>
        </label>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
          <button type="button" onClick={() => setChangesOnly(true)} className={cn("rounded-lg px-3 py-2 text-[11px] font-semibold", changesOnly ? "bg-accent/15 text-accent" : "text-muted-foreground")}>
            {el ? "Μόνο αλλαγές" : "Changes Only"}
          </button>
          <button type="button" onClick={() => setChangesOnly(false)} className={cn("rounded-lg px-3 py-2 text-[11px] font-semibold", !changesOnly ? "bg-accent/15 text-accent" : "text-muted-foreground")}>
            {el ? "Εμφάνιση όλων" : "Show All"}
          </button>
        </div>
      </div>

      {compareQuery.isLoading && <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{el ? "Υπολογισμός διαφορών..." : "Calculating differences..."}</div>}
      {compareQuery.error && <p className="mt-4 text-xs text-red-400">{compareQuery.error instanceof Error ? compareQuery.error.message : (el ? "Η σύγκριση απέτυχε." : "Compare failed.")}</p>}

      {diff && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/30 px-2.5 py-1 text-[11px] font-semibold text-accent">
                {diff.changeCount} {el ? (diff.changeCount === 1 ? "αλλαγή" : "αλλαγές") : (diff.changeCount === 1 ? "change" : "changes")}
              </span>
              {fieldSummary(diff, language).map((group) => <span key={group} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-muted-foreground">{group}</span>)}
            </div>
          </div>

          {between.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{el ? "Αλλαγές στην πορεία" : "Changes along the way"}</p>
              <div className="mt-2 space-y-2">
                {between.map((version) => (
                  <div key={version.id} className="flex gap-2 text-xs">
                    <span className="font-semibold text-accent">V{version.version_number ?? "?"}</span>
                    <span className="text-muted-foreground">{version.version_change_metadata?.title ?? (el ? "Νέα έκδοση" : "New version")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fields.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">{el ? "Στοιχεία Project" : "Project Fields"}</h4>
              {fields.map((item: ScalarFieldDiff) => (
                <SideBySide key={item.key} label={item.label} status={item.status} before={item.before} after={item.after} leftLabel={leftLabel} rightLabel={rightLabel} language={language} />
              ))}
            </div>
          )}

          {structure.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Song Structure</h4>
              {structure.map((item: StructureItemDiff) => (
                <SideBySide
                  key={item.key}
                  label={item.label}
                  status={item.status}
                  before={item.beforeIndex == null ? "—" : `#${item.beforeIndex + 1}`}
                  after={item.afterIndex == null ? "—" : `#${item.afterIndex + 1}`}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                  language={language}
                />
              ))}
            </div>
          )}

          {arrangement.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Blueprint / Arrangement</h4>
              {arrangement.map((item: ArrangementSectionDiff) => (
                <SideBySide
                  key={item.key}
                  label={item.label}
                  status={item.status}
                  before={<>
                    <p>Energy: {item.beforeEnergy ?? "—"}</p>
                    {item.beforeInstruction && <p className="mt-2">{item.beforeInstruction}</p>}
                  </>}
                  after={<>
                    <p>Energy: {item.afterEnergy ?? "—"}</p>
                    {item.afterInstruction && <p className="mt-2">{item.afterInstruction}</p>}
                  </>}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                  language={language}
                />
              ))}
            </div>
          )}

          {lyrics.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">{el ? "Στίχοι" : "Lyrics"}</h4>
              {lyrics.map((item: LyricsSectionDiff) => (
                <SideBySide
                  key={item.key}
                  label={item.label}
                  status={item.status}
                  before={item.status === "unchanged" ? item.before : tokenView(item.tokens, "before")}
                  after={item.status === "unchanged" ? item.after : tokenView(item.tokens, "after")}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                  language={language}
                />
              ))}
            </div>
          )}

          {!diff.hasChanges && <p className="rounded-xl border border-white/10 p-4 text-center text-sm text-muted-foreground">{el ? "Δεν υπάρχουν αλλαγές μεταξύ αυτών των εκδόσεων." : "No changes between these versions."}</p>}
        </div>
      )}
    </section>
  );
}
