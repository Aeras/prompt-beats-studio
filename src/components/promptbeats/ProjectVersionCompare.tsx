import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitCompareArrows, Loader2, X } from "lucide-react";

import { useI18n } from "@/i18n";
import { getProjectVersionsForCompare } from "@/lib/ai.functions";
import {
  compareProjectVersions,
  type ArrangementSectionDiff,
  type LyricsSectionDiff,
  type ProjectVersionDiff,
  type ScalarFieldDiff,
  type StructureItemDiff,
  type VersionDiffStatus,
  type WordDiffToken,
} from "@/lib/project-version-diff.shared";
import type { VersionChangeMetadata } from "@/lib/project-version-history.shared";
import { cn } from "@/lib/utils";

type HistoryVersion = {
  id: string;
  version_number: number | null;
  version_change_metadata: VersionChangeMetadata | null;
};

type Props = {
  projectId: string;
  projectName: string;
  leftId: string;
  rightId: string;
  historyVersions: HistoryVersion[];
  onClose: () => void;
};

function statusLabel(status: VersionDiffStatus, el: boolean) {
  const labels: Record<VersionDiffStatus, [string, string]> = {
    unchanged: ["No changes", "Χωρίς αλλαγές"],
    changed: ["Changed", "Άλλαξε"],
    added: ["Added", "Προστέθηκε"],
    removed: ["Removed", "Αφαιρέθηκε"],
    moved: ["Moved", "Μετακινήθηκε"],
  };
  return labels[status][el ? 1 : 0];
}

function StatusBadge({ status, el }: { status: VersionDiffStatus; el: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[9px] font-semibold",
        status === "unchanged" && "border-white/10 text-muted-foreground",
        status === "changed" && "border-amber-400/30 bg-amber-400/5 text-amber-200",
        status === "added" && "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
        status === "removed" && "border-red-400/30 bg-red-400/5 text-red-200",
        status === "moved" && "border-sky-400/30 bg-sky-400/5 text-sky-200",
      )}
    >
      {statusLabel(status, el)}
    </span>
  );
}

function VersionValueCard({
  version,
  value,
  empty,
}: {
  version: string;
  value: string;
  empty: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-accent">{version}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {value || empty}
      </p>
    </div>
  );
}

function FieldRow({
  item,
  leftLabel,
  rightLabel,
  el,
}: {
  item: ScalarFieldDiff;
  leftLabel: string;
  rightLabel: string;
  el: boolean;
}) {
  const empty = el ? "Δεν υπάρχει" : "Not present";
  return (
    <article className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{item.label}</h4>
        <StatusBadge status={item.status} el={el} />
      </div>
      {(item.added?.length || item.removed?.length) ? (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[9px]">
          {item.removed?.map((value) => <span key={`r-${value}`} className="rounded-full border border-red-400/20 px-2 py-0.5 text-red-200">− {value}</span>)}
          {item.added?.map((value) => <span key={`a-${value}`} className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-emerald-200">+ {value}</span>)}
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <VersionValueCard version={leftLabel} value={item.before} empty={empty} />
        <VersionValueCard version={rightLabel} value={item.after} empty={empty} />
      </div>
    </article>
  );
}

function StructureRow({
  item,
  leftLabel,
  rightLabel,
  el,
}: {
  item: StructureItemDiff;
  leftLabel: string;
  rightLabel: string;
  el: boolean;
}) {
  const none = el ? "Δεν υπάρχει" : "Not present";
  const position = (index: number | null) => index == null ? none : `${el ? "Θέση" : "Position"} ${index + 1}`;
  return (
    <article className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{item.label}</h4>
        <StatusBadge status={item.status} el={el} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <VersionValueCard version={leftLabel} value={position(item.beforeIndex)} empty={none} />
        <VersionValueCard version={rightLabel} value={position(item.afterIndex)} empty={none} />
      </div>
    </article>
  );
}

function ArrangementRow({
  item,
  leftLabel,
  rightLabel,
  el,
}: {
  item: ArrangementSectionDiff;
  leftLabel: string;
  rightLabel: string;
  el: boolean;
}) {
  const none = el ? "Δεν υπάρχει" : "Not present";
  const format = (energy: number | null, instruction: string, index: number | null) => {
    if (index == null) return "";
    const parts = [
      `Energy: ${energy == null ? "—" : `${energy}/5`}`,
      instruction ? `Blueprint: ${instruction}` : "",
      `${el ? "Θέση" : "Position"}: ${index + 1}`,
    ].filter(Boolean);
    return parts.join("\n");
  };
  return (
    <article className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{item.label}</h4>
        <div className="flex flex-wrap gap-1">
          {item.energyChanged && <span className="rounded-full border border-accent/20 px-2 py-0.5 text-[9px] text-accent">Energy</span>}
          {item.instructionChanged && <span className="rounded-full border border-accent/20 px-2 py-0.5 text-[9px] text-accent">Blueprint</span>}
          <StatusBadge status={item.status} el={el} />
        </div>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <VersionValueCard version={leftLabel} value={format(item.beforeEnergy, item.beforeInstruction, item.beforeIndex)} empty={none} />
        <VersionValueCard version={rightLabel} value={format(item.afterEnergy, item.afterInstruction, item.afterIndex)} empty={none} />
      </div>
    </article>
  );
}

function TokenText({
  tokens,
  side,
}: {
  tokens: WordDiffToken[];
  side: "before" | "after";
}) {
  const visible = tokens.filter((token) => {
    if (token.status === "unchanged") return true;
    return side === "before" ? token.status === "removed" : token.status === "added";
  });
  return (
    <span className="whitespace-pre-wrap break-words">
      {visible.map((token, index) => {
        if (token.status === "unchanged") return <span key={index}>{token.value}</span>;
        const isRemoved = token.status === "removed";
        return (
          <mark
            key={index}
            className={cn(
              "rounded-sm px-0.5 text-inherit",
              isRemoved ? "bg-red-400/20 underline decoration-red-300" : "bg-emerald-400/20 underline decoration-emerald-300",
            )}
          >
            {token.value}
          </mark>
        );
      })}
    </span>
  );
}

function LyricsRow({
  item,
  leftLabel,
  rightLabel,
  el,
}: {
  item: LyricsSectionDiff;
  leftLabel: string;
  rightLabel: string;
  el: boolean;
}) {
  const none = el ? "Δεν υπάρχει" : "Not present";
  return (
    <article className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{item.label}</h4>
        <StatusBadge status={item.status} el={el} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-accent">{leftLabel}</p>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">
            {item.before ? <TokenText tokens={item.tokens} side="before" /> : none}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-accent">{rightLabel}</p>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">
            {item.after ? <TokenText tokens={item.tokens} side="after" /> : none}
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-accent">{title}</h3>
      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-muted-foreground">{count}</span>
    </div>
  );
}

export function ProjectVersionCompare({
  projectId,
  projectName,
  leftId,
  rightId,
  historyVersions,
  onClose,
}: Props) {
  const { language } = useI18n();
  const el = language === "el";
  const [changesOnly, setChangesOnly] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setChangesOnly(true);
    }
  }, [leftId, rightId]);

  const query = useQuery({
    queryKey: ["library", "project-version-compare", projectId, leftId, rightId],
    queryFn: () => getProjectVersionsForCompare({ data: { projectId, leftId, rightId } }),
  });

  const diff = useMemo<ProjectVersionDiff | null>(() => {
    if (!query.data) return null;
    return compareProjectVersions(query.data.left, query.data.right);
  }, [query.data]);

  const leftLabel = `V${query.data?.left.versionNumber ?? "—"}`;
  const rightLabel = `V${query.data?.right.versionNumber ?? "—"}`;
  const include = <T extends { status: VersionDiffStatus }>(items: T[]) =>
    changesOnly ? items.filter((item) => item.status !== "unchanged") : items;

  const fields = diff ? include(diff.fields) : [];
  const structure = diff ? include(diff.structure) : [];
  const arrangement = diff ? include(diff.arrangement) : [];
  const lyrics = diff ? include(diff.lyrics) : [];

  const journey = useMemo(() => {
    const left = query.data?.left.versionNumber;
    const right = query.data?.right.versionNumber;
    if (left == null || right == null) return [];
    const min = Math.min(left, right);
    const max = Math.max(left, right);
    return historyVersions
      .filter((item) => item.version_number != null && item.version_number > min && item.version_number <= max)
      .sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));
  }, [historyVersions, query.data?.left.versionNumber, query.data?.right.versionNumber]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={el ? "Σύγκριση εκδόσεων" : "Version comparison"} className="mx-auto flex h-full w-full max-w-6xl flex-col bg-background sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl sm:border sm:border-white/10">
        <header className="flex shrink-0 items-start gap-3 border-b border-white/10 p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10">
            <GitCompareArrows className="h-4 w-4 text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-accent">{projectName}</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 font-display text-lg font-bold">
              {leftLabel}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              {rightLabel}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground" aria-label={el ? "Κλείσιμο" : "Close"}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-10 sm:p-5">
          {query.isLoading ? (
            <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
          ) : query.isError || !diff ? (
            <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-xs text-red-300">
              {el ? "Η σύγκριση δεν ήταν δυνατό να φορτωθεί." : "The comparison could not be loaded."}
            </p>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-accent/20 bg-accent/[0.035] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{el ? "Τι άλλαξε" : "What changed"}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {diff.changeCount === 0
                        ? (el ? "Δεν υπάρχουν διαφορές ανάμεσα στις δύο εκδόσεις." : "There are no differences between these two versions.")
                        : (el ? `${diff.changeCount} σημασιολογικές αλλαγές εντοπίστηκαν.` : `${diff.changeCount} semantic changes detected.`)}
                    </p>
                  </div>
                  <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1" role="group" aria-label={el ? "Φίλτρο αλλαγών" : "Change filter"}>
                    <button type="button" aria-pressed={changesOnly} onClick={() => setChangesOnly(true)} className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", changesOnly ? "bg-accent/15 text-accent" : "text-muted-foreground")}>
                      {el ? "Μόνο αλλαγές" : "Changes Only"}
                    </button>
                    <button type="button" aria-pressed={!changesOnly} onClick={() => setChangesOnly(false)} className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", !changesOnly ? "bg-accent/15 text-accent" : "text-muted-foreground")}>
                      {el ? "Εμφάνιση όλων" : "Show All"}
                    </button>
                  </div>
                </div>

                {journey.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {el ? "Αλλαγές στην πορεία" : "Changes along the way"}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {journey.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 font-bold text-accent">V{item.version_number}</span>
                          <span className="text-muted-foreground">
                            {item.version_change_metadata?.title ?? (el ? "Αποθηκευμένη έκδοση" : "Saved version")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {fields.length > 0 && (
                <section className="space-y-2">
                  <SectionHeader title={el ? "Project / Generator" : "Project / Generator"} count={fields.length} />
                  {fields.map((item) => <FieldRow key={item.key} item={item} leftLabel={leftLabel} rightLabel={rightLabel} el={el} />)}
                </section>
              )}

              {structure.length > 0 && (
                <section className="space-y-2">
                  <SectionHeader title={el ? "Δομή τραγουδιού" : "Song Structure"} count={structure.length} />
                  {structure.map((item) => <StructureRow key={item.key} item={item} leftLabel={leftLabel} rightLabel={rightLabel} el={el} />)}
                </section>
              )}

              {arrangement.length > 0 && (
                <section className="space-y-2">
                  <SectionHeader title={el ? "Blueprint / Arrangement / Energy" : "Blueprint / Arrangement / Energy"} count={arrangement.length} />
                  {arrangement.map((item) => <ArrangementRow key={item.key} item={item} leftLabel={leftLabel} rightLabel={rightLabel} el={el} />)}
                </section>
              )}

              {lyrics.length > 0 && (
                <section className="space-y-2">
                  <SectionHeader title={el ? "Στίχοι" : "Lyrics"} count={lyrics.length} />
                  {lyrics.map((item) => <LyricsRow key={item.key} item={item} leftLabel={leftLabel} rightLabel={rightLabel} el={el} />)}
                </section>
              )}

              {changesOnly && fields.length === 0 && structure.length === 0 && arrangement.length === 0 && lyrics.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted-foreground">
                  {el ? "Δεν υπάρχουν αλλαγές για εμφάνιση." : "There are no changes to show."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
