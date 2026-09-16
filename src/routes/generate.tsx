import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  FlaskConical,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  ArrowLeft,
} from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/promptbeats/AppShell";
import {
  getCurrentUserAiModelAccess,
  getGenerationUsage,
  savePromptToLibrary,
  HOURLY_LIMIT,
  type QualityReport,
  type CorrectionItem,
  type QualitySuggestion,
} from "@/lib/ai.functions";
import {
  getGenerationJob,
  getLatestGenerationJob,
  dismissGenerationJob,
  startGenerationJob,
  type GenerationContext,
  type GenerationJob,
} from "@/lib/generation-jobs.functions";
import {
  getLatestQualityCheckJob,
  getQualityCheckJob,
  startQualityCheckJob,
  type QualityCheckJob,
} from "@/lib/quality-check-jobs.functions";
import {
  addToMusicStyle,
  applyFieldCorrection,
  applyLyricCorrection,
  applyVocalArrangement,
  removeFromMusicStyle,
  undoFieldCorrection,
  undoLyricCorrection,
  undoVocalArrangement,
} from "@/lib/quality-apply";
import { AI_MODELS, DEFAULT_AI_MODEL, aiModelLabel } from "@/lib/ai-models";
import {
  AI_TARGET_PLATFORMS,
  AI_TARGET_PLATFORM_LABEL,
  DEFAULT_AI_TARGET_PLATFORM,
  type AITargetPlatform,
} from "@/lib/ai-target-platforms";
import { useI18n, type AppTranslationKey } from "@/i18n";
import {
  BASIC_MUSIC_STYLES,
  BASIC_MOODS,
  SONG_LANGUAGES,
  ADVANCED_MUSIC_STYLES,
  ADVANCED_MOODS,
  INSTRUMENTS as INSTRUMENT_OPTIONS,
  SONG_STRUCTURE_TAGS,
  BPM_OPTIONS as CATALOG_BPM_OPTIONS,
  type LocalizedGeneratorOption,
} from "@/catalog/generator-options";

const JOB_STORAGE_KEY = "pb:generation-job";
const QUALITY_JOB_STORAGE_KEY = "pb:quality-check-job";

export const Route = createFileRoute("/generate")({
  head: () => ({
    meta: [
      { title: "AI Prompt & Lyrics Generator for Suno and Udio — PromptBeats" },
      {
        name: "description",
        content: "Turn one idea into a Suno/Udio-ready style prompt, structured lyrics, and a producer's note in seconds.",
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
const GENRE_OPTIONS = [CUSTOM, ...BASIC_MUSIC_STYLES.map((option) => option.value).filter((value) => value !== CUSTOM)];
const MOOD_OPTIONS = [CUSTOM, ...BASIC_MOODS.map((option) => option.value).filter((value) => value !== CUSTOM)];
const LANGUAGE_OPTIONS = [CUSTOM, ...SONG_LANGUAGES.map((option) => option.value).filter((value) => value !== CUSTOM)];
const ADVANCED_STYLES = ADVANCED_MUSIC_STYLES.map((option) => option.value);
const ADVANCED_MOOD_VALUES = ADVANCED_MOODS.map((option) => option.value);
const INSTRUMENTS = INSTRUMENT_OPTIONS.map((option) => option.value);
const STRUCTURE_TAGS = SONG_STRUCTURE_TAGS.map((option) => option.value);
const BPM_OPTIONS = ["Auto", "Custom", ...CATALOG_BPM_OPTIONS.map((option) => option.value).filter((value) => value !== "Auto" && value !== "Custom")];

function translatedOption(
  options: readonly LocalizedGeneratorOption[],
  value: string,
  t: (key: AppTranslationKey, values?: Record<string, string | number>) => string,
) {
  const item = options.find((option) => option.value === value);
  return item ? t(item.labelKey) : value;
}

function mergeValues(selected: string[], custom: string) {
  const out: string[] = [];
  for (const v of [...selected, ...custom.split(",")]) {
    const text = v.trim();
    if (!text) continue;
    if (out.some((x) => x.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
  }
  return out;
}

function ChipGroup({
  options,
  selected,
  onToggle,
  label,
  labelFor,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
  labelFor?: (value: string) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option)}
            className={
              active
                ? "rounded-full border border-transparent bg-gradient-neon px-3.5 py-1.5 text-xs font-semibold text-primary-foreground glow-neon transition-transform active:scale-95"
                : "rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
            }
          >
            {labelFor ? labelFor(option) : option}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">{children}</p>;
}

function SectionHeader({ title, hint, onClear }: { title: string; hint?: string; onClear?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-white/5 border-l-2 border-l-accent bg-white/[0.02] px-2.5 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90">{title}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{"\u00b7 "}{hint}</span>}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${t("generator.clear")} ${title}`}
          title={`${t("generator.clear")} ${title}`}
          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-red-300"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={t("common.copy")}
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

function QualityIssueList({ label, items }: { label: string; items: string[] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground/70">{t("quality.none")}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-foreground/90">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function ActualIssues({ quality }: { quality: QualityReport }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <QualityIssueList label={t("quality.issues")} items={quality.issues} />
      <QualityIssueList label={t("quality.languageIssues")} items={quality.languageIssues} />
      <QualityIssueList label={t("quality.grammarIssues")} items={quality.grammarIssues} />
      <QualityIssueList label={t("quality.singabilityIssues")} items={quality.singabilityIssues} />
      <QualityIssueList label={t("quality.genreIssues")} items={quality.genreIssues} />
      <QualityIssueList label={t("quality.consistencyIssues")} items={quality.consistencyIssues} />
    </div>
  );
}

function CostButton({
  label,
  busy,
  busyLabel,
  disabled = false,
  onClick,
}: {
  label: string;
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
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
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="text-xs text-foreground/90">{message}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onConfirm} className="rounded-lg bg-gradient-neon px-4 py-2 text-xs font-semibold text-primary-foreground">{confirmLabel}</button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">{t("common.cancel")}</button>
      </div>
    </div>
  );
}

type ApplyState = {
  applied: Record<string, boolean>;
  errors: Record<string, string>;
  onApplyCorrection: (id: string, c: CorrectionItem) => void;
  onUndoCorrection: (id: string, c: CorrectionItem) => void;
  onApplySuggestion: (id: string, s: QualitySuggestion) => void;
  onUndoSuggestion: (id: string, s: QualitySuggestion) => void;
};

function ApplyRow({ id, state, onApply, onUndo }: { id: string; state: ApplyState; onApply: () => void; onUndo: () => void }) {
  const { t } = useI18n();
  const done = state.applied[id];
  const error = state.errors[id];
  return (
    <div className="mt-2">
      <button
        onClick={done ? onUndo : onApply}
        className={done ? "rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground" : "rounded-lg border border-accent/50 px-3 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent/10"}
      >
        {done ? t("quality.undo") : t("quality.apply")}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function CorrectionCard({ id, c, state }: { id: string; c: CorrectionItem; state: ApplyState }) {
  const { t } = useI18n();
  const fieldLabel: Record<CorrectionItem["field"], string> = {
    title: t("quality.songTitle"),
    tags: t("quality.musicStyle"),
    lyrics: t("quality.lyrics"),
    note: t("quality.producerNote"),
  };
  return (
    <div className="rounded-xl border border-red-400/25 bg-red-400/5 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{fieldLabel[c.field]}{c.field === "lyrics" && c.sectionLabel ? ` · [${c.sectionLabel}]` : ""}</p>
      <p className="mt-1 text-xs text-foreground/90">{c.reason}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground line-through">{c.originalText}</p>
      <p className="whitespace-pre-wrap text-xs text-green-300">{c.replacementText}</p>
      <ApplyRow id={id} state={state} onApply={() => state.onApplyCorrection(id, c)} onUndo={() => state.onUndoCorrection(id, c)} />
    </div>
  );
}

function SuggestionCard({ id, s, state }: { id: string; s: QualitySuggestion; state: ApplyState }) {
  const { t } = useI18n();
  const applicable = s.actionType !== "informational";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold text-foreground">{s.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{s.explanation}</p>
      {s.actionType === "add_to_music_style" && s.value && <p className="mt-2 text-[11px] text-accent">{t("quality.addMusicStyle", { value: s.value })}</p>}
      {s.actionType === "vocal_arrangement" && s.arrangement.length > 0 && <p className="mt-2 text-[11px] text-accent">{s.arrangement.map((a) => `${a.tag} → ${a.sectionLabel}`).join(" · ")}</p>}
      {applicable && <ApplyRow id={id} state={state} onApply={() => state.onApplySuggestion(id, s)} onUndo={() => state.onUndoSuggestion(id, s)} />}
    </div>
  );
}

function SuggestionGroup({ heading, hint, items, prefix, state }: { heading: string; hint: string; items: QualitySuggestion[]; prefix: string; state: ApplyState }) {
  if (!items.length) return null;
  return (
    <div className="mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{heading}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <div className="mt-2 space-y-2">{items.map((s, i) => <SuggestionCard key={`${prefix}-${i}`} id={`${prefix}-${i}`} s={s} state={state} />)}</div>
    </div>
  );
}

function QualityResults({ quality, prefix, state, model }: { quality: QualityReport; prefix: string; state: ApplyState; model: string | null }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-4">
      {model && <p className="text-xs text-muted-foreground">{t("quality.checkedWith", { model: aiModelLabel(model) })}</p>}
      <div className="flex items-center gap-4 text-sm">
        <span>{t("quality.passed")}: <strong className={quality.passed ? "text-green-400" : "text-red-400"}>{quality.passed ? t("quality.yes") : t("quality.no")}</strong></span>
        <span>{t("quality.score")}: <strong className="text-foreground">{quality.score}/10</strong></span>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">{t("quality.actualIssues")}</p>
        <p className="text-[11px] text-muted-foreground">{t("quality.actualIssuesHint")}</p>
        <div className="mt-2"><ActualIssues quality={quality} /></div>
        {quality.corrections.length > 0 && <div className="mt-3 space-y-2">{quality.corrections.map((c, i) => <CorrectionCard key={`${prefix}-fix-${i}`} id={`${prefix}-fix-${i}`} c={c} state={state} />)}</div>}
      </div>
      <SuggestionGroup heading={t("quality.creative")} hint={t("quality.creativeHint")} items={quality.creativeSuggestions} prefix={`${prefix}-cre`} state={state} />
      <SuggestionGroup heading={t("quality.production")} hint={t("quality.productionHint")} items={[...quality.vocalSuggestions, ...quality.productionSuggestions]} prefix={`${prefix}-vop`} state={state} />
    </div>
  );
}

function QualityPanel({
  quality,
  checking,
  onCheck,
  checkError,
  confirm,
  setConfirm,
  state,
  qualityCheckModel,
  availableModels,
  modelAccessLoading,
  modelAccessReady,
  modelAccessUnavailable,
  onQualityCheckModelChange,
  qualityCheckResultModel,
  showQualityCheckModelSelector,
}: {
  quality: QualityReport | null;
  checking: boolean;
  onCheck: () => void;
  checkError: string | null;
  confirm: "check" | "recheck" | null;
  setConfirm: (v: "check" | "recheck" | null) => void;
  state: ApplyState;
  qualityCheckModel: string;
  availableModels: typeof AI_MODELS;
  modelAccessLoading: boolean;
  modelAccessReady: boolean;
  modelAccessUnavailable: boolean;
  onQualityCheckModelChange: (model: string) => void;
  qualityCheckResultModel: string | null;
  showQualityCheckModelSelector: boolean;
}) {
  const { t } = useI18n();
  const mode = quality ? "recheck" : "check";
  return (
    <div className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-5">
      <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-accent" /><h2 className="font-display text-sm font-semibold tracking-wide text-accent">{t("quality.title")}</h2></div>
      {quality && <QualityResults quality={quality} prefix="orig" state={state} model={qualityCheckResultModel} />}
      {checking && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("quality.checking")}</p>}
      {!checking && (
        <div className="mt-4 space-y-3">
          {modelAccessLoading && <p className="text-xs text-muted-foreground">{t("quality.loadingModels")}</p>}
          {modelAccessUnavailable && <p className="text-xs text-red-400">{t("quality.noModel")}</p>}
          {modelAccessReady && !modelAccessUnavailable && showQualityCheckModelSelector && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><span>{t("quality.checkWith")}</span><select aria-label={t("quality.model")} value={qualityCheckModel} onChange={(e) => onQualityCheckModelChange(e.target.value)} className="max-w-[13rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-foreground">{availableModels.map((m) => <option key={m.id} value={m.id} className="bg-[#0a0a0c]">{m.label}</option>)}</select></label>
          )}
          {modelAccessReady && !modelAccessUnavailable && !showQualityCheckModelSelector && <p className="text-xs text-muted-foreground">{t("quality.checkWith")} {aiModelLabel(qualityCheckModel)}</p>}
          {confirm === mode ? (
            <ConfirmBox message={quality ? t("quality.confirmAgain") : t("quality.confirmFirst")} confirmLabel={quality ? t("quality.checkAgain") : t("quality.check")} onConfirm={onCheck} onCancel={() => setConfirm(null)} />
          ) : (
            <CostButton label={quality ? t("quality.checkAgainCost") : t("quality.checkCost")} busy={false} busyLabel="" disabled={modelAccessLoading || modelAccessUnavailable} onClick={() => setConfirm(mode)} />
          )}
          {checkError && <p className="text-xs text-red-400">{checkError}</p>}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, value, open, onToggle, onChange, rows }: { title: string; value: string; open: boolean; onToggle: () => void; onChange: (v: string) => void; rows: number }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left"><ChevronDown className={`h-4 w-4 shrink-0 text-accent transition-transform ${open ? "" : "-rotate-90"}`} /><h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold tracking-wide text-gradient-neon">{title}</h2></button>
        <CopyButton value={value} />
      </div>
      {open && <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-label={title} className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 font-sans text-sm text-foreground outline-none transition-shadow focus:border-primary/60" />}
    </div>
  );
}

function GeneratePage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [advanced, setAdvanced] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState<AITargetPlatform>(DEFAULT_AI_TARGET_PLATFORM);
  const [theme, setTheme] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [customGenre, setCustomGenre] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [customMood, setCustomMood] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [customInstruments, setCustomInstruments] = useState("");
  const [structure, setStructure] = useState<string[]>([]);
  const [production, setProduction] = useState("");
  const [instructions, setInstructions] = useState("");
  const [bpm, setBpm] = useState("Auto");
  const [customBpm, setCustomBpm] = useState("");
  const [language, setLanguage] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ title: string; tags: string; lyrics: string; note: string } | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [generationModel, setGenerationModel] = useState(DEFAULT_AI_MODEL);
  const [generationModelChosen, setGenerationModelChosen] = useState(false);
  const [generationResultModel, setGenerationResultModel] = useState<string | null>(null);
  const [qualityCheckModel, setQualityCheckModel] = useState(DEFAULT_AI_MODEL);
  const [qualityCheckModelChosen, setQualityCheckModelChosen] = useState(false);
  const [qualityCheckResultModel, setQualityCheckResultModel] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"check" | "recheck" | null>(null);
  const [songContext, setSongContext] = useState<GenerationContext | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [open, setOpen] = useState({ title: false, tags: false, lyrics: false, note: false });
  const allOpen = open.title && open.tags && open.lyrics && open.note;
  const toggleAll = () => setOpen({ title: !allOpen, tags: !allOpen, lyrics: !allOpen, note: !allOpen });
  const [confirmClear, setConfirmClear] = useState(false);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const setApplyError = (id: string, msg: string | null) => setApplyErrors((prev) => { const next = { ...prev }; if (msg) next[id] = msg; else delete next[id]; return next; });
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [jobId, setJobId] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);

  function rememberJob(id: string | null) {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(JOB_STORAGE_KEY, id);
    else window.localStorage.removeItem(JOB_STORAGE_KEY);
  }

  function applyJob(job: GenerationJob) {
    const inputTargetPlatform = (
      job.input as (GenerationContext & { targetPlatform?: AITargetPlatform }) | null
    )?.targetPlatform;
    if (inputTargetPlatform) setTargetPlatform(inputTargetPlatform);
    if (job.status === "completed" && job.result) {
      setResult(job.result); setGenerationId(job.generationId); setGenerationResultModel(job.model); setSongContext(job.input); setQuality(null); setQualityCheckResultModel(null); setOpen({ title: false, tags: false, lyrics: false, note: false }); setStatus(null); setBusy(false); setJobId(null); rememberJob(null); void queryClient.invalidateQueries({ queryKey: ["ai-usage"] }); return;
    }
    if (job.status === "cancelled") { setBusy(false); setGenerationResultModel(null); setStatus(null); setJobId(null); rememberJob(null); return; }
    if (job.status === "failed") { setStatus(job.error ?? t("generator.failed")); setBusy(false); setGenerationResultModel(null); setJobId(null); rememberJob(null); void queryClient.invalidateQueries({ queryKey: ["ai-usage"] }); return; }
    rememberJob(job.jobId); setJobId(job.jobId); setBusy(true); setStatus(t("generator.generating"));
  }

  const { data: jobData, refetch: refetchJob } = useQuery({ queryKey: ["gen-job", jobId], queryFn: () => getGenerationJob({ data: { jobId: jobId as string } }), enabled: !!jobId, refetchInterval: 2500, refetchOnWindowFocus: true, gcTime: 0 });
  useEffect(() => { const job = jobData?.job; if (!job || job.jobId !== jobId) return; applyJob(job); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobData, jobId]);
  useEffect(() => {
    if (!user || jobId || result) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(JOB_STORAGE_KEY) : null;
    if (stored) { setJobId(stored); setBusy(true); return; }
    let cancelled = false;
    void getLatestGenerationJob().then((r) => { const job = r.job; if (cancelled || !job) return; if (job.status === "pending" || job.status === "processing" || job.status === "completed") applyJob(job); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, jobId, result]);

  const [qualityActionId, setQualityActionId] = useState<string | null>(null);
  const pendingQualityKey = useRef<string | null>(null);
  function rememberQualityJob(id: string | null) { if (typeof window === "undefined") return; if (id) window.localStorage.setItem(QUALITY_JOB_STORAGE_KEY, id); else window.localStorage.removeItem(QUALITY_JOB_STORAGE_KEY); }
  function applyQualityJob(job: QualityCheckJob) {
    if (job.status === "completed") {
      if (job.qualityReport) { setQuality(job.qualityReport); setQualityCheckResultModel(job.model); setApplied({}); setApplyErrors({}); setCheckError(null); } else setCheckError(t("quality.invalid"));
      setChecking(false); setQualityActionId(null); rememberQualityJob(null); pendingQualityKey.current = null; void queryClient.invalidateQueries({ queryKey: ["ai-usage"] }); return;
    }
    if (job.status === "failed") { setCheckError(job.error ?? t("quality.unavailable")); setChecking(false); setQualityActionId(null); rememberQualityJob(null); pendingQualityKey.current = null; void queryClient.invalidateQueries({ queryKey: ["ai-usage"] }); return; }
    rememberQualityJob(job.actionId); setQualityActionId(job.actionId); setChecking(true); setCheckError(null);
  }

  const { data: qualityJobData, refetch: refetchQualityJob } = useQuery({ queryKey: ["quality-job", qualityActionId], queryFn: () => getQualityCheckJob({ data: { actionId: qualityActionId as string } }), enabled: !!qualityActionId, refetchInterval: 2500, refetchOnWindowFocus: true, gcTime: 0 });
  useEffect(() => { if (!qualityActionId || !qualityJobData) return; if (!qualityJobData.job) { setQualityActionId(null); setChecking(false); rememberQualityJob(null); return; } if (qualityJobData.job.actionId !== qualityActionId) return; applyQualityJob(qualityJobData.job); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qualityJobData, qualityActionId]);
  useEffect(() => {
    if (!user || !result || qualityActionId || quality) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(QUALITY_JOB_STORAGE_KEY) : null;
    if (stored) { setQualityActionId(stored); setChecking(true); return; }
    if (!generationId) return;
    let cancelled = false;
    void getLatestQualityCheckJob({ data: { generationId } }).then((r) => { if (cancelled || !r.job) return; applyQualityJob(r.job); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, result, generationId, qualityActionId, quality]);

  useEffect(() => {
    const sync = () => { if (document.visibilityState !== "visible") return; if (jobId) void refetchJob(); if (qualityActionId) void refetchQualityJob(); };
    document.addEventListener("visibilitychange", sync); window.addEventListener("online", sync);
    return () => { document.removeEventListener("visibilitychange", sync); window.removeEventListener("online", sync); };
  }, [jobId, qualityActionId, refetchJob, refetchQualityJob]);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth", replace: true }); }, [loading, user, navigate]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const { data: usage } = useQuery({ queryKey: ["ai-usage"], queryFn: () => getGenerationUsage(), enabled: !!user });
  const { data: aiModelAccess, isLoading: aiModelAccessLoading, error: aiModelAccessError } = useQuery({ queryKey: ["my-ai-model-access"], queryFn: () => getCurrentUserAiModelAccess(), enabled: !!user });

  useEffect(() => {
    if (!aiModelAccess) return;
    if (!generationModelChosen || !aiModelAccess.availableModels.includes(generationModel as (typeof aiModelAccess.availableModels)[number])) setGenerationModel(aiModelAccess.defaultModel);
    if (!qualityCheckModelChosen || !aiModelAccess.availableModels.includes(qualityCheckModel as (typeof aiModelAccess.availableModels)[number])) setQualityCheckModel(aiModelAccess.defaultModel);
  }, [aiModelAccess, generationModel, generationModelChosen, qualityCheckModel, qualityCheckModelChosen]);

  const modelAccessLoading = aiModelAccessLoading || (!aiModelAccess && !aiModelAccessError);
  const modelAccessReady = !!aiModelAccess;
  const availableModels = modelAccessReady ? AI_MODELS.filter((model) => aiModelAccess.availableModels.includes(model.id)) : [];
  const modelAccessUnavailable = (!!aiModelAccessError || modelAccessReady) && availableModels.length === 0;
  const showGenerationModelSelector = availableModels.length > 1;
  const showQualityCheckModelSelector = availableModels.length > 1;
  const songContextTargetPlatform = (
    songContext as (GenerationContext & { targetPlatform?: AITargetPlatform }) | null
  )?.targetPlatform;
  const effectiveTargetPlatform = songContextTargetPlatform ?? targetPlatform;
  const resultTagsLabel = effectiveTargetPlatform === "udio"
    ? t("generator.result.udioPrompt")
    : t("generator.result.stylePrompt");
  const remaining = usage?.remaining ?? HOURLY_LIMIT;
  const hasAdminInputBypass = usage?.unlimited === true;
  const minutesLeft = useMemo(() => { if (!usage?.resetAt) return 0; return Math.max(1, Math.ceil((new Date(usage.resetAt).getTime() - now) / 60000)); }, [usage?.resetAt, now]);
  const blocked = remaining <= 0;

  const customGenreSelected = genres.includes(CUSTOM);
  const styleList = mergeValues(genres.filter((g) => g !== CUSTOM), advanced || customGenreSelected ? customGenre : "");
  const baseGenre = styleList.join(", ");
  const instrumentList = mergeValues(instruments, customInstruments);
  const effectiveBpm = bpm === "Auto" ? "" : bpm === "Custom" ? customBpm.trim() : bpm;
  const bpmNumber = Number(effectiveBpm);
  const bpmInvalid = !!effectiveBpm && (!/^\d{1,3}$/.test(effectiveBpm) || bpmNumber < 40 || bpmNumber > 260);
  const direction = [instrumentList.length ? `Preferred instruments: ${instrumentList.join(", ")}.` : "", !bpmInvalid && effectiveBpm ? `Target tempo: ${effectiveBpm} BPM.` : ""].filter(Boolean).join(" ");
  const effectiveGenre = direction ? `${baseGenre} — Additional musical direction: ${direction}` : baseGenre;

  const useCustomMood = advanced || moods[0] === CUSTOM;
  const moodList = mergeValues(moods.filter((m) => m !== CUSTOM), useCustomMood ? customMood : "");
  const effectiveMood = moodList.join(", ");

  const effectiveLanguage = language === CUSTOM ? customLanguage.trim() : language;
  const musicStyleLimit = advanced ? 150 : 400;
  const themeLimit = advanced ? 500 : 300;
  const moodLimit = advanced ? 120 : 60;
  const instrumentsText = instrumentList.join(", ");
  const themeTooLong = theme.trim().length > themeLimit;
  const musicStyleTooLong = advanced ? baseGenre.length > musicStyleLimit : effectiveGenre.length > musicStyleLimit;
  const moodTooLong = effectiveMood.length > moodLimit;
  const instrumentsTooLong = advanced && instrumentsText.length > 200;
  const validationError = bpmInvalid
    ? t("generator.bpmError")
    : hasAdminInputBypass
      ? null
      : advanced
        ? themeTooLong
          ? t("generator.themeTooLong", { count: theme.trim().length, limit: themeLimit })
          : musicStyleTooLong
            ? t("generator.musicStyleTooLong", { count: baseGenre.length, limit: musicStyleLimit })
            : moodTooLong
              ? t("generator.moodTooLong", { count: effectiveMood.length, limit: moodLimit })
              : instrumentsTooLong
                ? t("generator.instrumentsTooLong", { count: instrumentsText.length, limit: 200 })
                : null
        : themeTooLong
          ? t("generator.themeTooLong", { count: theme.trim().length, limit: themeLimit })
          : moodTooLong
            ? t("generator.moodTooLong", { count: effectiveMood.length, limit: moodLimit })
            : musicStyleTooLong
              ? t("generator.selectionTooLong")
              : null;
  const ready = theme.trim().length >= 3 && !!baseGenre && !!effectiveMood && !!effectiveLanguage && !validationError;

  const pickPrimary = (setter: (fn: (prev: string[]) => string[]) => void) => (value: string) => setter((prev) => [value, ...prev.slice(1).filter((x) => x !== value)]);
  const toggleValue = (setter: (fn: (prev: string[]) => string[]) => void) => (value: string) => setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  const generate = async () => {
    if (busy || jobId || checking || qualityActionId) return;
    setBusy(true); setStatus(t("generator.starting")); setSaved(false); setResult(null); setQuality(null); setGenerationResultModel(null); setQualityCheckResultModel(null); setSongContext(null); setApplied({}); setApplyErrors({});
    const key = pendingKey.current ?? crypto.randomUUID(); pendingKey.current = key;
    try {
      const res = await startGenerationJob({ data: { idempotencyKey: key, theme: theme.trim(), genre: effectiveGenre, mood: effectiveMood, language: effectiveLanguage, targetPlatform, generationModel, advanced, baseMusicStyle: baseGenre, instruments: instrumentsText, structure: structure.join(" → ").slice(0, 600), production: production.trim().slice(0, 2000), instructions: instructions.trim().slice(0, 2000) } });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.rateLimited || !res.job) { setStatus(t("generator.rateLimit")); setBusy(false); pendingKey.current = null; return; }
      pendingKey.current = null; applyJob(res.job);
    } catch (err) {
      try { const latest = await getLatestGenerationJob(); if (latest.job && latest.job.status !== "failed") { pendingKey.current = null; applyJob(latest.job); return; } } catch { /* still offline */ }
      setStatus(err instanceof Error ? err.message : t("generator.failed")); setBusy(false);
    }
  };

  const runCheck = async () => {
    if (checking || qualityActionId) return;
    const target = resultRef.current; if (!target) return;
    const idempotencyKey = pendingQualityKey.current ?? crypto.randomUUID(); pendingQualityKey.current = idempotencyKey; setConfirm(null); setChecking(true); setCheckError(null);
    try {
      const res = await startQualityCheckJob({ data: { theme: songContext?.theme?.trim() || theme.trim(), genre: songContext?.genre || effectiveGenre, mood: songContext?.mood || effectiveMood, language: songContext?.language || effectiveLanguage, targetPlatform: effectiveTargetPlatform, structure: songContext?.structure ?? structure.join(" → ").slice(0, 600), production: songContext?.production ?? production.trim().slice(0, 2000), instructions: songContext?.instructions ?? instructions.trim().slice(0, 2000), result: { ...target }, idempotencyKey, qualityCheckModel, generationId } });
      if (res.rateLimited || !res.job) { pendingQualityKey.current = null; setChecking(false); setCheckError(t("generator.rateLimit")); return; }
      pendingQualityKey.current = null; applyQualityJob(res.job);
    } catch (err) {
      if (generationId) { try { const latest = await getLatestQualityCheckJob({ data: { generationId } }); if (latest.job) { pendingQualityKey.current = null; applyQualityJob(latest.job); return; } } catch { /* offline */ } }
      setChecking(false); setCheckError(err instanceof Error ? err.message : t("quality.unavailable"));
    }
  };

  const save = async () => {
    if (!result) return;
    try { await savePromptToLibrary({ data: { theme: theme.trim(), genre: effectiveGenre, mood: effectiveMood, language: effectiveLanguage, ...result } }); setSaved(true); }
    catch (err) { setStatus(err instanceof Error ? err.message : t("auth.somethingWrong")); }
  };

  type Song = { title: string; tags: string; lyrics: string; note: string };
  const makeApplyState = (target: Song | null, setTarget: (next: Song) => void): ApplyState => ({
    applied,
    errors: applyErrors,
    onApplyCorrection: (id, c) => {
      if (!target) return;
      const res = c.field === "lyrics" ? applyLyricCorrection(target.lyrics, c) : applyFieldCorrection(target[c.field], c);
      if (!res.ok) return setApplyError(id, res.error);
      setTarget({ ...target, [c.field]: res.text }); setApplyError(id, null); setApplied((p) => ({ ...p, [id]: true }));
    },
    onUndoCorrection: (id, c) => {
      if (!target) return;
      const res = c.field === "lyrics" ? undoLyricCorrection(target.lyrics, c) : undoFieldCorrection(target[c.field], c);
      if (!res.ok) return setApplyError(id, res.error);
      setTarget({ ...target, [c.field]: res.text }); setApplyError(id, null); setApplied((p) => ({ ...p, [id]: false }));
    },
    onApplySuggestion: (id, s) => {
      if (!target) return;
      if (s.actionType === "add_to_music_style") { const res = addToMusicStyle(target.tags, s.value); if (!res.ok) return setApplyError(id, res.error); setTarget({ ...target, tags: res.text }); }
      else if (s.actionType === "vocal_arrangement") { const lyricsRes = applyVocalArrangement(target.lyrics, s.arrangement); if (!lyricsRes.ok) return setApplyError(id, lyricsRes.error); const styleRes = s.value ? addToMusicStyle(target.tags, s.value) : null; setTarget({ ...target, lyrics: lyricsRes.text, tags: styleRes?.ok ? styleRes.text : target.tags }); }
      else return;
      setApplyError(id, null); setApplied((p) => ({ ...p, [id]: true }));
    },
    onUndoSuggestion: (id, s) => {
      if (!target) return;
      if (s.actionType === "add_to_music_style") { const res = removeFromMusicStyle(target.tags, s.value); if (!res.ok) return setApplyError(id, res.error); setTarget({ ...target, tags: res.text }); }
      else if (s.actionType === "vocal_arrangement") { const lyricsRes = undoVocalArrangement(target.lyrics, s.arrangement); if (!lyricsRes.ok) return setApplyError(id, lyricsRes.error); const styleRes = s.value ? removeFromMusicStyle(target.tags, s.value) : null; setTarget({ ...target, lyrics: lyricsRes.text, tags: styleRes?.ok ? styleRes.text : target.tags }); }
      else return;
      setApplyError(id, null); setApplied((p) => ({ ...p, [id]: false }));
    },
  });
  const applyState = makeApplyState(result, setResult);

  const canClear = !!theme.trim() || genres.length > 0 || !!customGenre.trim() || moods.length > 0 || !!customMood.trim() || !!language || !!customLanguage.trim() || instruments.length > 0 || !!customInstruments.trim() || bpm !== "Auto" || !!customBpm.trim() || structure.length > 0 || !!production.trim() || !!instructions.trim() || targetPlatform !== DEFAULT_AI_TARGET_PLATFORM || !!result || !!quality;
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const clearAll = async () => {
    if (clearing || checking) return;
    setClearError(null);
    let dismissedWhileRunning = false;
    if (jobId) {
      setClearing(true);
      try { const { outcome } = await dismissGenerationJob({ data: { jobId } }); dismissedWhileRunning = outcome === "DISMISSED"; }
      catch { setClearError(t("generator.dismissFailed")); return; }
      finally { setClearing(false); }
    }
    setTheme(""); setGenres([]); setCustomGenre(""); setMoods([]); setCustomMood(""); setLanguage(""); setCustomLanguage(""); setInstruments([]); setCustomInstruments(""); setStructure([]); setProduction(""); setInstructions(""); setBpm("Auto"); setCustomBpm(""); setTargetPlatform(DEFAULT_AI_TARGET_PLATFORM); setResult(null); setGenerationId(null); setGenerationResultModel(null); setQuality(null); setQualityCheckResultModel(null); setSongContext(null); setJobId(null); rememberJob(null); pendingKey.current = null; setQualityActionId(null); rememberQualityJob(null); pendingQualityKey.current = null; setBusy(false); setChecking(false); setCheckError(null); setStatus(null); setSaved(false); setApplied({}); setApplyErrors({}); setConfirm(null); setConfirmClear(false); setOpen({ title: false, tags: false, lyrics: false, note: false });
    if (dismissedWhileRunning) setStatus(t("generator.clearedRunning"));
  };

  const styleLabel = (value: string) => translatedOption(advanced ? ADVANCED_MUSIC_STYLES : BASIC_MUSIC_STYLES, value, t);
  const moodLabel = (value: string) => translatedOption(advanced ? ADVANCED_MOODS : BASIC_MOODS, value, t);
  const instrumentLabel = (value: string) => translatedOption(INSTRUMENT_OPTIONS, value, t);
  const languageLabel = (value: string) => translatedOption(SONG_LANGUAGES, value, t);
  const structureLabel = (value: string) => translatedOption(SONG_STRUCTURE_TAGS, value, t);

  return (
    <AppShell header={<div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /><span className="font-display text-lg font-bold">AI Prompt Studio</span></div>}>
      <div className="px-4 py-6 pb-[220px] md:px-8 md:pb-[150px]">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t("generator.backToFeed")}</Link>
          <div className="mt-4 flex items-center gap-3">
            <img src={logoAsset.url} alt="PromptBeats logo" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl glow-neon" />
            <div className="min-w-0"><h1 className="font-display text-2xl font-bold tracking-tight">{t("generator.title")}</h1><p className="truncate text-xs text-muted-foreground">{t("generator.optimizedFor")}</p></div>
          </div>

          <div className="glass-strong mt-6 space-y-4 rounded-3xl p-5 sm:p-6">
            <div>
              <FieldLabel>{t("generator.targetPlatform")}</FieldLabel>
              <p className="mb-2 text-xs text-muted-foreground">{t("generator.targetPlatformHint")}</p>
              <div className="flex items-center gap-2" role="group" aria-label={t("generator.targetPlatform")}>
                {AI_TARGET_PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={targetPlatform === platform}
                    onClick={() => setTargetPlatform(platform)}
                    className={targetPlatform === platform ? "rounded-full border border-transparent bg-gradient-neon px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-neon" : "rounded-full border border-white/10 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"}
                  >
                    {AI_TARGET_PLATFORM_LABEL[platform]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2" role="group" aria-label={t("generator.mode")}>
                {[{ key: false, label: t("generator.basic") }, { key: true, label: t("generator.advanced") }].map((mode) => <button key={String(mode.key)} type="button" aria-pressed={advanced === mode.key} onClick={() => setAdvanced(mode.key)} className={advanced === mode.key ? "rounded-full border border-transparent bg-gradient-neon px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-neon" : "rounded-full border border-white/10 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"}>{mode.label}</button>)}
              </div>
              {canClear && <button onClick={() => setConfirmClear(true)} disabled={busy || checking} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> {t("generator.clear")}</button>}
            </div>

            <div>
              {advanced ? <SectionHeader title={t("generator.theme")} onClear={() => setTheme("")} /> : <FieldLabel>{t("generator.theme")}</FieldLabel>}
              <textarea value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={hasAdminInputBypass ? undefined : themeLimit} rows={3} placeholder={t("generator.themePlaceholder")} aria-label={t("generator.theme")} className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]" />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{theme.length}/{themeLimit}</p>
            </div>

            <div>
              {!advanced && <FieldLabel>{t("generator.musicStyle")}</FieldLabel>}
              {advanced ? <><SectionHeader title={t("generator.musicStyle")} hint={t("generator.pickMany")} onClear={() => { setGenres([]); setCustomGenre(""); }} /><ChipGroup label={t("generator.musicStyle")} options={ADVANCED_STYLES.filter((style) => style !== CUSTOM)} selected={genres} onToggle={toggleValue(setGenres)} labelFor={styleLabel} /><p className="mt-1 text-right text-[11px] text-muted-foreground">{baseGenre.length}/150</p></> : (
                <select value={genres[0] ?? ""} onChange={(e) => pickPrimary(setGenres)(e.target.value)} aria-label={t("generator.musicStyle")} className={fieldClass}>
                  <option value="" disabled className="bg-[#0a0a0c]">{t("generator.selectMusicStyle")}</option>
                  {GENRE_OPTIONS.map((genre) => <option key={genre} value={genre} className="bg-[#0a0a0c]">{genre === CUSTOM ? t("generator.option.custom") : translatedOption(BASIC_MUSIC_STYLES, genre, t)}</option>)}
                </select>
              )}
            </div>

            {(advanced || customGenreSelected) && <input value={customGenre} onChange={(e) => setCustomGenre(e.target.value)} placeholder={t("generator.customStylePlaceholder")} aria-label={`${t("common.custom")} ${t("generator.musicStyle")}`} maxLength={advanced && !hasAdminInputBypass ? 150 : undefined} className={advanced ? fieldClass + " mt-2" : fieldClass} />}

            {advanced ? <>
              <div><SectionHeader title={t("generator.mood")} hint={t("generator.pickMany")} onClear={() => { setMoods([]); setCustomMood(""); }} /><ChipGroup label={t("generator.mood")} options={ADVANCED_MOOD_VALUES} selected={moods} onToggle={toggleValue(setMoods)} labelFor={moodLabel} /><input value={customMood} onChange={(e) => setCustomMood(e.target.value)} placeholder={t("generator.customMoodPlaceholder")} aria-label={`${t("common.custom")} ${t("generator.mood")}`} maxLength={hasAdminInputBypass ? undefined : 120} className={fieldClass + " mt-2"} /><p className="mt-1 text-right text-[11px] text-muted-foreground">{effectiveMood.length}/120</p></div>
              <div><SectionHeader title={t("generator.instruments")} hint={t("generator.pickMany")} onClear={() => { setInstruments([]); setCustomInstruments(""); }} /><ChipGroup label={t("generator.instruments")} options={INSTRUMENTS} selected={instruments} onToggle={toggleValue(setInstruments)} labelFor={instrumentLabel} /><input value={customInstruments} onChange={(e) => setCustomInstruments(e.target.value)} placeholder={t("generator.customInstrumentsPlaceholder")} aria-label={`${t("common.custom")} ${t("generator.instruments")}`} maxLength={hasAdminInputBypass ? undefined : 200} className={fieldClass + " mt-2"} /><p className="mt-1 text-right text-[11px] text-muted-foreground">{instrumentsText.length}/200</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><SectionHeader title={t("generator.bpm")} hint={t("generator.chooseOne")} onClear={() => { setBpm("Auto"); setCustomBpm(""); }} /><select value={bpm} onChange={(e) => setBpm(e.target.value)} aria-label={t("generator.bpm")} className={fieldClass}>{BPM_OPTIONS.map((item) => <option key={item} value={item} className="bg-[#0a0a0c]">{item === "Auto" ? t("generator.option.auto") : item === "Custom" ? t("common.custom") : item}</option>)}</select></div>
                {bpm === "Custom" && <div><FieldLabel>{t("generator.customBpm")}</FieldLabel><input type="number" min={40} max={260} value={customBpm} onChange={(e) => setCustomBpm(e.target.value)} placeholder={t("generator.customBpmPlaceholder")} aria-label={t("generator.customBpm")} className={fieldClass} /></div>}
              </div>
              <div>
                <SectionHeader title={t("generator.songStructure")} hint={t("generator.structureHint")} onClear={() => setStructure([])} />
                {structure.length > 0 && <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">{structure.map((item, i) => <span key={`${item}-${i}`} className="flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-xs text-accent">{structureLabel(item)}<button type="button" aria-label={t("generator.removeStructure", { name: structureLabel(item), position: i + 1 })} onClick={() => setStructure((p) => p.filter((_, idx) => idx !== i))} className="text-accent/70 transition-colors hover:text-accent">×</button></span>)}</div>}
                <div className="flex flex-wrap gap-2">{STRUCTURE_TAGS.map((item) => <button key={item} type="button" onClick={() => setStructure((p) => [...p, item])} className="rounded-full border border-white/12 bg-black/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">{structureLabel(item)}</button>)}</div>
              </div>
              <div><SectionHeader title={t("generator.productionStyle")} hint={t("common.optional")} onClear={() => setProduction("")} /><textarea value={production} onChange={(e) => setProduction(e.target.value)} rows={3} placeholder={t("generator.productionPlaceholder")} aria-label={t("generator.productionStyle")} className={fieldClass + " h-auto resize-y py-3"} /></div>
              <div><SectionHeader title={t("generator.additionalInstructions")} hint={t("common.optional")} onClear={() => setInstructions("")} /><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder={t("generator.additionalInstructionsPlaceholder")} aria-label={t("generator.additionalInstructions")} className={fieldClass + " h-auto resize-y py-3"} /></div>
              <div><SectionHeader title={t("generator.language")} onClear={() => { setLanguage(""); setCustomLanguage(""); }} /><select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t("generator.language")} className={fieldClass}><option value="" disabled className="bg-[#0a0a0c]">{t("generator.selectLanguage")}</option>{LANGUAGE_OPTIONS.map((item) => <option key={item} value={item} className="bg-[#0a0a0c]">{item === CUSTOM ? t("generator.option.custom") : languageLabel(item)}</option>)}</select></div>
            </> : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-3">
                  <select value={moods[0] ?? ""} onChange={(e) => pickPrimary(setMoods)(e.target.value)} aria-label={t("generator.mood")} className={fieldClass}><option value="" disabled className="bg-[#0a0a0c]">{t("generator.selectMood")}</option>{MOOD_OPTIONS.map((item) => <option key={item} value={item} className="bg-[#0a0a0c]">{item === CUSTOM ? t("generator.option.custom") : translatedOption(BASIC_MOODS, item, t)}</option>)}</select>
                  {moods[0] === CUSTOM && <input value={customMood} onChange={(e) => setCustomMood(e.target.value)} placeholder={t("generator.customMoodPlaceholder")} aria-label={`${t("common.custom")} ${t("generator.mood")}`} className={fieldClass} />}
                </div>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t("generator.language")} className={fieldClass}><option value="" disabled className="bg-[#0a0a0c]">{t("generator.selectLanguage")}</option>{LANGUAGE_OPTIONS.map((item) => <option key={item} value={item} className="bg-[#0a0a0c]">{item === CUSTOM ? t("generator.option.custom") : languageLabel(item)}</option>)}</select>
              </div>
            )}

            {language === CUSTOM && <input value={customLanguage} onChange={(e) => setCustomLanguage(e.target.value)} placeholder={t("generator.customLanguagePlaceholder")} aria-label={`${t("common.custom")} ${t("generator.language")}`} className={fieldClass} />}
            {validationError && <p className="text-xs text-red-400">{validationError}</p>}

            <div className="space-y-2 pt-1">
              {showGenerationModelSelector ? (
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t("generator.generateWith")}</span><select aria-label={t("generator.aiModel")} value={generationModel} onChange={(e) => { setGenerationModel(e.target.value); setGenerationModelChosen(true); }} className="max-w-[15rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-foreground">{availableModels.map((m) => <option key={m.id} value={m.id} className="bg-[#0a0a0c]">{m.label}</option>)}</select></label>
              ) : modelAccessLoading ? <p className="text-xs text-muted-foreground">{t("generator.loadingModels")}</p> : modelAccessUnavailable ? <p className="text-xs text-red-400">{t("generator.noModel")}</p> : <p className="text-xs text-muted-foreground">{t("generator.generationModel", { model: aiModelLabel(generationModel) })}</p>}
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <button onClick={generate} disabled={busy || checking || blocked || !ready || modelAccessLoading || modelAccessUnavailable} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale sm:w-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {t("generator.generate")}</button>
                <span className="text-xs text-muted-foreground">{blocked ? t("generator.tryAgainMinutes", { minutes: minutesLeft }) : t("generator.generationsRemaining", { remaining, limit: HOURLY_LIMIT })}</span>
              </div>
            </div>

            {confirmClear && createPortal(
              <div role="dialog" aria-modal="true" aria-labelledby="clear-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setConfirmClear(false)}>
                <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#0e0e12] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div><h3 id="clear-title" className="text-base font-semibold text-foreground">{t("generator.clearTitle")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("generator.clearBody")}</p></div>
                  {clearError && <p role="alert" className="text-xs text-red-400">{clearError}</p>}
                  <div className="flex flex-row items-center justify-end gap-3"><button onClick={() => setConfirmClear(false)} disabled={clearing} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/5">{t("common.cancel")}</button><button onClick={clearAll} disabled={clearing} className="rounded-xl bg-red-500/80 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500">{clearing ? t("generator.clearing") : t("generator.confirmClear")}</button></div>
                </div>
              </div>, document.body,
            )}
            {status && <p className="text-xs text-accent">{status}</p>}
          </div>

          {busy && <div className="mt-6 space-y-4">{[0, 1, 2].map((i) => <div key={i} className="glass h-32 animate-pulse rounded-2xl" />)}</div>}

          {!busy && result && (
            <div className="mt-6 space-y-4 pb-16">
              {generationResultModel && <p className="text-xs text-muted-foreground">{t("generator.generatedWith", { model: aiModelLabel(generationResultModel) })}</p>}
              <div className="flex justify-end"><button onClick={toggleAll} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">{allOpen ? t("generator.collapseAll") : t("generator.expandAll")}</button></div>
              <ResultSection title={t("generator.result.songTitle")} value={result.title} open={open.title} onToggle={() => setOpen((p) => ({ ...p, title: !p.title }))} onChange={(v) => setResult({ ...result, title: v })} rows={2} />
              <ResultSection title={resultTagsLabel} value={result.tags} open={open.tags} onToggle={() => setOpen((p) => ({ ...p, tags: !p.tags }))} onChange={(v) => setResult({ ...result, tags: v })} rows={4} />
              <ResultSection title={t("generator.result.lyricsStructure")} value={result.lyrics} open={open.lyrics} onToggle={() => setOpen((p) => ({ ...p, lyrics: !p.lyrics }))} onChange={(v) => setResult({ ...result, lyrics: v })} rows={18} />
              <ResultSection title={t("generator.result.producerNote")} value={result.note} open={open.note} onToggle={() => setOpen((p) => ({ ...p, note: !p.note }))} onChange={(v) => setResult({ ...result, note: v })} rows={5} />
              <button onClick={save} disabled={saved} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60">{saved ? <Check className="h-4 w-4 text-accent" /> : <Save className="h-4 w-4" />}{saved ? t("generator.savedLibrary") : t("generator.saveLibrary")}</button>
              <QualityPanel quality={quality} checking={checking} onCheck={runCheck} checkError={checkError} confirm={confirm} setConfirm={setConfirm} state={applyState} qualityCheckModel={qualityCheckModel} availableModels={availableModels} modelAccessLoading={modelAccessLoading} modelAccessReady={modelAccessReady} modelAccessUnavailable={modelAccessUnavailable} onQualityCheckModelChange={(model) => { setQualityCheckModel(model); setQualityCheckModelChosen(true); }} qualityCheckResultModel={qualityCheckResultModel} showQualityCheckModelSelector={showQualityCheckModelSelector} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
