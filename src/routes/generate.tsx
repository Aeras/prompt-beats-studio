import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FlaskConical, Loader2, Save, Sparkles, Wand2, ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/promptbeats/AppShell";
import {
  generateSongPrompt,
  checkSongQuality,

  getGenerationUsage,
  savePromptToLibrary,
  repairSongPrompt,
  getAiModelSetting,
  setAiModelSetting,
  HOURLY_LIMIT,
  type QualityReport,
} from "@/lib/ai.functions";
import { getMyModeration } from "@/lib/moderation.functions";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai-models";

export const Route = createFileRoute("/generate")({
  head: () => ({
    meta: [
      { title: "AI Prompt & Lyrics Generator for Suno and Udio — PromptBeats" },
      {
        name: "description",
        content:
          "Turn one idea into a Suno/Udio-ready style prompt, structured lyrics, and a producer's note in seconds.",
      },
      { property: "og:title", content: "AI Prompt & Lyrics Generator — PromptBeats" },
      {
        property: "og:description",
        content: "Generate optimized metatags, structured lyrics and producer notes for AI music platforms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneratePage,
});

const CUSTOM = "Custom…";
const GENRE_OPTIONS = [
  "Reggaeton", "Cumbia", "Latin Pop", "Italo Disco", "Synthwave", "Acoustic", "Hip-Hop",
  "Pop", "Rock", "R&B", "House", "Techno", "Electronic / EDM", "Drum & Bass", "Trap", "Jazz",
  "Lo-fi", "Country", "Metal", "Afrobeats", CUSTOM,
];

const MOOD_OPTIONS = ["Energetic", "Melancholic", "Dark", "Uplifting", "Romantic", "Dreamy", "Aggressive", "Nostalgic", CUSTOM];
const LANGUAGE_OPTIONS = ["Greek", "English", "Spanish", "Russian", "Italian", "French", "German", "Portuguese", CUSTOM];

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function OutputCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 font-display text-sm font-semibold tracking-wide text-gradient-neon">{title}</h2>
        <CopyButton value={body} />
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{body || "—"}</pre>
    </div>
  );
}

// TEMPORARY — Super Admin testing only. Shows the live Quality Layer 2A
// evaluator response from the current generation. Remove after testing.
function QualityIssueList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground/70">None</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-foreground/90">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Category 1 — Actual Issues (these affect the score). */
function ActualIssues({ quality }: { quality: QualityReport }) {
  return (
    <div className="space-y-4">
      <QualityIssueList label="Issues" items={quality.issues} />
      <QualityIssueList label="Language Issues" items={quality.languageIssues} />
      <QualityIssueList label="Grammar Issues" items={quality.grammarIssues} />
      <QualityIssueList label="Singability Issues" items={quality.singabilityIssues} />
      <QualityIssueList label="Genre Issues" items={quality.genreIssues} />
      <QualityIssueList label="Consistency Issues" items={quality.consistencyIssues} />
    </div>
  );
}

function QualityReportBody({ quality }: { quality: QualityReport | null }) {
  if (!quality) return <p className="mt-3 text-xs text-muted-foreground">Quality check unavailable</p>;
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span>
          Passed:{" "}
          <strong className={quality.passed ? "text-green-400" : "text-red-400"}>
            {quality.passed ? "Yes" : "No"}
          </strong>
        </span>
        <span>
          Score: <strong className="text-foreground">{quality.score}/10</strong>
        </span>
      </div>
      <ActualIssues quality={quality} />
    </div>
  );
}

function hasQualityIssues(q: QualityReport | null) {
  if (!q) return false;
  return (
    q.issues.length +
      q.languageIssues.length +
      q.grammarIssues.length +
      q.singabilityIssues.length +
      q.genreIssues.length +
      q.consistencyIssues.length >
    0
  );
}

function CostButton({
  label,
  busy,
  busyLabel,
  onClick,
}: {
  label: string;
  busy: boolean;
  busyLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center justify-center gap-2 rounded-xl border border-accent/50 px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {busy ? busyLabel : label}
    </button>
  );
}

function ConfirmBox({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="text-xs text-foreground/90">{message}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-lg bg-gradient-neon px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type ApplyState = {
  applied: Record<string, boolean>;
  errors: Record<string, string>;
  onApplyCorrection: (id: string, c: LyricCorrectionItem) => void;
  onUndoCorrection: (id: string, c: LyricCorrectionItem) => void;
  onApplySuggestion: (id: string, s: QualitySuggestion) => void;
  onUndoSuggestion: (id: string, s: QualitySuggestion) => void;
};

function ApplyRow({ id, state, onApply, onUndo }: {
  id: string;
  state: ApplyState;
  onApply: () => void;
  onUndo: () => void;
}) {
  const done = state.applied[id];
  const error = state.errors[id];
  return (
    <div className="mt-2">
      <button
        onClick={done ? onUndo : onApply}
        className={
          done
            ? "rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            : "rounded-lg border border-accent/50 px-3 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent/10"
        }
      >
        {done ? "Undo" : "Apply"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function CorrectionCard({ id, c, state }: { id: string; c: LyricCorrectionItem; state: ApplyState }) {
  return (
    <div className="rounded-xl border border-red-400/25 bg-red-400/5 p-3">
      {c.sectionLabel && (
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">[{c.sectionLabel}]</p>
      )}
      <p className="mt-1 text-xs text-foreground/90">{c.reason}</p>
      <p className="mt-2 text-xs text-muted-foreground line-through">{c.originalText}</p>
      <p className="text-xs text-green-300">{c.replacementText}</p>
      <ApplyRow
        id={id}
        state={state}
        onApply={() => state.onApplyCorrection(id, c)}
        onUndo={() => state.onUndoCorrection(id, c)}
      />
    </div>
  );
}

function SuggestionCard({ id, s, state }: { id: string; s: QualitySuggestion; state: ApplyState }) {
  const applicable = s.actionType !== "informational";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold text-foreground">{s.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{s.explanation}</p>
      {s.actionType === "add_to_music_style" && s.value && (
        <p className="mt-2 text-[11px] text-accent">Add to Music Style: {s.value}</p>
      )}
      {s.actionType === "vocal_arrangement" && s.arrangement.length > 0 && (
        <p className="mt-2 text-[11px] text-accent">
          {s.arrangement.map((a) => `${a.tag} → ${a.sectionLabel}`).join(" · ")}
        </p>
      )}
      {applicable && (
        <ApplyRow
          id={id}
          state={state}
          onApply={() => state.onApplySuggestion(id, s)}
          onUndo={() => state.onUndoSuggestion(id, s)}
        />
      )}
    </div>
  );
}

function SuggestionGroup({
  heading,
  hint,
  items,
  prefix,
  state,
}: {
  heading: string;
  hint: string;
  items: QualitySuggestion[];
  prefix: string;
  state: ApplyState;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{heading}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <div className="mt-2 space-y-2">
        {items.map((s, i) => (
          <SuggestionCard key={`${prefix}-${i}`} id={`${prefix}-${i}`} s={s} state={state} />
        ))}
      </div>
    </div>
  );
}

function QualityResults({ quality, prefix, state }: { quality: QualityReport; prefix: string; state: ApplyState }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span>
          Passed:{" "}
          <strong className={quality.passed ? "text-green-400" : "text-red-400"}>
            {quality.passed ? "Yes" : "No"}
          </strong>
        </span>
        <span>
          Score: <strong className="text-foreground">{quality.score}/10</strong>
        </span>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">1 · Actual issues</p>
        <p className="text-[11px] text-muted-foreground">Problems that may need correction.</p>
        <div className="mt-2">
          <ActualIssues quality={quality} />
        </div>
        {quality.lyricCorrections.length > 0 && (
          <div className="mt-3 space-y-2">
            {quality.lyricCorrections.map((c, i) => (
              <CorrectionCard key={`${prefix}-fix-${i}`} id={`${prefix}-fix-${i}`} c={c} state={state} />
            ))}
          </div>
        )}
      </div>

      <SuggestionGroup
        heading="2 · Creative suggestions"
        hint="Optional improvements — they do not affect the score."
        items={quality.creativeSuggestions}
        prefix={`${prefix}-cre`}
        state={state}
      />
      <SuggestionGroup
        heading="3 · Vocal / production suggestions"
        hint="Optional musical and production recommendations."
        items={[...quality.vocalSuggestions, ...quality.productionSuggestions]}
        prefix={`${prefix}-vop`}
        state={state}
      />
    </div>
  );
}

function QualityPanel({
  quality,
  checking,
  onCheck,
  checkError,
  canRepair,
  repairing,
  onRepair,
  repairError,
  repaired,
  confirm,
  setConfirm,
  onRecheck,
  state,
}: {
  quality: QualityReport | null;
  checking: boolean;
  onCheck: () => void;
  checkError: string | null;
  canRepair: boolean;
  repairing: boolean;
  onRepair: () => void;
  repairError: string | null;
  repaired: { result: { title: string; tags: string; lyrics: string; note: string }; quality: QualityReport | null } | null;
  confirm: "check" | "repair" | "recheck" | null;
  setConfirm: (v: "check" | "repair" | "recheck" | null) => void;
  onRecheck: () => void;
  state: ApplyState;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-accent" />
        <h2 className="font-display text-sm font-semibold tracking-wide text-accent">Quality check</h2>
      </div>

      {!quality && !checking && (
        <div className="mt-4 space-y-3">
          {confirm === "check" ? (
            <ConfirmBox
              message="Quality Check will use 1 creation from your available balance."
              confirmLabel="Check"
              onConfirm={onCheck}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <CostButton label="Check · −1 creation" busy={false} busyLabel="" onClick={() => setConfirm("check")} />
          )}
          {checkError && <p className="text-xs text-red-400">{checkError}</p>}
        </div>
      )}

      {checking && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking...
        </p>
      )}

      {quality && <QualityResults quality={quality} prefix="orig" state={state} />}

      {canRepair && (
        <div className="mt-5 space-y-3">
          {confirm === "repair" ? (
            <ConfirmBox
              message="Repair will use 1 creation from your available balance."
              confirmLabel="Repair"
              onConfirm={onRepair}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <CostButton
              label="Repair · −1 creation"
              busy={repairing}
              busyLabel="Repairing..."
              onClick={() => setConfirm("repair")}
            />
          )}
          {repairError && <p className="text-xs text-red-400">{repairError}</p>}
        </div>
      )}

      {repaired && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Repaired</p>
          <div className="mt-3 space-y-4">
            <OutputCard title="REPAIRED SONG TITLE" body={repaired.result.title} />
            <OutputCard title="REPAIRED STYLE PROMPT (METATAGS)" body={repaired.result.tags} />
            <OutputCard title="REPAIRED LYRICS & STRUCTURE" body={repaired.result.lyrics} />
            <OutputCard title="REPAIRED PRODUCER'S NOTE" body={repaired.result.note} />
          </div>
          {repaired.quality ? (
            <QualityReportBody quality={repaired.quality} />
          ) : (
            <div className="mt-4 space-y-3">
              {confirm === "recheck" ? (
                <ConfirmBox
                  message="This check will use 1 additional creation from your available balance."
                  confirmLabel="Check Again"
                  onConfirm={onRecheck}
                  onCancel={() => setConfirm(null)}
                />
              ) : (
                <CostButton
                  label="Check Again · −1 creation"
                  busy={checking}
                  busyLabel="Checking..."
                  onClick={() => setConfirm("recheck")}
                />
              )}
              {checkError && <p className="text-xs text-red-400">{checkError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Part 3 — collapsible, editable result section. Collapse is UI state only. */
function ResultSection({
  title,
  value,
  open,
  onToggle,
  onChange,
  rows,
}: {
  title: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-accent transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold tracking-wide text-gradient-neon">
            {title}
          </h2>
        </button>
        <CopyButton value={value} />
      </div>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          aria-label={title}
          className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 font-sans text-sm text-foreground outline-none transition-shadow focus:border-primary/60"
        />
      )}
    </div>
  );
}


/** Super Admin only: picks the AI model that serves every user's generations. */
function AdminModelSelector() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-model"], queryFn: () => getAiModelSetting() });
  const [saving, setSaving] = useState(false);

  return (
    <div className="glass mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-4">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">AI model (admin)</span>
      <select
        aria-label="AI model"
        value={data?.model ?? DEFAULT_AI_MODEL}
        disabled={saving}
        onChange={async (e) => {
          setSaving(true);
          try {
            await setAiModelSetting({ data: { model: e.target.value } });
            await queryClient.invalidateQueries({ queryKey: ["ai-model"] });
          } finally {
            setSaving(false);
          }
        }}
        className={fieldClass + " max-w-xs"}
      >
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-[#0a0a0c]">
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}



function GeneratePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [theme, setTheme] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [customGenre, setCustomGenre] = useState("");

  const [mood, setMood] = useState("");
  const [customMood, setCustomMood] = useState("");
  const [language, setLanguage] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ title: string; tags: string; lyrics: string; note: string } | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  // Manual quality check (never triggered automatically); costs 1 creation.
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"check" | "repair" | "recheck" | null>(null);
  // Manual repair state (never triggered automatically); available to authenticated users.
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repaired, setRepaired] = useState<{
    result: { title: string; tags: string; lyrics: string; note: string };
    quality: QualityReport | null;
  } | null>(null);

  // Links repair usage to the originating generation in analytics.
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: usage } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => getGenerationUsage(),
    enabled: !!user,
  });

  // Server-derived admin status (has_role RPC) — gates the temporary debug panel.
  const { data: moderation } = useQuery({
    queryKey: ["my-moderation"],
    queryFn: () => getMyModeration(),
    enabled: !!user,
  });

  const remaining = usage?.remaining ?? HOURLY_LIMIT;
  const minutesLeft = useMemo(() => {
    if (!usage?.resetAt) return 0;
    return Math.max(1, Math.ceil((new Date(usage.resetAt).getTime() - now) / 60000));
  }, [usage?.resetAt, now]);

  const blocked = remaining <= 0;

  // Resolve the effective value: the typed custom text when "Custom…" is chosen.
  const customGenreSelected = genres.includes(CUSTOM);
  const effectiveGenre = [
    ...genres.filter((g) => g !== CUSTOM),
    ...(customGenreSelected ? [customGenre.trim()] : []),
  ]
    .filter(Boolean)
    .join(", ");

  const effectiveMood = mood === CUSTOM ? customMood.trim() : mood;
  const effectiveLanguage = language === CUSTOM ? customLanguage.trim() : language;
  const ready =
    theme.trim().length >= 3 && !!effectiveGenre && !!effectiveMood && !!effectiveLanguage;

  const generate = async () => {
    setBusy(true);
    setStatus(null);
    setSaved(false);
    setQuality(null);
    setRepaired(null);
    setRepairError(null);
    try {
      const res = await generateSongPrompt({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.error === "rate_limited") {
        setStatus("You've hit the hourly limit. Try again soon.");
        return;
      }
      setResult(res.result);
      setGenerationId(res.generationId ?? null);
      setQuality(res.quality ?? null);

    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  // Manual: exactly one quality check per confirmed click.
  const runCheck = async (afterRepair: boolean) => {
    const target = afterRepair ? repaired?.result : result;
    if (!target) return;
    setConfirm(null);
    setChecking(true);
    setCheckError(null);
    try {
      const res = await checkSongQuality({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          result: target,
          generationId,
          afterRepair,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.error === "rate_limited") {
        setCheckError("You've hit the hourly limit. Try again soon.");
        return;
      }
      if (afterRepair) {
        setRepaired((prev) => (prev ? { ...prev, quality: res.quality } : prev));
      } else {
        setQuality(res.quality);
      }
      if (!res.quality) setCheckError("Quality check unavailable. Please try again.");
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  // Manual: exactly one repair request per confirmed click, no retries.
  const repair = async () => {
    if (!result || !quality) return;
    setConfirm(null);
    setRepairing(true);
    setRepairError(null);
    try {
      const res = await repairSongPrompt({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          result,
          quality,
          generationId,

        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.error === "rate_limited" || !res.result) {
        setRepairError("You've hit the hourly limit. Try again soon.");
        return;
      }
      setRepaired({ result: res.result, quality: res.quality });
    } catch (err) {
      setRepairError(err instanceof Error ? err.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  };


  const save = async () => {
    if (!result) return;
    try {
      await savePromptToLibrary({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          ...result,
        },
      });
      setSaved(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <span className="font-display text-lg font-bold">AI Prompt Studio</span>
        </div>
      }
    >
    <div className="px-4 py-6 pb-[220px] md:px-8 md:pb-[150px]">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to the feed
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="PromptBeats logo"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl glow-neon"
          />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">AI Prompt &amp; Lyrics Generator</h1>
            <p className="truncate text-xs text-muted-foreground">Optimized for Suno &amp; Udio</p>
          </div>
        </div>

        {moderation?.isAdmin && <AdminModelSelector />}

        <div className="glass-strong mt-6 space-y-3 rounded-3xl p-5 sm:p-6">
          <div>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              placeholder="Your theme or topic — e.g. a late-night drive through a neon city after a breakup"
              aria-label="Theme or topic"
              className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{theme.length}/300</p>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              Music Style — pick one or more to fuse
            </p>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((g) => {
                const active = genres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
                    }
                    className={
                      active
                        ? "rounded-full border border-transparent bg-gradient-neon px-3.5 py-1.5 text-xs font-semibold text-primary-foreground glow-neon transition-transform active:scale-95"
                        : "rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                    }
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Mood" className={fieldClass}>
              <option value="" disabled className="bg-[#0a0a0c]">
                Select Mood / Vibe (e.g., Energetic, Chill...)
              </option>
              {MOOD_OPTIONS.map((m) => (
                <option key={m} value={m} className="bg-[#0a0a0c]">{m}</option>
              ))}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" className={fieldClass}>
              <option value="" disabled className="bg-[#0a0a0c]">
                Select Language (e.g., English, Greek...)
              </option>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l} value={l} className="bg-[#0a0a0c]">{l}</option>
              ))}
            </select>
          </div>

          {customGenreSelected && (
            <input
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              placeholder="Type your own style tags (merged with the selected genres)"
              aria-label="Custom music style"
              className={fieldClass}
            />
          )}

          {mood === CUSTOM && (
            <input
              value={customMood}
              onChange={(e) => setCustomMood(e.target.value)}
              placeholder="Type your own mood / vibe"
              aria-label="Custom mood"
              className={fieldClass}
            />
          )}
          {language === CUSTOM && (
            <input
              value={customLanguage}
              onChange={(e) => setCustomLanguage(e.target.value)}
              placeholder="Type your own language"
              aria-label="Custom language"
              className={fieldClass}
            />
          )}

          <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
            <button
              onClick={generate}
              disabled={busy || blocked || !ready}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale sm:w-auto"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate with AI
            </button>
            <span className="text-xs text-muted-foreground">
              {blocked ? `Try again in ${minutesLeft}m` : `Generations remaining: ${remaining}/${HOURLY_LIMIT}`}
            </span>
          </div>

          {status && <p className="text-xs text-accent">{status}</p>}
        </div>

        {busy && (
          <div className="mt-6 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass h-32 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {!busy && result && (
          <div className="mt-6 space-y-4 pb-16">
            <OutputCard title="SONG TITLE" body={result.title} />
            <OutputCard title="STYLE PROMPT (METATAGS)" body={result.tags} />
            <OutputCard title="LYRICS & STRUCTURE" body={result.lyrics} />
            <OutputCard title="PRODUCER'S NOTE" body={result.note} />
            <button
              onClick={save}
              disabled={saved}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
            >
              {saved ? <Check className="h-4 w-4 text-accent" /> : <Save className="h-4 w-4" />}
              {saved ? "Saved to your library" : "Save to My Library"}
            </button>
            {(
              <QualityPanel
                quality={quality}
                checking={checking}
                onCheck={() => runCheck(false)}
                checkError={checkError}
                canRepair={hasQualityIssues(quality) && !repaired}
                repairing={repairing}
                onRepair={repair}
                repairError={repairError}
                repaired={repaired}
                confirm={confirm}
                setConfirm={setConfirm}
                onRecheck={() => runCheck(true)}
              />
            )}

          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
