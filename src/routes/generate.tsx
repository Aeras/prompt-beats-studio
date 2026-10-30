import {
  inspirationOwnedKeys,
  type InspirationApplyField,
} from "@/lib/music-inspiration-apply.shared";
import { useMusicInspirationState } from "@/hooks/useMusicInspirationState";
import { createMusicTracker, sameGeneratorFrame } from "@/lib/music-inspiration-generator-state";
import { AtlasGeneratorBridge } from "@/components/promptbeats/AtlasGeneratorBridge";
import { MusicInspirationPanel } from "@/components/promptbeats/MusicInspirationPanel";
import {
  composeAtlasInstructions,
  parseAtlasAwareSetup,
  serializeAtlasAwareSetup,
  restoreAtlasInstructionLayer,
  type AtlasInstructionLayer,
} from "@/lib/atlas-instructions.shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  FlaskConical,
  Loader2,
  Save,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useModeration } from "@/hooks/useModeration";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";
import { analyzerV2GeneratorPatch } from "@/lib/song-analyzer-handoff.shared";
import { usePb012LastWork } from "@/lib/pb012-last-work";
import {
  ADVANCED_SETUP_MAX_BYTES,
  advancedSetupFilename,
  parseAdvancedSetup,
  splitKnownValues,
  type AdvancedGeneratorSetup,
} from "@/lib/advanced-generator-setup";
import { AppShell } from "@/components/promptbeats/AppShell";
import { parseSongMarkdown, SONG_MARKDOWN_MAX_BYTES } from "@/lib/generator-song-markdown";
import { SongSetupAssistantModal } from "@/components/promptbeats/SongSetupAssistantModal";
import { SongBlueprintEditor } from "@/components/promptbeats/SongBlueprintEditor";
import { VisualSongArrangement } from "@/components/promptbeats/VisualSongArrangement";
import { LanguagePicker } from "@/components/promptbeats/LanguagePicker";
import { LanguageVariantPicker } from "@/components/promptbeats/LanguageVariantPicker";
import { SmartPresetsPanel } from "@/components/promptbeats/SmartPresetsPanel";
import {
  LyricsWorkspace,
  type LyricsWorkspaceSong,
} from "@/components/promptbeats/LyricsWorkspace";
import { LibraryFolderPicker } from "@/components/promptbeats/LibraryFolderPicker";
import {
  getCurrentUserAiModelAccess,
  getGenerationUsage,
  savePromptToLibrary,
  listPromptProjects,
  listPromptProjectVersions,
  getPromptRevisionBase,
  createPromptProject,
  HOURLY_LIMIT,
  type QualityReport,
  type CorrectionItem,
  type QualitySuggestion,
} from "@/lib/ai.functions";
import {
  getGenerationJob,
  getLatestGenerationJob,
  dismissGenerationJob,
  requestGenerationJobCancellation,
  startGenerationJob,
  type GenerationContext,
  type GenerationJob,
} from "@/lib/generation-jobs.functions";
import {
  getLatestQualityCheckJob,
  getQualityCheckJob,
  requestQualityCheckCancellation,
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
import { DEFAULT_AI_MODEL, aiModelLabel } from "@/lib/ai-models";
import {
  buildGeneratorBenchmarkMarkdown,
  generatorBenchmarkFilename,
} from "@/lib/generator-benchmark-export";
import {
  AI_TARGET_PLATFORMS,
  AI_TARGET_PLATFORM_LABEL,
  DEFAULT_AI_TARGET_PLATFORM,
  type AITargetPlatform,
} from "@/lib/ai-target-platforms";
import type { SongSetupDraft } from "@/lib/song-setup-assistant.functions";
import {
  buildInspirationWallSongSetupDescription,
  INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY,
  inspirationWallSongSetupHandoffSchema,
  type InspirationWallSongSetupHandoff,
} from "@/lib/inspiration-wall-song-setup.shared";
import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";
import {
  buildStoryMapSongSetupDescription,
  STORY_MAP_SONG_SETUP_HANDOFF_KEY,
  storyMapSongSetupHandoffSchema,
  type StoryMapSongSetupHandoff,
} from "@/lib/story-map.shared";
import {
  buildSongUniverseContextText,
  SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY,
  songUniverseSongSetupHandoffSchema,
  type SongUniverseSongSetupHandoff,
} from "@/lib/song-universe.shared";
import {
  activeSongBlueprint,
  buildSongBlueprint,
  type SongBlueprintSection,
} from "@/lib/song-blueprint.shared";
import {
  appendArrangementSection,
  arrangementToSongBlueprint,
  arrangementToSongStructure,
  normalizeSongArrangement,
  removeArrangementSection,
} from "@/lib/song-arrangement.shared";
import { useI18n, type AppTranslationKey } from "@/i18n";
import {
  buildPresetBlueprint,
  resolveSmartPreset,
  type SmartPreset,
} from "@/catalog/smart-presets";
import {
  findSongLanguageVariantFromCanonical,
  getSongLanguageVariants,
  resolveSongLanguage,
} from "@/catalog/song-languages";
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
const SONG_ANALYZER_HANDOFF_KEY = "pb:song-analyzer-handoff";

export const Route = createFileRoute("/generate")({
  validateSearch: z.object({
    mode: z.enum(["revision"]).optional(),
    workspace: z.enum(["lyrics"]).optional(),
    project: z.string().guid().optional(),
    base: z.string().guid().optional(),
    presets: z.enum(["open"]).optional(),
    start: z.enum(["new"]).optional(),
    session: z.string().guid().optional(),
  }),
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
        content:
          "Generate optimized metatags, structured lyrics and producer notes for AI music platforms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GenerateSessionBoundary,
});

const CUSTOM = "Custom…";
const GENRE_OPTIONS = [
  CUSTOM,
  ...BASIC_MUSIC_STYLES.map((option) => option.value).filter((value) => value !== CUSTOM),
];
const MOOD_OPTIONS = [
  CUSTOM,
  ...BASIC_MOODS.map((option) => option.value).filter((value) => value !== CUSTOM),
];
const LANGUAGE_OPTIONS = [
  CUSTOM,
  ...SONG_LANGUAGES.map((option) => option.value).filter((value) => value !== CUSTOM),
];
const ADVANCED_STYLES = ADVANCED_MUSIC_STYLES.map((option) => option.value);
const ADVANCED_MOOD_VALUES = ADVANCED_MOODS.map((option) => option.value);
const INSTRUMENTS = INSTRUMENT_OPTIONS.map((option) => option.value);
const STRUCTURE_TAGS = SONG_STRUCTURE_TAGS.map((option) => option.value);
const BPM_OPTIONS = [
  "Auto",
  "Custom",
  ...CATALOG_BPM_OPTIONS.map((option) => option.value).filter(
    (value) => value !== "Auto" && value !== "Custom",
  ),
];

type GeneratorResult = { title: string; tags: string; lyrics: string; note: string };
type RevisionMeta = {
  savedPromptId: string;
  projectId: string;
  versionNumber: number;
  parentPromptId: string;
};

function translatedOption(
  options: readonly LocalizedGeneratorOption[],
  value: string,
  t: (key: AppTranslationKey, values?: Record<string, string | number>) => string,
) {
  const item = options.find((option) => option.value === value);
  return item?.labelKey ? t(item.labelKey) : value;
}

function localizeAiError(
  error: unknown,
  fallbackKey: "generator.failed" | "quality.unavailable",
  t: (key: AppTranslationKey, values?: Record<string, string | number>) => string,
) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("ai provider rate limit was reached"))
    return t("generator.error.rateLimit");
  if (normalized.includes("ai provider rejected the request parameters"))
    return t("generator.error.invalidProviderRequest");
  if (normalized.includes("ai provider authentication was rejected"))
    return t("generator.error.providerAuth");
  if (
    normalized.includes("ai provider is temporarily unavailable") ||
    normalized.includes("ai service is not configured")
  ) {
    return t("generator.error.providerUnavailable");
  }
  if (normalized.includes("ai model registry is temporarily unavailable")) {
    return t("generator.error.registryUnavailable");
  }
  if (normalized.includes("account is no longer available")) {
    return t("generator.error.accountUnavailable");
  }
  if (normalized.includes("account is not allowed to use ai services")) {
    return t("generator.error.aiNotAllowed");
  }
  if (
    normalized.includes("ai response was incomplete") ||
    normalized.includes("ai returned an incomplete or invalid response")
  ) {
    return t("generator.error.invalidResponse");
  }
  if (normalized.includes("quality check unavailable")) {
    return t("quality.unavailable");
  }

  return t(fallbackKey);
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
  return (
    <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">{children}</p>
  );
}

function SectionHeader({
  title,
  hint,
  onClear,
  optionsOpen,
  onToggleOptions,
}: {
  title: string;
  hint?: string;
  onClear?: () => void;
  optionsOpen?: boolean;
  onToggleOptions?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-white/5 border-l-2 border-l-accent bg-white/[0.02] px-2.5 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
        {title}
      </span>
      {hint && (
        <span className="text-[10px] text-muted-foreground">
          {"\u00b7 "}
          {hint}
        </span>
      )}
      {onToggleOptions && (
        <button
          type="button"
          onClick={onToggleOptions}
          aria-expanded={optionsOpen}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10"
        >
          {optionsOpen ? t("generator.hideTags") : t("generator.showTags")}
        </button>
      )}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${t("generator.clear")} ${title}`}
          title={`${t("generator.clear")} ${title}`}
          className={
            onToggleOptions
              ? "shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-red-300"
              : "ml-auto shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-red-300"
          }
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground/70">{t("quality.none")}</p>
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
          {t("common.cancel")}
        </button>
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

function ApplyRow({
  id,
  state,
  onApply,
  onUndo,
}: {
  id: string;
  state: ApplyState;
  onApply: () => void;
  onUndo: () => void;
}) {
  const { t } = useI18n();
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
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {fieldLabel[c.field]}
        {c.field === "lyrics" && c.sectionLabel ? ` · [${c.sectionLabel}]` : ""}
      </p>
      <p className="mt-1 text-xs text-foreground/90">{c.reason}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground line-through">
        {c.originalText}
      </p>
      <p className="whitespace-pre-wrap text-xs text-green-300">{c.replacementText}</p>
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
  const { t } = useI18n();
  const applicable = s.actionType !== "informational";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold text-foreground">{s.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{s.explanation}</p>
      {s.actionType === "add_to_music_style" && s.value && (
        <p className="mt-2 text-[11px] text-accent">
          {t("quality.addMusicStyle", { value: s.value })}
        </p>
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

function QualityResults({
  quality,
  prefix,
  state,
  model,
}: {
  quality: QualityReport;
  prefix: string;
  state: ApplyState;
  model: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-4">
      {model && (
        <p className="text-xs text-muted-foreground">{t("quality.checkedWith", { model })}</p>
      )}
      <div className="flex items-center gap-4 text-sm">
        <span>
          {t("quality.passed")}:{" "}
          <strong className={quality.passed ? "text-green-400" : "text-red-400"}>
            {quality.passed ? t("quality.yes") : t("quality.no")}
          </strong>
        </span>
        <span>
          {t("quality.score")}: <strong className="text-foreground">{quality.score}/10</strong>
        </span>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
          {t("quality.actualIssues")}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("quality.actualIssuesHint")}</p>
        <div className="mt-2">
          <ActualIssues quality={quality} />
        </div>
        {quality.corrections.length > 0 && (
          <div className="mt-3 space-y-2">
            {quality.corrections.map((c, i) => (
              <CorrectionCard
                key={`${prefix}-fix-${i}`}
                id={`${prefix}-fix-${i}`}
                c={c}
                state={state}
              />
            ))}
          </div>
        )}
      </div>
      <SuggestionGroup
        heading={t("quality.creative")}
        hint={t("quality.creativeHint")}
        items={quality.creativeSuggestions}
        prefix={`${prefix}-cre`}
        state={state}
      />
      <SuggestionGroup
        heading={t("quality.production")}
        hint={t("quality.productionHint")}
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
  onStop,
  stopAvailable,
  stopRequested,
  checkError,
  confirm,
  setConfirm,
  state,
  qualityCheckModel,
  qualityCheckVersion,
  onQualityCheckVersionChange,
  isSuperAdmin,
  availableModels,
  modelAccessLoading,
  modelAccessReady,
  modelAccessUnavailable,
  onQualityCheckModelChange,
  qualityCheckResultModel,
  showQualityCheckModelSelector,
  featureAvailable,
}: {
  quality: QualityReport | null;
  checking: boolean;
  onCheck: () => void;
  onStop: () => void;
  stopAvailable: boolean;
  stopRequested: boolean;
  checkError: string | null;
  confirm: "check" | "recheck" | null;
  setConfirm: (v: "check" | "recheck" | null) => void;
  state: ApplyState;
  qualityCheckModel: string;
  qualityCheckVersion: "v1" | "v2" | "v2.1";
  onQualityCheckVersionChange: (value: "v1" | "v2" | "v2.1") => void;
  isSuperAdmin: boolean;
  availableModels: Array<{ id: string; label: string; provider: string }>;
  modelAccessLoading: boolean;
  modelAccessReady: boolean;
  modelAccessUnavailable: boolean;
  onQualityCheckModelChange: (model: string) => void;
  qualityCheckResultModel: string | null;
  showQualityCheckModelSelector: boolean;
  featureAvailable: boolean;
}) {
  const { t } = useI18n();
  const mode = quality ? "recheck" : "check";
  const [confirmStopQuality, setConfirmStopQuality] = useState(false);
  return (
    <div className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-accent" />
        <h2 className="font-display text-sm font-semibold tracking-wide text-accent">
          {t("quality.title")}
        </h2>
      </div>
      {quality && (
        <QualityResults
          quality={quality}
          prefix="orig"
          state={state}
          model={
            qualityCheckResultModel
              ? (availableModels.find((item) => item.id === qualityCheckResultModel)?.label ??
                aiModelLabel(qualityCheckResultModel))
              : null
          }
        />
      )}
      {checking && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {stopRequested ? "Ζητήθηκε διακοπή / Stop requested" : t("quality.checking")}
          </p>
          <button
            type="button"
            disabled={!stopAvailable || stopRequested}
            className="rounded-lg border border-orange-500/50 px-3 py-1.5 text-xs font-semibold text-orange-300 disabled:opacity-50"
            onClick={() => setConfirmStopQuality(true)}
          >
            <Square className="mr-1 inline h-3 w-3" /> Διακοπή / Stop
          </button>
          {confirmStopQuality && (
            <div
              role="dialog"
              aria-label="Επιβεβαίωση διακοπής Quality Check"
              className="w-full rounded-xl border border-orange-500/30 bg-orange-950/20 p-3 text-xs"
            >
              <p>Θέλεις να διακόψεις τον έλεγχο ποιότητας;</p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1"
                  onClick={() => setConfirmStopQuality(false)}
                >
                  Άκυρο
                </button>
                <button
                  type="button"
                  className="rounded bg-orange-600 px-3 py-1 text-white"
                  onClick={() => {
                    setConfirmStopQuality(false);
                    onStop();
                  }}
                >
                  Επιβεβαίωση διακοπής
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {!checking && (
        <div className="mt-4 space-y-3">
          {isSuperAdmin && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Quality Check Version · Super Admin</span>
              <select
                value={qualityCheckVersion}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === "v1" || selected === "v2" || selected === "v2.1") {
                    onQualityCheckVersionChange(selected);
                  }
                }}
                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-foreground"
              >
                <option value="v1">Version 1 — Existing</option>
                <option value="v2">Version 2 — Precision Review</option>
                <option value="v2.1">Version 2.1 — Precision Improved</option>
              </select>
            </label>
          )}
          {!featureAvailable && (
            <p className="text-xs text-muted-foreground">{t("quality.featureUnavailable")}</p>
          )}
          {featureAvailable && modelAccessLoading && (
            <p className="text-xs text-muted-foreground">{t("quality.loadingModels")}</p>
          )}
          {featureAvailable && modelAccessUnavailable && (
            <p className="text-xs text-red-400">{t("quality.noModel")}</p>
          )}
          {featureAvailable &&
            modelAccessReady &&
            !modelAccessUnavailable &&
            showQualityCheckModelSelector && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t("quality.checkWith")}</span>
                <select
                  aria-label={t("quality.model")}
                  value={qualityCheckModel}
                  onChange={(e) => onQualityCheckModelChange(e.target.value)}
                  className="max-w-[13rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-foreground"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0a0a0c]">
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {featureAvailable &&
            modelAccessReady &&
            !modelAccessUnavailable &&
            !showQualityCheckModelSelector && (
              <p className="text-xs text-muted-foreground">
                {t("quality.checkWith")}{" "}
                {availableModels.find((item) => item.id === qualityCheckModel)?.label ??
                  aiModelLabel(qualityCheckModel)}
              </p>
            )}
          {featureAvailable &&
            (confirm === mode ? (
              <ConfirmBox
                message={quality ? t("quality.confirmAgain") : t("quality.confirmFirst")}
                confirmLabel={quality ? t("quality.checkAgain") : t("quality.check")}
                onConfirm={onCheck}
                onCancel={() => setConfirm(null)}
              />
            ) : (
              <CostButton
                label={quality ? t("quality.checkAgainCost") : t("quality.checkCost")}
                busy={false}
                busyLabel=""
                disabled={modelAccessLoading || modelAccessUnavailable}
                onClick={() => setConfirm(mode)}
              />
            ))}
          {checkError && <p className="text-xs text-red-400">{checkError}</p>}
        </div>
      )}
    </div>
  );
}

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

function GenerateSessionBoundary() {
  const search = Route.useSearch();
  const freshSession =
    search.start === "new" &&
    search.session &&
    !search.mode &&
    !search.workspace &&
    !search.project &&
    !search.base
      ? search.session
      : null;
  // A new fresh-start URL must not inherit the mounted Generator's previous state.
  return <GeneratePage key={freshSession ? `fresh:${freshSession}` : "standard"} />;
}

function GeneratePage() {
  const { t, language: appLanguage } = useI18n();
  const { user, loading } = useAuth();
  const moderation = useModeration();
  const { preferences: accountPreferences, signedIn: accountPreferencesReady } =
    useAccountPreferences();
  const generatorFeature = useFeatureAccess("ai_generator");
  const qualityFeature = useFeatureAccess("quality_check");
  const lyricsWorkspaceFeature = useFeatureAccess("lyrics_workspace");
  const songSetupFeature = useFeatureAccess("song_setup_assistant");
  const songUniverseFeature = useFeatureAccess("song_universe");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const freshSession =
    search.start === "new" &&
    search.session &&
    !search.mode &&
    !search.workspace &&
    !search.project &&
    !search.base
      ? search.session
      : null;
  const jobStorageKey = freshSession ? `pb:generation-job:fresh:${freshSession}` : JOB_STORAGE_KEY;
  const qualityJobStorageKey = user
    ? `${QUALITY_JOB_STORAGE_KEY}:${user.id}`
    : QUALITY_JOB_STORAGE_KEY;
  const queryClient = useQueryClient();
  const [advanced, setAdvanced] = useState(search.mode === "revision" || search.presets === "open");
  const defaultGeneratorModeAppliedRef = useRef(false);
  const [revisionMode, setRevisionMode] = useState(search.mode === "revision");
  const [promptVersion, setPromptVersion] = useState<"v1" | "v2" | "v3" | "v4_beta" | "v5_beta_1">(
    "v1",
  );
  const [revisionProjectId, setRevisionProjectId] = useState(search.project ?? "");
  const [revisionBasePromptId, setRevisionBasePromptId] = useState(search.base ?? "");
  const [revisionRequest, setRevisionRequest] = useState("");
  const [revisionMeta, setRevisionMeta] = useState<RevisionMeta | null>(null);
  const [workspaceFreshOpen, setWorkspaceFreshOpen] = useState(false);
  const [workspaceResultSaved, setWorkspaceResultSaved] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState<AITargetPlatform>(
    DEFAULT_AI_TARGET_PLATFORM,
  );
  const [theme, setTheme] = useState("");
  const musicTracker = useRef(createMusicTracker());
  const inspirationSetupRef = useRef<
    import("@/lib/advanced-generator-setup").AdvancedGeneratorSetup | null
  >(null);
  const [genres, setGenres] = useMusicInspirationState<string[]>(
    "genres",
    [],
    "selectedMusicStyles",
    musicTracker,
  );
  const [customGenre, setCustomGenre] = useMusicInspirationState(
    "customGenre",
    "",
    "selectedMusicStyles",
    musicTracker,
  );
  const [moods, setMoods] = useMusicInspirationState<string[]>(
    "moods",
    [],
    "selectedMoods",
    musicTracker,
  );
  const [customMood, setCustomMood] = useMusicInspirationState(
    "customMood",
    "",
    "selectedMoods",
    musicTracker,
  );
  const [instruments, setInstruments] = useMusicInspirationState<string[]>(
    "instruments",
    [],
    "selectedInstruments",
    musicTracker,
  );
  const [customInstruments, setCustomInstruments] = useMusicInspirationState(
    "customInstruments",
    "",
    "selectedInstruments",
    musicTracker,
  );
  const [structure, setStructure] = useMusicInspirationState<string[]>(
    "structure",
    [],
    "arrangement",
    musicTracker,
  );
  const [songBlueprint, setSongBlueprint] = useMusicInspirationState<SongBlueprintSection[]>(
    "songBlueprint",
    [],
    "arrangement",
    musicTracker,
  );
  const arrangement = useMemo(
    () => normalizeSongArrangement(structure, buildSongBlueprint(structure, songBlueprint)),
    [structure, songBlueprint],
  );

  const commitArrangement = (next: ReturnType<typeof normalizeSongArrangement>) => {
    setStructure(arrangementToSongStructure(next));
    setSongBlueprint(arrangementToSongBlueprint(next));
  };

  useEffect(() => {
    if (!structure.length) return;
    const normalizedBlueprint = arrangementToSongBlueprint(arrangement);
    if (JSON.stringify(songBlueprint) !== JSON.stringify(normalizedBlueprint)) {
      setSongBlueprint(normalizedBlueprint);
    }
  }, [arrangement, songBlueprint, structure.length, setSongBlueprint]);
  const [showStyleTags, setShowStyleTags] = useState(false);
  const [showMoodTags, setShowMoodTags] = useState(false);
  const [showInstrumentTags, setShowInstrumentTags] = useState(false);
  const [showStructureTags, setShowStructureTags] = useState(false);
  const [showArrangementAdvanced, setShowArrangementAdvanced] = useState(false);
  const [activeSmartPresetId, setActiveSmartPresetId] = useState("");
  const [presetCulturalStyleId, setPresetCulturalStyleId] = useState("");
  const [production, setProduction] = useMusicInspirationState(
    "production",
    "",
    "productionStyle",
    musicTracker,
  );
  const [instructions, setInstructions] = useMusicInspirationState(
    "instructions",
    "",
    "additionalInstructions",
    musicTracker,
  );
  const [atlasInstructions, setAtlasInstructions] = useState<AtlasInstructionLayer | null>(null);
  const [atlasRecoveryText, setAtlasRecoveryText] = useState("");
  const [atlasImportNotice, setAtlasImportNotice] = useState(false);
  const [pendingAtlasImport, setPendingAtlasImport] = useState<AtlasInstructionLayer | null>(null);
  const [bpm, setBpm] = useMusicInspirationState("bpm", "Auto", "bpm", musicTracker);
  const [customBpm, setCustomBpm] = useMusicInspirationState("customBpm", "", "bpm", musicTracker);
  const [language, setLanguage] = useState("");
  const [languageVariant, setLanguageVariant] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [songSetupAssistantOpen, setSongSetupAssistantOpen] = useState(false);
  const [pendingSetupImport, setPendingSetupImport] = useState<AdvancedGeneratorSetup | null>(null);
  const [setupIoError, setSetupIoError] = useState<string | null>(null);
  const [setupMenuOpen, setSetupMenuOpen] = useState<"import" | "export" | null>(null);
  const setupMenuRefs = useRef<Record<"import" | "export", HTMLDivElement | null>>({
    import: null,
    export: null,
  });

  useEffect(() => {
    if (!setupMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !setupMenuRefs.current[setupMenuOpen]?.contains(target)) {
        setSetupMenuOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSetupMenuOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [setupMenuOpen]);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);
  const setupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [inspirationWallHandoff, setInspirationWallHandoff] =
    useState<InspirationWallSongSetupHandoff | null>(null);
  const [storyMapHandoff, setStoryMapHandoff] = useState<StoryMapSongSetupHandoff | null>(null);
  const [songUniverseHandoff, setSongUniverseHandoff] =
    useState<SongUniverseSongSetupHandoff | null>(null);
  const [storyDriven, setStoryDriven] = useState(false);
  const [songSetupPrefill, setSongSetupPrefill] = useState<{
    key: string;
    description: string;
    sourceLabel: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveProjectId, setSaveProjectId] = useState("");
  const [saveVersionLabel, setSaveVersionLabel] = useState("");
  const [saveNewProject, setSaveNewProject] = useState("");
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null);
  const [saveFolderPath, setSaveFolderPath] = useState("");
  const [saveFolderPickerOpen, setSaveFolderPickerOpen] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const promptProjects = useQuery({
    queryKey: ["generator", "prompt-projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user && (saveDialogOpen || revisionMode)),
  });
  const revisionVersions = useQuery({
    queryKey: ["generator", "revision-versions", user?.id, revisionProjectId],
    queryFn: () => listPromptProjectVersions({ data: { projectId: revisionProjectId } }),
    enabled: Boolean(user && revisionMode && revisionProjectId),
  });
  const revisionBase = useQuery({
    queryKey: ["generator", "revision-base", user?.id, revisionProjectId, revisionBasePromptId],
    queryFn: () =>
      getPromptRevisionBase({
        data: { projectId: revisionProjectId || null, basePromptId: revisionBasePromptId },
      }),
    enabled: Boolean(user && revisionMode && revisionBasePromptId),
  });
  const workspaceBase = useQuery({
    queryKey: ["generator", "lyrics-workspace-base", user?.id, search.project, search.base],
    queryFn: () =>
      getPromptRevisionBase({
        data: { projectId: search.project ?? null, basePromptId: search.base as string },
      }),
    enabled: Boolean(user && search.workspace === "lyrics" && search.base),
  });
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [importedResultActive, setImportedResultActive] = useState(false);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [generationModel, setGenerationModel] = useState(DEFAULT_AI_MODEL);
  const [generationModelChosen, setGenerationModelChosen] = useState(false);
  const [generationResultModel, setGenerationResultModel] = useState<string | null>(null);
  const [qualityCheckModel, setQualityCheckModel] = useState(DEFAULT_AI_MODEL);
  const [qualityCheckVersion, setQualityCheckVersion] = useState<"v1" | "v2" | "v2.1">("v1");
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
  const toggleAll = () =>
    setOpen({ title: !allOpen, tags: !allOpen, lyrics: !allOpen, note: !allOpen });
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stoppingGeneration, setStoppingGeneration] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const setApplyError = (id: string, msg: string | null) =>
    setApplyErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [jobId, setJobId] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const [requiredValidationAttempted, setRequiredValidationAttempted] = useState(false);
  const themeRequiredRef = useRef<HTMLDivElement>(null);
  const musicStyleRequiredRef = useRef<HTMLDivElement>(null);
  const moodRequiredRef = useRef<HTMLDivElement>(null);
  const languageRequiredRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (defaultGeneratorModeAppliedRef.current || !accountPreferencesReady) return;
    defaultGeneratorModeAppliedRef.current = true;
    if (search.mode === "revision" || search.presets === "open" || search.workspace === "lyrics")
      return;
    // useAccountPreferences has its own auth subscription. Wait until that subscription
    // has the signed-in user's metadata before consuming the account default; otherwise
    // the initial fallback "basic" can win the one-time initialization race.
    if (!advanced && accountPreferences.generatorMode === "advanced") setAdvanced(true);
  }, [
    accountPreferences.generatorMode,
    accountPreferencesReady,
    advanced,
    search.mode,
    search.presets,
    search.workspace,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (freshSession) return;
    const raw = window.sessionStorage.getItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(STORY_MAP_SONG_SETUP_HANDOFF_KEY);
    try {
      setStoryMapHandoff(storyMapSongSetupHandoffSchema.parse(JSON.parse(raw)));
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η φόρτωση του Story Map στο Song Setup."
          : "Could not load the Story Map handoff into Song Setup.",
      );
    }
  }, [appLanguage]);

  useEffect(() => {
    if (!storyMapHandoff || songSetupFeature.isLoading) return;
    if (!songSetupFeature.allowed) {
      setStatus(
        appLanguage === "el"
          ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
          : "Song Setup Assistant is not available for this account.",
      );
      setStoryMapHandoff(null);
      return;
    }
    const description = buildStoryMapSongSetupDescription(storyMapHandoff, appLanguage);
    setAdvanced(true);
    if (storyMapHandoff.projectId) setSaveProjectId(storyMapHandoff.projectId);
    setSongSetupPrefill({
      key: `${storyMapHandoff.storyMapId}:v1`,
      description,
      sourceLabel: storyMapHandoff.storyMapTitle,
    });
    setSongSetupAssistantOpen(true);
    setStatus(
      appLanguage === "el"
        ? "Το Story Map φορτώθηκε στο Song Setup για έλεγχο."
        : "Story Map loaded into Song Setup for review.",
    );
    setStoryMapHandoff(null);
  }, [appLanguage, songSetupFeature.allowed, songSetupFeature.isLoading, storyMapHandoff]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (freshSession) return;
    const raw = window.sessionStorage.getItem(SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY);
    try {
      setSongUniverseHandoff(songUniverseSongSetupHandoffSchema.parse(JSON.parse(raw)));
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η φόρτωση του Song Universe στο Song Setup."
          : "Could not load the Song Universe handoff into Song Setup.",
      );
    }
  }, [appLanguage]);

  useEffect(() => {
    if (!songUniverseHandoff || songSetupFeature.isLoading || songUniverseFeature.isLoading) return;
    if (!songSetupFeature.allowed || !songUniverseFeature.allowed) {
      setStatus(
        appLanguage === "el"
          ? "Το Song Universe ή το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
          : "Song Universe or Song Setup Assistant is not available for this account.",
      );
      setSongUniverseHandoff(null);
      return;
    }
    const description = buildSongUniverseContextText(songUniverseHandoff, appLanguage);
    setAdvanced(true);
    if (songUniverseHandoff.projectId) setSaveProjectId(songUniverseHandoff.projectId);
    setSongSetupPrefill({
      key: `${songUniverseHandoff.universeId}:v1:${songUniverseHandoff.contextSnapshot.capturedAt}`,
      description,
      sourceLabel: songUniverseHandoff.universeTitle,
    });
    setSongSetupAssistantOpen(true);
    setStatus(
      appLanguage === "el"
        ? `Χρησιμοποιείται Universe Context: ${songUniverseHandoff.universeTitle}`
        : `Using Universe Context: ${songUniverseHandoff.universeTitle}`,
    );
    setSongUniverseHandoff(null);
  }, [
    appLanguage,
    songSetupFeature.allowed,
    songSetupFeature.isLoading,
    songUniverseFeature.allowed,
    songUniverseFeature.isLoading,
    songUniverseHandoff,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (freshSession) return;
    const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);
    try {
      setInspirationWallHandoff(inspirationWallSongSetupHandoffSchema.parse(JSON.parse(raw)));
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η φόρτωση του Inspiration Wall στο Song Setup."
          : "Could not load the Inspiration Wall handoff into Song Setup.",
      );
    }
  }, [appLanguage]);

  useEffect(() => {
    if (!inspirationWallHandoff || songSetupFeature.isLoading) return;
    if (!songSetupFeature.allowed) {
      setStatus(
        appLanguage === "el"
          ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
          : "Song Setup Assistant is not available for this account.",
      );
      setInspirationWallHandoff(null);
      return;
    }
    const description = buildInspirationWallSongSetupDescription(
      inspirationWallHandoff.direction,
      appLanguage,
    );
    if (!description) {
      setStatus(
        appLanguage === "el"
          ? "Το Inspiration Wall δεν έχει εγκεκριμένο Creative Direction για μεταφορά."
          : "The Inspiration Wall has no approved Creative Direction to transfer.",
      );
      setInspirationWallHandoff(null);
      return;
    }
    setAdvanced(true);
    if (inspirationWallHandoff.connectedProjectId) {
      setSaveProjectId(inspirationWallHandoff.connectedProjectId);
    }
    setSongSetupPrefill({
      key: `${inspirationWallHandoff.wallId}:v1`,
      description,
      sourceLabel: inspirationWallHandoff.wallTitle,
    });
    setSongSetupAssistantOpen(true);
    setStatus(
      appLanguage === "el"
        ? "Το εγκεκριμένο Creative Direction φορτώθηκε στο Song Setup για έλεγχο."
        : "Approved Creative Direction loaded into Song Setup for review.",
    );
    setInspirationWallHandoff(null);
  }, [appLanguage, inspirationWallHandoff, songSetupFeature.allowed, songSetupFeature.isLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (freshSession) return;
    const raw = window.sessionStorage.getItem(SONG_ANALYZER_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(SONG_ANALYZER_HANDOFF_KEY);
    try {
      const incoming: unknown = JSON.parse(raw);
      if (
        incoming &&
        typeof incoming === "object" &&
        "analyzerVersion" in incoming &&
        incoming.analyzerVersion === "v2"
      ) {
        const patch = analyzerV2GeneratorPatch(incoming);
        setAdvanced(true);
        if (patch.customGenre) {
          setGenres([]);
          setCustomGenre(patch.customGenre);
        }
        if (patch.customMood) {
          setMoods([]);
          setCustomMood(patch.customMood);
        }
        if (patch.customInstruments) {
          setInstruments([]);
          setCustomInstruments(patch.customInstruments);
        }
        if (patch.structure && patch.songBlueprint) {
          setStructure(patch.structure);
          setSongBlueprint(patch.songBlueprint);
        }
        if (patch.production) setProduction(patch.production);
        if (patch.instructions) setInstructions(patch.instructions);
        if (patch.customBpm) {
          setBpm("Custom");
          setCustomBpm(patch.customBpm);
        }
        setStatus(t("generator.songAnalyzerLoaded"));
        return;
      }
      const handoff = JSON.parse(raw) as {
        musicStyle?: string;
        mood?: string;
        instruments?: string[];
        bpm?: {
          approximate?: number | null;
          rangeMin?: number | null;
          rangeMax?: number | null;
          confidence?: string;
          notes?: string;
        };
        songStructure?: string[];
        productionStyle?: string;
        additionalInstructions?: string;
      };
      setAdvanced(true);
      setGenres([]);
      setCustomGenre(handoff.musicStyle?.trim() ?? "");
      setMoods([]);
      setCustomMood(handoff.mood?.trim() ?? "");
      setInstruments([]);
      setCustomInstruments((handoff.instruments ?? []).join(", "));
      const handoffStructure = Array.isArray(handoff.songStructure) ? handoff.songStructure : [];
      setStructure(handoffStructure);
      setSongBlueprint(buildSongBlueprint(handoffStructure));
      setActiveSmartPresetId("");
      setPresetCulturalStyleId("");
      setProduction(handoff.productionStyle?.trim() ?? "");
      setInstructions(handoff.additionalInstructions?.trim() ?? "");
      const bpmValue =
        handoff.bpm?.approximate != null
          ? Math.round(handoff.bpm.approximate)
          : handoff.bpm?.rangeMin != null && handoff.bpm?.rangeMax != null
            ? Math.round((handoff.bpm.rangeMin + handoff.bpm.rangeMax) / 2)
            : null;
      if (bpmValue != null && Number.isFinite(bpmValue)) {
        setBpm("Custom");
        setCustomBpm(String(bpmValue));
      } else {
        setBpm("Auto");
        setCustomBpm("");
      }
      setStatus(t("generator.songAnalyzerLoaded"));
    } catch {
      setStatus(t("generator.songAnalyzerLoadFailed"));
    }
  }, [
    t,
    setGenres,
    setCustomGenre,
    setMoods,
    setCustomMood,
    setInstruments,
    setCustomInstruments,
    setStructure,
    setSongBlueprint,
    setProduction,
    setInstructions,
    setBpm,
    setCustomBpm,
  ]);

  useEffect(() => {
    const data = revisionBase.data;
    if (!revisionMode || !data?.prompt) return;

    const prompt = data.prompt;
    const snapshot = prompt.generator_input_snapshot as GeneratorInputSnapshot | null;
    setAdvanced(true);
    setRevisionMeta(null);
    setRevisionRequest("");
    setResult(null);
    setQuality(null);
    setSaved(false);

    if (snapshot) {
      setTargetPlatform(snapshot.targetPlatform);
      setTheme(snapshot.theme);
      setGenres([...snapshot.selectedMusicStyles]);
      setCustomGenre(snapshot.customMusicStyle);
      setMoods([...snapshot.selectedMoods]);
      setCustomMood(snapshot.customMood);
      setInstruments([...snapshot.selectedInstruments]);
      setCustomInstruments(snapshot.customInstruments);
      setBpm(snapshot.bpmMode || "Auto");
      setCustomBpm(snapshot.customBpm);
      setStructure([...snapshot.songStructure]);
      setSongBlueprint(buildSongBlueprint(snapshot.songStructure, snapshot.songBlueprint));
      setActiveSmartPresetId(snapshot.smartPresetId ?? "");
      setPresetCulturalStyleId(snapshot.culturalStyleId || "");
      setProduction(snapshot.productionStyle);
      setInstructions(snapshot.additionalInstructions);
      setLanguage(snapshot.language);
      setLanguageVariant(snapshot.languageVariant ?? "");
      setCustomLanguage(snapshot.customLanguage);
      if (snapshot.generationModel) {
        setGenerationModel(snapshot.generationModel);
        setGenerationModelChosen(true);
      }
      return;
    }

    // Legacy saved versions: load only fields we actually stored. Never invent
    // unavailable historical Advanced settings.
    setTheme(prompt.theme ?? "");
    setGenres([]);
    setCustomGenre(prompt.genre ?? "");
    setMoods([]);
    setCustomMood(prompt.mood ?? "");
    setInstruments([]);
    setCustomInstruments("");
    setBpm("Auto");
    setCustomBpm("");
    setStructure([]);
    setSongBlueprint([]);
    setActiveSmartPresetId("");
    setPresetCulturalStyleId("");
    setProduction("");
    setInstructions("");
    setAtlasInstructions(null);
    setAtlasRecoveryText("");
    const storedLanguage = (prompt.language ?? "").trim();
    const storedVariant = findSongLanguageVariantFromCanonical(storedLanguage);
    const knownLanguage = LANGUAGE_OPTIONS.find(
      (item) => item !== CUSTOM && item.toLowerCase() === storedLanguage.toLowerCase(),
    );
    if (storedVariant) {
      setLanguage(storedVariant.language);
      setLanguageVariant(storedVariant.variantId);
      setCustomLanguage("");
    } else if (knownLanguage) {
      setLanguage(knownLanguage);
      setLanguageVariant("");
      setCustomLanguage("");
    } else if (storedLanguage) {
      setLanguage(CUSTOM);
      setLanguageVariant("");
      setCustomLanguage(storedLanguage);
    } else {
      setLanguage("");
      setLanguageVariant("");
      setCustomLanguage("");
    }
  }, [
    revisionMode,
    revisionBase.data,
    setBpm,
    setCustomBpm,
    setCustomGenre,
    setCustomInstruments,
    setCustomMood,
    setGenres,
    setInstructions,
    setInstruments,
    setMoods,
    setProduction,
    setSongBlueprint,
    setStructure,
  ]);

  useEffect(() => {
    if (search.mode !== "revision") return;
    setRevisionMode(true);
    setAdvanced(true);
    if (search.project) setRevisionProjectId(search.project);
    if (search.base) setRevisionBasePromptId(search.base);
  }, [search.mode, search.project, search.base]);

  function rememberJob(id: string | null) {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(jobStorageKey, id);
    else window.localStorage.removeItem(jobStorageKey);
  }

  function applyJob(job: GenerationJob) {
    const inputTargetPlatform = (
      job.input as (GenerationContext & { targetPlatform?: AITargetPlatform }) | null
    )?.targetPlatform;
    if (inputTargetPlatform) setTargetPlatform(inputTargetPlatform);
    if (job.status === "completed" && job.result) {
      if ("sectionEdit" in job.result) {
        setStatus(t("generator.failed"));
        setBusy(false);
        setJobId(null);
        rememberJob(null);
        return;
      }
      const { revisionMeta: completedRevisionMeta, ...songResult } = job.result;
      setResult(songResult);
      setImportedResultActive(false);
      if (importedRecoveryKey) window.sessionStorage.removeItem(importedRecoveryKey);
      setWorkspaceResultSaved(false);
      setRevisionMeta(completedRevisionMeta ?? null);
      setSaved(Boolean(completedRevisionMeta));
      if (job.input?.operation === "revision" && job.input.revision) {
        setRevisionMode(true);
        setAdvanced(true);
        setRevisionProjectId(job.input.revision.projectId ?? "");
        setRevisionBasePromptId(job.input.revision.basePromptId);
        setRevisionRequest(job.input.revision.revisionRequest);
      }
      const recoveredSongContext =
        job.input && job.input.operation !== "lyrics_section_edit" ? job.input : null;
      setGenerationId(job.generationId);
      setGenerationResultModel(job.model);
      setSongContext(recoveredSongContext);
      setQuality(null);
      setQualityCheckResultModel(null);
      setOpen({ title: false, tags: false, lyrics: false, note: false });
      setStatus(null);
      setBusy(false);
      setJobId(null);
      rememberJob(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (completedRevisionMeta) {
        void queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false });
        void queryClient.invalidateQueries({
          queryKey: ["library", "prompt-projects"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["generator", "revision-versions"],
          exact: false,
        });
      }
      return;
    }
    if (job.status === "cancelled") {
      setBusy(false);
      setStopRequested(false);
      setGenerationResultModel(null);
      setStatus(
        job.cancellationOutcome === "cancelled_before_start"
          ? appLanguage === "el"
            ? "Η δημιουργία διακόπηκε πριν ξεκινήσει η επεξεργασία."
            : "Generation stopped before processing started."
          : job.cancellationOutcome === "cancelled_upstream_confirmed"
            ? appLanguage === "el"
              ? "Η διακοπή επιβεβαιώθηκε από τον πάροχο."
              : "The provider confirmed generation was stopped."
            : appLanguage === "el"
              ? "Η διακοπή καταχωρήθηκε, αλλά δεν επιβεβαιώθηκε από τον πάροχο. Η επεξεργασία ή η χρέωση ενδέχεται να συνεχιστεί."
              : "The stop was recorded, but the provider has not confirmed it. Processing or charges may continue.",
      );
      setJobId(null);
      rememberJob(null);
      return;
    }
    if (job.status === "failed") {
      setStatus(localizeAiError(job.error, "generator.failed", t));
      setBusy(false);
      setGenerationResultModel(null);
      setJobId(null);
      rememberJob(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      return;
    }
    rememberJob(job.jobId);
    setJobId(job.jobId);
    setBusy(true);
    if (job.cancelRequestedAt) setStopRequested(true);
    setStatus(
      job.cancelRequestedAt
        ? appLanguage === "el"
          ? "Γίνεται διακοπή της δημιουργίας..."
          : "Stopping generation..."
        : t("generator.generating"),
    );
  }

  const { data: jobData, refetch: refetchJob } = useQuery({
    queryKey: ["gen-job", jobId],
    queryFn: () => getGenerationJob({ data: { jobId: jobId as string } }),
    enabled: !!jobId,
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });
  useEffect(() => {
    const job = jobData?.job;
    if (!job || job.jobId !== jobId) return;
    applyJob(job); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [jobData, jobId]);
  useEffect(() => {
    if (!user || jobId || result) return;
    // A user-imported MD result is authoritative; a prior generated job must
    // not overwrite it while its component state is being restored.
    if (
      !freshSession &&
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(`pb:imported-quality:v1:${user.id}`)
    )
      return;
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(jobStorageKey) : null;
    if (stored) {
      setJobId(stored);
      setBusy(true);
      return;
    }
    let cancelled = false;
    if (freshSession) return;
    void getLatestGenerationJob()
      .then((r) => {
        const job = r.job;
        if (cancelled || !job) return;
        if (job.status === "pending" || job.status === "processing" || job.status === "completed")
          applyJob(job);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, jobId, result]);

  // Imported MD results have no generationId. Preserve the result across a browser
  // reload so the independently durable Quality Check can still be shown.
  const importedRecoveryKey = user ? `pb:imported-quality:v1:${user.id}` : null;
  useEffect(() => {
    if (!importedRecoveryKey || freshSession || search.workspace === "lyrics" || revisionMode)
      return;
    try {
      const raw = window.sessionStorage.getItem(importedRecoveryKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        result?: GeneratorResult;
        quality?: QualityReport | null;
      };
      if (
        !saved.result ||
        typeof saved.result.title !== "string" ||
        typeof saved.result.tags !== "string" ||
        typeof saved.result.lyrics !== "string" ||
        typeof saved.result.note !== "string"
      )
        return;
      setResult((current) => current ?? saved.result ?? null);
      setImportedResultActive(true);
      if (saved.quality) setQuality(saved.quality);
      setOpen({ title: true, tags: true, lyrics: true, note: true });
    } catch {
      // Recovery must not break normal Generator use.
    }
    // The saved state belongs to the signed-in user, not a prior account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedRecoveryKey, freshSession, search.workspace]);

  useEffect(() => {
    if (!importedRecoveryKey || !importedResultActive || !result) return;
    try {
      window.sessionStorage.setItem(importedRecoveryKey, JSON.stringify({ result, quality }));
    } catch {
      // Storage may be unavailable or full; the live result stays usable.
    }
  }, [importedRecoveryKey, importedResultActive, result, quality]);

  const [qualityActionId, setQualityActionId] = useState<string | null>(null);
  const [qualityStopRequested, setQualityStopRequested] = useState(false);
  const pendingQualityKey = useRef<string | null>(null);
  const stopQualityCheck = async () => {
    if (!qualityActionId || qualityStopRequested) return;
    try {
      const { outcome } = await requestQualityCheckCancellation({
        data: { actionId: qualityActionId },
      });
      if (outcome === "CANCELLED_BEFORE_START") {
        setChecking(false);
        setQualityActionId(null);
        rememberQualityJob(null);
        pendingQualityKey.current = null;
        setCheckError("Ο έλεγχος ποιότητας διακόπηκε.");
      } else if (outcome === "ALREADY_FINAL") {
        setCheckError("Το Quality Check είχε ήδη ολοκληρωθεί.");
      } else {
        setQualityStopRequested(true);
      }
    } catch {
      setCheckError("Δεν ήταν δυνατή η αποστολή της διακοπής.");
    }
  };
  function rememberQualityJob(id: string | null) {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(qualityJobStorageKey, id);
    else window.localStorage.removeItem(qualityJobStorageKey);
  }
  function applyQualityJob(job: QualityCheckJob) {
    if (job.status === "completed") {
      setQualityStopRequested(false);
      if (job.qualityReport) {
        setQuality(job.qualityReport);
        setQualityCheckResultModel(job.model);
        setApplied({});
        setApplyErrors({});
        setCheckError(null);
      } else setCheckError(t("quality.invalid"));
      setChecking(false);
      setQualityActionId(null);
      rememberQualityJob(null);
      pendingQualityKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      return;
    }
    if (job.status === "cancelled") {
      setQualityStopRequested(false);
      setChecking(false);
      setQualityActionId(null);
      rememberQualityJob(null);
      pendingQualityKey.current = null;
      setCheckError(
        job.cancellationOutcome === "cancelled_before_start"
          ? "Ο έλεγχος ποιότητας διακόπηκε."
          : job.cancellationOutcome === "cancelled_upstream_confirmed"
            ? "Ο έλεγχος ποιότητας διακόπηκε."
            : "Ο έλεγχος ποιότητας διακόπηκε.",
      );
      return;
    }
    if (job.status === "failed") {
      setCheckError(localizeAiError(job.error, "quality.unavailable", t));
      setChecking(false);
      setQualityActionId(null);
      rememberQualityJob(null);
      pendingQualityKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      return;
    }
    rememberQualityJob(job.actionId);
    if (job.cancelRequestedAt) setQualityStopRequested(true);
    setQualityActionId(job.actionId);
    setChecking(true);
    setCheckError(null);
  }

  const { data: qualityJobData, refetch: refetchQualityJob } = useQuery({
    queryKey: ["quality-job", qualityActionId],
    queryFn: () => getQualityCheckJob({ data: { actionId: qualityActionId as string } }),
    enabled: !!qualityActionId,
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });
  useEffect(() => {
    if (!qualityActionId || !qualityJobData) return;
    if (!qualityJobData.job) {
      setQualityActionId(null);
      setChecking(false);
      rememberQualityJob(null);
      return;
    }
    if (qualityJobData.job.actionId !== qualityActionId) return;
    applyQualityJob(qualityJobData.job); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [qualityJobData, qualityActionId]);
  useEffect(() => {
    if (!user || !result || qualityActionId || quality) return;
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(qualityJobStorageKey) : null;
    if (stored) {
      setQualityActionId(stored);
      setChecking(true);
      return;
    }
    if (!generationId) return;
    let cancelled = false;
    void getLatestQualityCheckJob({ data: { generationId } })
      .then((r) => {
        if (cancelled || !r.job) return;
        applyQualityJob(r.job);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, result, generationId, qualityActionId, quality]);

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      if (jobId) void refetchJob();
      if (qualityActionId) void refetchQualityJob();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
    };
  }, [jobId, qualityActionId, refetchJob, refetchQualityJob]);

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
  const {
    data: aiModelAccess,
    isLoading: aiModelAccessLoading,
    error: aiModelAccessError,
  } = useQuery({
    queryKey: ["my-ai-model-access"],
    queryFn: () => getCurrentUserAiModelAccess(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!aiModelAccess) return;
    const generatorAccess = aiModelAccess.generator;
    const qualityAccess = aiModelAccess.qualityCheck;
    if (
      !generationModelChosen ||
      !generatorAccess.availableModels.includes(
        generationModel as (typeof generatorAccess.availableModels)[number],
      )
    )
      setGenerationModel(generatorAccess.defaultModel);
    if (
      !qualityCheckModelChosen ||
      !qualityAccess.availableModels.includes(
        qualityCheckModel as (typeof qualityAccess.availableModels)[number],
      )
    )
      setQualityCheckModel(qualityAccess.defaultModel);
  }, [
    aiModelAccess,
    generationModel,
    generationModelChosen,
    qualityCheckModel,
    qualityCheckModelChosen,
  ]);

  const modelAccessLoading = aiModelAccessLoading || (!aiModelAccess && !aiModelAccessError);
  const modelAccessReady = !!aiModelAccess;
  const generationAvailableModels = modelAccessReady ? aiModelAccess.generator.modelOptions : [];
  const qualityAvailableModels = modelAccessReady ? aiModelAccess.qualityCheck.modelOptions : [];
  const generationModelAccessUnavailable =
    (!!aiModelAccessError || modelAccessReady) && generationAvailableModels.length === 0;
  const qualityModelAccessUnavailable =
    (!!aiModelAccessError || modelAccessReady) && qualityAvailableModels.length === 0;
  const showGenerationModelSelector = generationAvailableModels.length > 1;
  const showQualityCheckModelSelector = qualityAvailableModels.length > 1;
  const registryModelLabel = (modelId: string) =>
    generationAvailableModels.find((model) => model.id === modelId)?.label ??
    qualityAvailableModels.find((model) => model.id === modelId)?.label ??
    aiModelLabel(modelId);
  const exportGeneratorBenchmark = () => {
    if (!result) return;
    const modelId =
      generationResultModel ??
      songContext?.inputSnapshot?.generationModel ??
      generationModel ??
      "unknown";
    const modelOption =
      generationAvailableModels.find((model) => model.id === modelId) ??
      qualityAvailableModels.find((model) => model.id === modelId);
    const exportedAt = new Date().toISOString();
    const markdown = buildGeneratorBenchmarkMarkdown({
      title: result.title,
      musicStyle: result.tags,
      lyrics: result.lyrics,
      producerNote: result.note,
      modelId,
      modelLabel: modelOption?.label ?? aiModelLabel(modelId),
      provider: modelOption?.provider ?? null,
      targetPlatform: effectiveTargetPlatform,
      generatorMode: revisionMode ? "revision" : advanced ? "advanced" : "basic",
      promptVersion: songContext?.promptVersion ?? "v1",
      exportedAt,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = generatorBenchmarkFilename({
      title: result.title,
      modelLabel: modelOption?.label ?? aiModelLabel(modelId),
      exportedAt,
    });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const songContextTargetPlatform = (
    songContext as (GenerationContext & { targetPlatform?: AITargetPlatform }) | null
  )?.targetPlatform;
  const effectiveTargetPlatform = songContextTargetPlatform ?? targetPlatform;
  const resultTagsLabel =
    effectiveTargetPlatform === "udio"
      ? t("generator.result.udioPrompt")
      : t("generator.result.stylePrompt");
  const remaining = usage?.remaining ?? HOURLY_LIMIT;
  const hasAdminInputBypass = usage != null && "unlimited" in usage && usage.unlimited === true;
  const minutesLeft = useMemo(() => {
    if (!usage?.resetAt) return 0;
    return Math.max(1, Math.ceil((new Date(usage.resetAt).getTime() - now) / 60000));
  }, [usage?.resetAt, now]);
  const blocked = remaining <= 0;

  const customGenreSelected = genres.includes(CUSTOM);
  const styleList = mergeValues(
    genres.filter((g) => g !== CUSTOM),
    advanced || customGenreSelected ? customGenre : "",
  );
  const baseGenre = styleList.join(", ");
  const instrumentList = mergeValues(instruments, customInstruments);
  const effectiveBpm = bpm === "Auto" ? "" : bpm === "Custom" ? customBpm.trim() : bpm;
  const bpmNumber = Number(effectiveBpm);
  const bpmInvalid =
    !!effectiveBpm && (!/^\d{1,3}$/.test(effectiveBpm) || bpmNumber < 40 || bpmNumber > 260);
  const direction = [
    instrumentList.length ? `Preferred instruments: ${instrumentList.join(", ")}.` : "",
    !bpmInvalid && effectiveBpm ? `Target tempo: ${effectiveBpm} BPM.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const effectiveGenre = direction
    ? `${baseGenre} — Additional musical direction: ${direction}`
    : baseGenre;

  const useCustomMood = advanced || moods[0] === CUSTOM;
  const moodList = mergeValues(
    moods.filter((m) => m !== CUSTOM),
    useCustomMood ? customMood : "",
  );
  const effectiveMood = moodList.join(", ");

  const baseLanguage = language === CUSTOM ? customLanguage.trim() : language;
  const effectiveLanguage =
    language === CUSTOM ? baseLanguage : resolveSongLanguage(language, languageVariant);
  const musicStyleLimit = revisionMode ? 500 : advanced ? 150 : 400;
  const themeLimit = advanced ? 500 : 300;
  const moodLimit = advanced ? 120 : 60;
  const instrumentsText = instrumentList.join(", ");
  const themeTooLong = theme.trim().length > themeLimit;
  const musicStyleTooLong = advanced
    ? baseGenre.length > musicStyleLimit
    : effectiveGenre.length > musicStyleLimit;
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
  const currentSnapshot: GeneratorInputSnapshot = {
    generatorMode: revisionMode ? "revision" : advanced ? "advanced" : "basic",
    smartPresetId: activeSmartPresetId,
    culturalStyleId: activeSmartPresetId === "local-folk-popular" ? presetCulturalStyleId : "",
    theme: theme.trim(),
    selectedMusicStyles: genres.filter((value) => value !== CUSTOM),
    customMusicStyle: customGenre.trim(),
    selectedMoods: moods.filter((value) => value !== CUSTOM),
    customMood: customMood.trim(),
    language,
    languageVariant,
    customLanguage: customLanguage.trim(),
    selectedInstruments: [...instruments],
    customInstruments: customInstruments.trim(),
    bpmMode: bpm,
    customBpm: customBpm.trim(),
    songStructure: [...structure],
    songBlueprint: advanced || revisionMode ? buildSongBlueprint(structure, songBlueprint) : [],
    productionStyle: production.trim(),
    additionalInstructions: instructions.trim(),
    targetPlatform,
    generationModel: generationModel || null,
  };
  const generatorDraftScope = revisionMode
    ? `generator:revision:${revisionProjectId || "none"}:${revisionBasePromptId || "none"}`
    : freshSession
      ? `generator:fresh:${freshSession}`
      : "generator:new";
  const atlasOwnerIdRef = useRef(user?.id);
  useEffect(() => {
    if (atlasOwnerIdRef.current === user?.id) return;
    atlasOwnerIdRef.current = user?.id;
    setAtlasInstructions(null);
    setAtlasRecoveryText("");
    setAtlasImportNotice(false);
  }, [user?.id]);
  const clearGeneratorDraft = useDraftAutosave({
    // Do not erase a saved fresh-session draft while account preferences are still hydrating.
    ownerId: freshSession && !accountPreferencesReady ? null : user?.id,
    scope: generatorDraftScope,
    enabled: Boolean(user && accountPreferences.autoSaveDrafts && search.workspace !== "lyrics"),
    value: { snapshot: currentSnapshot, revisionRequest, atlasInstructions, atlasRecoveryText },
    onRestore: (draft) => {
      const snapshot = draft.snapshot;
      try {
        setAtlasInstructions(restoreAtlasInstructionLayer(draft.atlasInstructions));
        setAtlasRecoveryText(draft.atlasRecoveryText ?? "");
      } catch {
        setAtlasInstructions(null);
        setAtlasRecoveryText(
          typeof draft.atlasInstructions?.text === "string"
            ? draft.atlasInstructions.text
            : (draft.atlasRecoveryText ?? ""),
        );
        setAtlasImportNotice(true);
      }
      setAdvanced(snapshot.generatorMode !== "basic");
      setTargetPlatform(snapshot.targetPlatform);
      setTheme(snapshot.theme);
      setGenres([...snapshot.selectedMusicStyles]);
      setCustomGenre(snapshot.customMusicStyle);
      setMoods([...snapshot.selectedMoods]);
      setCustomMood(snapshot.customMood);
      setInstruments([...snapshot.selectedInstruments]);
      setCustomInstruments(snapshot.customInstruments);
      setBpm(snapshot.bpmMode || "Auto");
      setCustomBpm(snapshot.customBpm);
      setStructure([...snapshot.songStructure]);
      setSongBlueprint(buildSongBlueprint(snapshot.songStructure, snapshot.songBlueprint));
      setActiveSmartPresetId(snapshot.smartPresetId ?? "");
      setPresetCulturalStyleId(snapshot.culturalStyleId || "");
      setProduction(snapshot.productionStyle);
      setInstructions(snapshot.additionalInstructions);
      setLanguage(snapshot.language);
      setLanguageVariant(snapshot.languageVariant ?? "");
      setCustomLanguage(snapshot.customLanguage);
      if (snapshot.generationModel) {
        setGenerationModel(snapshot.generationModel);
        setGenerationModelChosen(true);
      }
      setRevisionRequest(draft.revisionRequest ?? "");
    },
    isEmpty: (draft) => {
      const snapshot = draft.snapshot;
      return (
        !snapshot.theme &&
        snapshot.selectedMusicStyles.length === 0 &&
        !snapshot.customMusicStyle &&
        snapshot.selectedMoods.length === 0 &&
        !snapshot.customMood &&
        !snapshot.language &&
        !snapshot.customLanguage &&
        snapshot.selectedInstruments.length === 0 &&
        !snapshot.customInstruments &&
        snapshot.bpmMode === "Auto" &&
        !snapshot.customBpm &&
        snapshot.songStructure.length === 0 &&
        !snapshot.productionStyle &&
        !snapshot.additionalInstructions &&
        !snapshot.smartPresetId &&
        !draft.revisionRequest.trim() &&
        !draft.atlasInstructions &&
        !draft.atlasRecoveryText
      );
    },
  });
  const generatorPageUnloadRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    generatorPageUnloadRef.current = false;
    const markPageUnload = () => {
      generatorPageUnloadRef.current = true;
    };
    window.addEventListener("beforeunload", markPageUnload);
    return () => {
      window.removeEventListener("beforeunload", markPageUnload);
      if (!generatorPageUnloadRef.current) clearGeneratorDraft();
    };
  }, [clearGeneratorDraft]);

  const revisionReady =
    !revisionMode ||
    (!!revisionProjectId &&
      !!revisionBasePromptId &&
      !!revisionBase.data?.prompt &&
      revisionRequest.trim().length > 0);
  usePb012LastWork(
    user?.id ?? null,
    !loading &&
      generatorFeature.allowed &&
      search.workspace !== "lyrics" &&
      (!revisionMode || Boolean(revisionBase.data?.prompt))
      ? { type: "generator" }
      : null,
  );
  const ready =
    theme.trim().length >= 3 &&
    !!baseGenre &&
    !!effectiveMood &&
    !!effectiveLanguage &&
    !validationError &&
    revisionReady;
  type RequiredFieldKey = "theme" | "musicStyle" | "mood" | "language";
  const missingRequiredFields: Array<{ key: RequiredFieldKey; message: string }> = [];
  if (theme.trim().length < 3) {
    missingRequiredFields.push({
      key: "theme",
      message:
        appLanguage === "el"
          ? "Θέμα — γράψε τουλάχιστον 3 χαρακτήρες."
          : "Theme — enter at least 3 characters.",
    });
  }
  if (!baseGenre) {
    missingRequiredFields.push({
      key: "musicStyle",
      message:
        appLanguage === "el"
          ? "Music Style — επίλεξε τουλάχιστον ένα style ή γράψε custom style."
          : "Music Style — choose at least one style or enter a custom style.",
    });
  }
  if (!effectiveMood) {
    missingRequiredFields.push({
      key: "mood",
      message:
        appLanguage === "el"
          ? "Mood / Vibe — επίλεξε τουλάχιστον ένα mood ή γράψε custom mood."
          : "Mood / Vibe — choose at least one mood or enter a custom mood.",
    });
  }
  if (!effectiveLanguage) {
    missingRequiredFields.push({
      key: "language",
      message:
        appLanguage === "el"
          ? "Γλώσσα — επίλεξε γλώσσα ή συμπλήρωσε custom γλώσσα."
          : "Language — choose a language or enter a custom language.",
    });
  }
  const missingRequiredKeys = new Set(missingRequiredFields.map((field) => field.key));
  const requiredControlClass = (key: RequiredFieldKey) =>
    requiredValidationAttempted && missingRequiredKeys.has(key)
      ? " !border-red-400/70 shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_20%,transparent)] focus:!border-red-400/80 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_24%,transparent)]"
      : "";
  const requiredPickerClass = (key: RequiredFieldKey) =>
    requiredValidationAttempted && missingRequiredKeys.has(key)
      ? "[&>button]:!border-red-400/70 [&>button]:!shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_20%,transparent)]"
      : "";
  const generationActionDisabled =
    !generatorFeature.allowed ||
    busy ||
    checking ||
    blocked ||
    modelAccessLoading ||
    generationModelAccessUnavailable ||
    (revisionMode && !revisionReady);

  const pickPrimary = (setter: (fn: (prev: string[]) => string[]) => void) => (value: string) =>
    setter((prev) => [value, ...prev.slice(1).filter((x) => x !== value)]);
  const toggleValue = (setter: (fn: (prev: string[]) => string[]) => void) => (value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  const clearStructure = () => {
    setStructure([]);
    setSongBlueprint([]);
  };
  const addSimpleStructureSection = (sectionType: string) => {
    commitArrangement(appendArrangementSection(arrangement, sectionType));
  };

  const removeSimpleStructureSection = (sectionId: string) => {
    commitArrangement(removeArrangementSection(arrangement, sectionId));
  };

  const applySmartPreset = (preset: SmartPreset) => {
    const resolved = resolveSmartPreset(preset, presetCulturalStyleId);
    setAdvanced(true);

    const knownStyles = resolved.musicStyles.filter((value) => ADVANCED_STYLES.includes(value));
    const customStyles = resolved.musicStyles.filter((value) => !ADVANCED_STYLES.includes(value));
    setGenres(knownStyles);
    setCustomGenre(customStyles.join(", "));

    const knownMoods = resolved.moods.filter((value) => ADVANCED_MOOD_VALUES.includes(value));
    const customMoods = resolved.moods.filter((value) => !ADVANCED_MOOD_VALUES.includes(value));
    setMoods(knownMoods);
    setCustomMood(customMoods.join(", "));

    const knownInstruments = resolved.instruments.filter((value) => INSTRUMENTS.includes(value));
    const customInstrumentValues = resolved.instruments.filter(
      (value) => !INSTRUMENTS.includes(value),
    );
    setInstruments(knownInstruments);
    setCustomInstruments(customInstrumentValues.join(", "));

    if (BPM_OPTIONS.includes(resolved.bpm)) {
      setBpm(resolved.bpm);
      setCustomBpm("");
    } else {
      setBpm("Custom");
      setCustomBpm(resolved.bpm);
    }

    setStructure([...resolved.structure]);
    setSongBlueprint(buildPresetBlueprint(resolved.structure, resolved));
    setProduction(resolved.productionStyle);
    setInstructions(resolved.additionalInstructions);
    setActiveSmartPresetId(preset.id);
  };

  const setupIoText =
    appLanguage === "el"
      ? {
          export: "Εξαγωγή setup",
          import: "Εισαγωγή setup",
          confirmBody: "Η εισαγωγή θα αντικαταστήσει τα τρέχοντα πεδία του Advanced Generator.",
          confirm: "Εισαγωγή",
          cancel: "Ακύρωση",
          invalid: "Μη έγκυρο αρχείο setup.",
          version: "Μη υποστηριζόμενη έκδοση αρχείου setup.",
          size: "Το αρχείο είναι πολύ μεγάλο (έως 256 KB).",
          read: "Δεν ήταν δυνατή η ανάγνωση του αρχείου.",
        }
      : {
          export: "Export setup",
          import: "Import setup",
          confirmBody: "Importing will replace the current Advanced Generator fields.",
          confirm: "Import",
          cancel: "Cancel",
          invalid: "Invalid setup file.",
          version: "Unsupported setup file version.",
          size: "File is too large (max 256 KB).",
          read: "Could not read the file.",
        };

  const exportAdvancedSetup = () => {
    setSetupIoError(null);
    try {
      if (atlasRecoveryText) throw new Error("Resolve ambiguous Atlas text before exporting.");
      const json = serializeAtlasAwareSetup(
        {
          targetPlatform,
          theme,
          selectedMusicStyles: genres,
          customMusicStyle: customGenre,
          selectedMoods: moods,
          customMood,
          selectedInstruments: instruments,
          customInstruments,
          bpmMode: bpm,
          customBpm,
          songStructure: structure,
          songBlueprint: buildSongBlueprint(structure, songBlueprint),
          productionStyle: production,
          additionalInstructions: instructions,
          language,
          languageVariant,
          customLanguage,
          smartPresetId: activeSmartPresetId,
          culturalStyleId: presetCulturalStyleId,
        },
        atlasInstructions,
      );
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = advancedSetupFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setSetupIoError(setupIoText.invalid);
    }
  };

  const onSongMarkdownSelected = async (file: File | undefined) => {
    setSetupIoError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md") || file.size > SONG_MARKDOWN_MAX_BYTES) {
      setSetupIoError(
        appLanguage === "el"
          ? "Μη έγκυρο ή υπερβολικά μεγάλο αρχείο MD."
          : "Invalid or oversized MD file.",
      );
      return;
    }
    try {
      const parsed = parseSongMarkdown(await file.text());
      if (!parsed) throw new Error("Invalid export");
      // A local import must survive an app reload while its QC runs.
      if (importedRecoveryKey) {
        try {
          window.sessionStorage.setItem(
            importedRecoveryKey,
            JSON.stringify({ result: parsed, quality: null }),
          );
        } catch {
          /* Storage not available. */
        }
      }
      setImportedResultActive(true);
      setResult(parsed);
      setJobId(null);
      rememberJob(null);
      pendingKey.current = null;
      setBusy(false);
      setGenerationId(null);
      setGenerationResultModel(null);
      setSongContext(null);
      setQuality(null);
      setQualityCheckResultModel(null);
      setQualityActionId(null);
      rememberQualityJob(null);
      pendingQualityKey.current = null;
      setChecking(false);
      setCheckError(null);
      setApplied({});
      setApplyErrors({});
      setWorkspaceResultSaved(false);
      setSaved(false);
      setRevisionMeta(null);
      setOpen({ title: true, tags: true, lyrics: true, note: true });
      setStatus(
        appLanguage === "el"
          ? "Το αποτέλεσμα MD εισήχθη χωρίς δημιουργία AI."
          : "MD result imported without AI generation.",
      );
    } catch {
      setSetupIoError(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η εισαγωγή του MD."
          : "Could not import MD song result.",
      );
    }
  };

  const onSetupFileSelected = async (file: File | undefined) => {
    setSetupIoError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) return setSetupIoError(setupIoText.invalid);
    if (file.size > ADVANCED_SETUP_MAX_BYTES) return setSetupIoError(setupIoText.size);
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setSetupIoError(setupIoText.read);
    }
    const atlasImport = parseAtlasAwareSetup(text);
    if (atlasImport.kind === "invalid")
      return setSetupIoError(
        appLanguage === "el"
          ? "Ασαφής ή μη έγκυρη προέλευση Atlas. Κρατήστε τις χειροκίνητες αλλαγές στο πεδίο additionalInstructions· δεν άλλαξε το τρέχον setup."
          : "Ambiguous or invalid Atlas provenance. Keep manual edits in additionalInstructions; current setup was not changed.",
      );
    if (atlasImport.kind === "atlas") {
      setPendingAtlasImport(atlasImport.layer);
      setPendingSetupImport(atlasImport.setup);
      return;
    }
    const parsed = parseAdvancedSetup(text);
    if (!parsed.ok) return setSetupIoError(setupIoText[parsed.error]);
    setPendingAtlasImport(null);
    setPendingSetupImport(parsed.setup);
  };

  const confirmSetupImport = () => {
    const setup = pendingSetupImport;
    if (!setup) return;
    const styles = splitKnownValues(
      setup.selectedMusicStyles,
      [...ADVANCED_STYLES, CUSTOM],
      setup.customMusicStyle,
    );
    const moodSplit = splitKnownValues(
      setup.selectedMoods,
      [...ADVANCED_MOOD_VALUES, CUSTOM],
      setup.customMood,
    );
    const inst = splitKnownValues(
      setup.selectedInstruments,
      [...INSTRUMENTS, CUSTOM],
      setup.customInstruments,
    );
    setRequiredValidationAttempted(false);
    setRevisionMode(false);
    setAdvanced(true);
    setTargetPlatform(setup.targetPlatform);
    setTheme(setup.theme);
    setGenres(styles.selected);
    setCustomGenre(styles.custom);
    setMoods(moodSplit.selected);
    setCustomMood(moodSplit.custom);
    setInstruments(inst.selected);
    setCustomInstruments(inst.custom);
    if (BPM_OPTIONS.includes(setup.bpmMode) || setup.bpmMode === "Custom") {
      setBpm(setup.bpmMode);
      setCustomBpm(setup.customBpm);
    } else {
      setBpm("Custom");
      setCustomBpm(setup.customBpm || setup.bpmMode.slice(0, 20));
    }
    setStructure([...setup.songStructure]);
    setSongBlueprint(buildSongBlueprint(setup.songStructure, setup.songBlueprint));
    setActiveSmartPresetId(setup.smartPresetId);
    setPresetCulturalStyleId(setup.culturalStyleId);
    setProduction(setup.productionStyle);
    setInstructions(setup.additionalInstructions);
    setAtlasInstructions(pendingAtlasImport);
    setAtlasRecoveryText("");
    setAtlasImportNotice(!pendingAtlasImport);
    setPendingAtlasImport(null);
    setLanguage(setup.language);
    setLanguageVariant(setup.languageVariant);
    setCustomLanguage(setup.customLanguage);
    setPendingSetupImport(null);
  };

  const applySongSetup = (draft: SongSetupDraft) => {
    setAdvanced(true);
    setActiveSmartPresetId("");
    setPresetCulturalStyleId("");
    setTheme(draft.theme.trim());
    setGenres([]);
    setCustomGenre(draft.musicStyle.trim());
    setMoods([]);
    setCustomMood(draft.mood.trim());
    setInstruments([]);
    setCustomInstruments(draft.instruments.trim());

    const draftBpm = draft.bpm.trim();
    if (draftBpm === "Auto") {
      setBpm("Auto");
      setCustomBpm("");
    } else if (BPM_OPTIONS.includes(draftBpm)) {
      setBpm(draftBpm);
      setCustomBpm("");
    } else {
      setBpm("Custom");
      setCustomBpm(draftBpm);
    }

    const parsedStructure = draft.songStructure
      .split(/→|->/)
      .map((item) => item.trim())
      .filter((item): item is string => STRUCTURE_TAGS.includes(item));
    setStructure(parsedStructure);
    setSongBlueprint(buildSongBlueprint(parsedStructure));
    setProduction(draft.productionStyle.trim());
    setInstructions(draft.additionalInstructions.trim());

    const requestedLanguage = draft.language.trim();
    const requestedVariant = findSongLanguageVariantFromCanonical(requestedLanguage);
    const knownLanguage = LANGUAGE_OPTIONS.find(
      (item) => item !== CUSTOM && item.toLowerCase() === requestedLanguage.toLowerCase(),
    );
    if (requestedVariant) {
      setLanguage(requestedVariant.language);
      setLanguageVariant(requestedVariant.variantId);
      setCustomLanguage("");
    } else if (knownLanguage) {
      setLanguage(knownLanguage);
      setLanguageVariant("");
      setCustomLanguage("");
    } else {
      setLanguage(CUSTOM);
      setLanguageVariant("");
      setCustomLanguage(requestedLanguage);
    }
  };

  const generate = async () => {
    if (!ready) return;
    if (!generatorFeature.allowed) {
      setStatus(t("generator.featureUnavailable"));
      return;
    }
    if (busy || jobId || checking || qualityActionId) return;
    setStopRequested(false);
    setBusy(true);
    setStatus(t("generator.starting"));
    setSaved(false);
    setImportedResultActive(false);
    if (importedRecoveryKey) window.sessionStorage.removeItem(importedRecoveryKey);
    setResult(null);
    setQuality(null);
    setGenerationResultModel(null);
    setQualityCheckResultModel(null);
    setSongContext(null);
    setApplied({});
    setApplyErrors({});
    const key = pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    try {
      const narrativeInstruction =
        storyDriven && !revisionMode
          ? "\n\nNARRATIVE LYRICS DIRECTION: Give sung lyrics a clear beginning, development and fitting ending, without inventing extra sections or overriding user Blueprint, perspective or restrictions. No Story Map or beat labels."
          : "";
      const combinedInstructions = atlasInstructions
        ? composeAtlasInstructions(instructions.trim() + narrativeInstruction, atlasInstructions)
        : narrativeInstruction
          ? `${instructions.trim().slice(0, Math.max(0, 2000 - narrativeInstruction.length))}${narrativeInstruction}`
          : instructions.trim().slice(0, 2000);
      const res = await startGenerationJob({
        data: {
          idempotencyKey: key,
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          targetPlatform,
          generationModel,
          promptVersion:
            advanced && !revisionMode && moderation.isSuperAdmin ? promptVersion : "v1",
          advanced: advanced || revisionMode,
          baseMusicStyle: baseGenre,
          instruments: instrumentsText,
          structure: structure.join(" → ").slice(0, 600),
          songBlueprint:
            advanced || revisionMode
              ? activeSongBlueprint(buildSongBlueprint(structure, songBlueprint))
              : [],
          production: production.trim().slice(0, 2000),
          instructions: combinedInstructions,
          ...(atlasInstructions ? { atlasOrigin: atlasInstructions.origin } : {}),
          operation: revisionMode ? "revision" : "generate",
          inputSnapshot: currentSnapshot,
          revision: revisionMode
            ? {
                projectId: revisionProjectId || null,
                basePromptId: revisionBasePromptId,
                revisionRequest: revisionRequest.trim(),
                desiredSnapshot: currentSnapshot,
              }
            : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.rateLimited || !res.job) {
        setStatus(t("generator.rateLimit"));
        setBusy(false);
        pendingKey.current = null;
        return;
      }
      pendingKey.current = null;
      applyJob(res.job);
    } catch (err) {
      try {
        if (freshSession) throw err;
        const latest = await getLatestGenerationJob();
        if (latest.job && latest.job.status !== "failed") {
          pendingKey.current = null;
          applyJob(latest.job);
          return;
        }
      } catch {
        /* still offline */
      }
      setStatus(localizeAiError(err, "generator.failed", t));
      setBusy(false);
    }
  };

  const handleGenerateClick = () => {
    if (!ready) {
      setRequiredValidationAttempted(true);
      const firstMissingKey = missingRequiredFields[0]?.key;
      const targetRef =
        firstMissingKey === "theme"
          ? themeRequiredRef
          : firstMissingKey === "musicStyle"
            ? musicStyleRequiredRef
            : firstMissingKey === "mood"
              ? moodRequiredRef
              : firstMissingKey === "language"
                ? languageRequiredRef
                : null;
      if (targetRef) {
        requestAnimationFrame(() =>
          targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      }
      return;
    }
    setRequiredValidationAttempted(false);
    void generate();
  };

  const runCheck = async () => {
    if (!qualityFeature.allowed) {
      setCheckError(t("quality.featureUnavailable"));
      return;
    }
    if (checking || qualityActionId) return;
    const target = resultRef.current;
    if (!target) return;
    const idempotencyKey = pendingQualityKey.current ?? crypto.randomUUID();
    pendingQualityKey.current = idempotencyKey;
    setConfirm(null);
    setChecking(true);
    setCheckError(null);
    try {
      const res = await startQualityCheckJob({
        data: {
          theme: songContext?.theme?.trim() || theme.trim(),
          genre: songContext?.genre || effectiveGenre,
          mood: songContext?.mood || effectiveMood,
          language: songContext?.language || effectiveLanguage,
          targetPlatform: effectiveTargetPlatform,
          structure: songContext?.structure ?? structure.join(" → ").slice(0, 600),
          production: songContext?.production ?? production.trim().slice(0, 2000),
          instructions: songContext?.instructions ?? instructions.trim().slice(0, 2000),
          result: { ...target },
          idempotencyKey,
          qualityCheckModel,
          qualityCheckVersion: moderation.isSuperAdmin ? qualityCheckVersion : "v1",
          generationId,
        },
      });
      if (res.rateLimited || !res.job) {
        pendingQualityKey.current = null;
        setChecking(false);
        setCheckError(t("generator.rateLimit"));
        return;
      }
      pendingQualityKey.current = null;
      applyQualityJob(res.job);
    } catch (err) {
      if (generationId) {
        try {
          const latest = await getLatestQualityCheckJob({ data: { generationId } });
          if (latest.job) {
            pendingQualityKey.current = null;
            applyQualityJob(latest.job);
            return;
          }
        } catch {
          /* offline */
        }
      }
      setChecking(false);
      setCheckError(localizeAiError(err, "quality.unavailable", t));
    }
  };

  const openSaveDialog = () => {
    if (!result) return;
    setSaveName(result.title || "");
    setSaveProjectId("");
    setSaveVersionLabel("");
    setSaveNewProject("");
    setSaveFolderId(null);
    setSaveFolderPath("");
    setSaveFolderPickerOpen(false);
    setSaveDialogOpen(true);
  };

  const save = async () => {
    if (!result) return;
    setSavingLibrary(true);
    try {
      let projectId = saveProjectId || null;
      if (saveNewProject.trim()) {
        const created = await createPromptProject({
          data: { name: saveNewProject.trim(), folderId: saveFolderId },
        });
        projectId = created.project?.id ?? null;
      }
      await savePromptToLibrary({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          ...result,
          custom_name: saveName.trim() || null,
          project_id: projectId,
          folder_id: projectId ? null : saveFolderId,
          version_label: projectId ? saveVersionLabel.trim() || null : null,
          generator_input_snapshot: songContext?.inputSnapshot ?? currentSnapshot,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false });
      await queryClient.invalidateQueries({
        queryKey: ["library", "prompt-projects"],
        exact: false,
      });
      setSaved(true);
      setSaveDialogOpen(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("auth.somethingWrong"));
    } finally {
      setSavingLibrary(false);
    }
  };

  type Song = { title: string; tags: string; lyrics: string; note: string };
  const makeApplyState = (target: Song | null, setTarget: (next: Song) => void): ApplyState => ({
    applied,
    errors: applyErrors,
    onApplyCorrection: (id, c) => {
      if (!target) return;
      const res =
        c.field === "lyrics"
          ? applyLyricCorrection(target.lyrics, c)
          : applyFieldCorrection(target[c.field], c);
      if (!res.ok) return setApplyError(id, res.error);
      setTarget({ ...target, [c.field]: res.text });
      setApplyError(id, null);
      setApplied((p) => ({ ...p, [id]: true }));
    },
    onUndoCorrection: (id, c) => {
      if (!target) return;
      const res =
        c.field === "lyrics"
          ? undoLyricCorrection(target.lyrics, c)
          : undoFieldCorrection(target[c.field], c);
      if (!res.ok) return setApplyError(id, res.error);
      setTarget({ ...target, [c.field]: res.text });
      setApplyError(id, null);
      setApplied((p) => ({ ...p, [id]: false }));
    },
    onApplySuggestion: (id, s) => {
      if (!target) return;
      if (s.actionType === "add_to_music_style") {
        const res = addToMusicStyle(target.tags, s.value);
        if (!res.ok) return setApplyError(id, res.error);
        setTarget({ ...target, tags: res.text });
      } else if (s.actionType === "vocal_arrangement") {
        const lyricsRes = applyVocalArrangement(target.lyrics, s.arrangement);
        if (!lyricsRes.ok) return setApplyError(id, lyricsRes.error);
        const styleRes = s.value ? addToMusicStyle(target.tags, s.value) : null;
        setTarget({
          ...target,
          lyrics: lyricsRes.text,
          tags: styleRes?.ok ? styleRes.text : target.tags,
        });
      } else return;
      setApplyError(id, null);
      setApplied((p) => ({ ...p, [id]: true }));
    },
    onUndoSuggestion: (id, s) => {
      if (!target) return;
      if (s.actionType === "add_to_music_style") {
        const res = removeFromMusicStyle(target.tags, s.value);
        if (!res.ok) return setApplyError(id, res.error);
        setTarget({ ...target, tags: res.text });
      } else if (s.actionType === "vocal_arrangement") {
        const lyricsRes = undoVocalArrangement(target.lyrics, s.arrangement);
        if (!lyricsRes.ok) return setApplyError(id, lyricsRes.error);
        const styleRes = s.value ? removeFromMusicStyle(target.tags, s.value) : null;
        setTarget({
          ...target,
          lyrics: lyricsRes.text,
          tags: styleRes?.ok ? styleRes.text : target.tags,
        });
      } else return;
      setApplyError(id, null);
      setApplied((p) => ({ ...p, [id]: false }));
    },
  });
  const applyState = makeApplyState(result, setResult);

  const canClear =
    !!theme.trim() ||
    genres.length > 0 ||
    !!customGenre.trim() ||
    moods.length > 0 ||
    !!customMood.trim() ||
    !!language ||
    !!customLanguage.trim() ||
    instruments.length > 0 ||
    !!customInstruments.trim() ||
    bpm !== "Auto" ||
    !!customBpm.trim() ||
    structure.length > 0 ||
    !!production.trim() ||
    !!instructions.trim() ||
    !!activeSmartPresetId ||
    showStyleTags ||
    showMoodTags ||
    showInstrumentTags ||
    targetPlatform !== DEFAULT_AI_TARGET_PLATFORM ||
    !!result ||
    !!quality;
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const stopGeneration = async () => {
    if (!jobId || stoppingGeneration || stopRequested) return;
    setStoppingGeneration(true);
    try {
      const { outcome } = await requestGenerationJobCancellation({ data: { jobId } });
      setConfirmStop(false);
      if (outcome === "CANCELLED_BEFORE_START") {
        setBusy(false);
        setJobId(null);
        rememberJob(null);
        setStatus(appLanguage === "el" ? "Η δημιουργία διακόπηκε." : "Generation stopped.");
      } else if (outcome === "ALREADY_FINAL") {
        setStatus(
          appLanguage === "el"
            ? "Η εργασία είχε ήδη ολοκληρωθεί."
            : "The job had already finished.",
        );
      } else {
        setStopRequested(true);
        setStatus(
          appLanguage === "el" ? "Γίνεται διακοπή της δημιουργίας..." : "Stopping generation...",
        );
      }
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η αποστολή της εντολής διακοπής."
          : "Could not submit the cancellation request.",
      );
      setConfirmStop(false);
    } finally {
      setStoppingGeneration(false);
    }
  };

  const clearAll = async () => {
    if (clearing || checking) return;
    setClearError(null);
    let dismissedWhileRunning = false;
    if (jobId) {
      setClearing(true);
      try {
        const { outcome } = await dismissGenerationJob({ data: { jobId } });
        dismissedWhileRunning = outcome === "DISMISSED";
      } catch {
        setClearError(t("generator.dismissFailed"));
        return;
      } finally {
        setClearing(false);
      }
    }
    clearGeneratorDraft();
    setImportedResultActive(false);
    if (importedRecoveryKey) window.sessionStorage.removeItem(importedRecoveryKey);
    setTheme("");
    setGenres([]);
    setCustomGenre("");
    setMoods([]);
    setCustomMood("");
    setLanguage("");
    setLanguageVariant("");
    setCustomLanguage("");
    setInstruments([]);
    setCustomInstruments("");
    setStructure([]);
    setSongBlueprint([]);
    setShowStyleTags(false);
    setShowMoodTags(false);
    setShowInstrumentTags(false);
    setShowStructureTags(false);
    setShowArrangementAdvanced(false);
    setActiveSmartPresetId("");
    setPresetCulturalStyleId("");
    setProduction("");
    setInstructions("");
    setAtlasInstructions(null);
    setAtlasRecoveryText("");
    setBpm("Auto");
    setCustomBpm("");
    setTargetPlatform(DEFAULT_AI_TARGET_PLATFORM);
    setResult(null);
    setGenerationId(null);
    setGenerationResultModel(null);
    setQuality(null);
    setQualityCheckResultModel(null);
    setSongContext(null);
    setJobId(null);
    setStopRequested(false);
    rememberJob(null);
    pendingKey.current = null;
    setQualityActionId(null);
    rememberQualityJob(null);
    pendingQualityKey.current = null;
    setBusy(false);
    setChecking(false);
    setCheckError(null);
    setStatus(null);
    setSaved(false);
    setApplied({});
    setApplyErrors({});
    setConfirm(null);
    setConfirmClear(false);
    setRequiredValidationAttempted(false);
    setOpen({ title: false, tags: false, lyrics: false, note: false });
    if (dismissedWhileRunning) setStatus(t("generator.clearedRunning"));
  };

  const syncSharedFieldsForMode = (nextAdvanced: boolean) => {
    if (nextAdvanced) {
      const primaryGenre = genres[0];
      if (primaryGenre && primaryGenre !== CUSTOM && ADVANCED_STYLES.includes(primaryGenre)) {
        setShowStyleTags(true);
      }

      const primaryMood = moods[0];
      if (primaryMood && primaryMood !== CUSTOM && ADVANCED_MOOD_VALUES.includes(primaryMood)) {
        setShowMoodTags(true);
      }
      return;
    }

    const selectedGenres = genres.filter((value) => value !== CUSTOM);
    const mergedGenreText = mergeValues(selectedGenres, customGenre).join(", ");
    if (customGenre.trim() || selectedGenres.length > 1) {
      setCustomGenre(mergedGenreText);
      setGenres([CUSTOM]);
    } else if (selectedGenres.length === 1) {
      const onlyGenre = selectedGenres[0]!;
      if (GENRE_OPTIONS.includes(onlyGenre)) {
        setGenres([onlyGenre]);
      } else {
        setCustomGenre(onlyGenre);
        setGenres([CUSTOM]);
      }
    }

    const selectedMoods = moods.filter((value) => value !== CUSTOM);
    const mergedMoodText = mergeValues(selectedMoods, customMood).join(", ");
    if (customMood.trim() || selectedMoods.length > 1) {
      setCustomMood(mergedMoodText);
      setMoods([CUSTOM]);
    } else if (selectedMoods.length === 1) {
      const onlyMood = selectedMoods[0]!;
      if (MOOD_OPTIONS.includes(onlyMood)) {
        setMoods([onlyMood]);
      } else {
        setCustomMood(onlyMood);
        setMoods([CUSTOM]);
      }
    }
  };

  const changeGeneratorMode = (mode: "basic" | "advanced" | "revision") => {
    setRequiredValidationAttempted(false);
    if (mode === "revision") {
      setRevisionMode(true);
      setAdvanced(true);
      setResult(null);
      setRevisionMeta(null);
      setQuality(null);
      void navigate({
        to: "/generate",
        search: {
          mode: "revision",
          project: revisionProjectId || undefined,
          base: revisionBasePromptId || undefined,
        },
        replace: true,
      });
      return;
    }

    const nextAdvanced = mode === "advanced";
    syncSharedFieldsForMode(nextAdvanced);
    setRevisionMode(false);
    setAdvanced(nextAdvanced);
    setRevisionProjectId("");
    setRevisionBasePromptId("");
    setRevisionRequest("");
    setRevisionMeta(null);
    void navigate({ to: "/generate", search: {}, replace: true });
  };

  const confirmRevisionSwitch = () =>
    !revisionRequest.trim() || window.confirm(t("generator.revisionSwitchConfirm"));

  const changeRevisionProject = (projectId: string) => {
    if (!confirmRevisionSwitch()) return;
    setRevisionProjectId(projectId);
    setRevisionBasePromptId("");
    setRevisionRequest("");
    setRevisionMeta(null);
    setResult(null);
    setQuality(null);
    void navigate({
      to: "/generate",
      search: { mode: "revision", project: projectId || undefined, base: undefined },
      replace: true,
    });
  };

  const changeRevisionBase = (basePromptId: string) => {
    if (!confirmRevisionSwitch()) return;
    setRevisionBasePromptId(basePromptId);
    setRevisionRequest("");
    setRevisionMeta(null);
    setResult(null);
    setQuality(null);
    void navigate({
      to: "/generate",
      search: {
        mode: "revision",
        project: revisionProjectId || undefined,
        base: basePromptId || undefined,
      },
      replace: true,
    });
  };

  const openLyricsWorkspace = () => {
    if (!lyricsWorkspaceFeature.allowed || !result) return;
    if (revisionMeta) {
      void navigate({
        to: "/generate",
        search: {
          workspace: "lyrics",
          project: revisionMeta.projectId,
          base: revisionMeta.savedPromptId,
        },
      });
      return;
    }
    setWorkspaceFreshOpen(true);
  };

  const savedWorkspacePrompt = workspaceBase.data?.prompt;
  const savedWorkspaceSnapshot = (savedWorkspacePrompt?.generator_input_snapshot ??
    null) as GeneratorInputSnapshot | null;
  const savedWorkspaceSong: LyricsWorkspaceSong | null = savedWorkspacePrompt
    ? {
        title: savedWorkspacePrompt.title ?? "",
        tags: savedWorkspacePrompt.tags ?? "",
        note: savedWorkspacePrompt.note ?? "",
        lyrics: savedWorkspacePrompt.lyrics ?? "",
        theme: savedWorkspacePrompt.theme ?? "",
        genre: savedWorkspacePrompt.genre ?? "",
        mood: savedWorkspacePrompt.mood ?? "",
        language: savedWorkspacePrompt.language ?? "",
        targetPlatform: savedWorkspaceSnapshot?.targetPlatform ?? DEFAULT_AI_TARGET_PLATFORM,
        generatorInputSnapshot: savedWorkspaceSnapshot,
      }
    : null;

  const freshWorkspaceSong: LyricsWorkspaceSong | null = result
    ? {
        title: result.title,
        tags: result.tags,
        note: result.note,
        lyrics: result.lyrics,
        theme: songContext?.theme ?? theme.trim(),
        genre: songContext?.genre ?? effectiveGenre,
        mood: songContext?.mood ?? effectiveMood,
        language: songContext?.language ?? effectiveLanguage,
        targetPlatform: songContextTargetPlatform ?? targetPlatform,
        generatorInputSnapshot: songContext?.inputSnapshot ?? currentSnapshot,
      }
    : null;

  const closeSavedWorkspace = (
    editedLyrics: string,
    savedVersion?: { id: string; versionNumber: number } | null,
  ) => {
    if (!savedWorkspacePrompt) return;
    setResult({
      title: savedWorkspacePrompt.title ?? "",
      tags: savedWorkspacePrompt.tags ?? "",
      lyrics: editedLyrics,
      note: savedWorkspacePrompt.note ?? "",
    });
    setWorkspaceResultSaved(true);
    setSaved(true);
    setQuality(null);
    setQualityCheckResultModel(null);
    setRevisionMeta(null);
    setSongContext({
      targetPlatform: savedWorkspaceSnapshot?.targetPlatform ?? DEFAULT_AI_TARGET_PLATFORM,
      theme: savedWorkspacePrompt.theme ?? "",
      genre: savedWorkspacePrompt.genre ?? "",
      mood: savedWorkspacePrompt.mood ?? "",
      language: savedWorkspacePrompt.language ?? "",
      structure: savedWorkspaceSnapshot?.songStructure.join(" → ") ?? "",
      songBlueprint: savedWorkspaceSnapshot?.songBlueprint ?? [],
      production: savedWorkspaceSnapshot?.productionStyle ?? "",
      instructions: savedWorkspaceSnapshot?.additionalInstructions ?? "",
      operation: "generate",
      promptVersion: "v1",
      revision: null,
      inputSnapshot: savedWorkspaceSnapshot,
    });
    if (savedVersion) {
      setStatus(t("lyricsWorkspace.savedAsVersion", { version: savedVersion.versionNumber }));
    }
    void navigate({ to: "/generate", search: {}, replace: true });
  };

  const closeFreshWorkspace = (editedLyrics: string) => {
    if (result) setResult({ ...result, lyrics: editedLyrics });
    setWorkspaceFreshOpen(false);
    setQuality(null);
    setQualityCheckResultModel(null);
  };

  if (search.workspace === "lyrics") {
    if (!lyricsWorkspaceFeature.allowed) {
      return (
        <AppShell
          header={
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <span className="font-display text-lg font-bold">AI Prompt Studio</span>
            </div>
          }
        >
          <div className="px-4 py-6 md:px-8">
            <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 p-5 text-sm text-muted-foreground">
              {t("lyricsWorkspace.featureUnavailable")}
            </div>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell
        header={
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="font-display text-lg font-bold">AI Prompt Studio</span>
          </div>
        }
      >
        <div className="px-4 py-6 pb-[180px] md:px-8 md:pb-[120px]">
          <div className="mx-auto max-w-4xl">
            {workspaceBase.isLoading && (
              <p className="text-sm text-muted-foreground">{t("lyricsWorkspace.loading")}</p>
            )}
            {workspaceBase.error && <p className="text-sm text-red-400">{t("root.errorBody")}</p>}
            {savedWorkspaceSong && (
              <LyricsWorkspace
                song={savedWorkspaceSong}
                projectId={search.project ?? null}
                projectName={workspaceBase.data?.project?.name ?? null}
                basePromptId={search.base ?? null}
                baseVersionNumber={savedWorkspacePrompt?.version_number ?? null}
                onClose={closeSavedWorkspace}
              />
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  if (workspaceFreshOpen && freshWorkspaceSong && lyricsWorkspaceFeature.allowed) {
    return (
      <AppShell
        header={
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="font-display text-lg font-bold">AI Prompt Studio</span>
          </div>
        }
      >
        <div className="px-4 py-6 pb-[180px] md:px-8 md:pb-[120px]">
          <div className="mx-auto max-w-4xl">
            <LyricsWorkspace
              song={freshWorkspaceSong}
              onClose={(lyrics) => closeFreshWorkspace(lyrics)}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const styleLabel = (value: string) =>
    translatedOption(advanced ? ADVANCED_MUSIC_STYLES : BASIC_MUSIC_STYLES, value, t);
  const moodLabel = (value: string) =>
    translatedOption(advanced ? ADVANCED_MOODS : BASIC_MOODS, value, t);
  const instrumentLabel = (value: string) => translatedOption(INSTRUMENT_OPTIONS, value, t);
  const structureLabel = (value: string) => translatedOption(SONG_STRUCTURE_TAGS, value, t);

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
        <div
          data-testid="generator-stacked-layout"
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "48rem",
            minWidth: 0,
            marginInline: "auto",
          }}
          className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 [&>*]:w-full [&>*]:min-w-0"
        >
          {/* Keep mode navigation above mode-specific panels to prevent layout jumps. */}
          <div
            className="glass-strong rounded-3xl p-3 sm:p-4"
            data-testid="generator-mode-navigation"
          >
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t("generator.mode")}
            >
              {[
                { key: "basic" as const, label: t("generator.basic") },
                { key: "advanced" as const, label: t("generator.advanced") },
                { key: "revision" as const, label: t("generator.revision") },
              ].map((mode) => {
                const active =
                  mode.key === "revision"
                    ? revisionMode
                    : !revisionMode && advanced === (mode.key === "advanced");
                return (
                  <button
                    key={mode.key}
                    type="button"
                    data-generator-mode={mode.key}
                    aria-pressed={active}
                    onClick={() => changeGeneratorMode(mode.key)}
                    className={
                      active
                        ? "whitespace-nowrap rounded-full border border-transparent bg-gradient-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground glow-neon sm:px-4"
                        : "whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent sm:px-4"
                    }
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
          {advanced && !revisionMode && (
            <MusicInspirationPanel
              key={`music-inspiration:${user?.id ?? "anon"}`}
              setup={
                (inspirationSetupRef.current = {
                  targetPlatform,
                  theme,
                  selectedMusicStyles: genres.filter((value) => value !== CUSTOM),
                  customMusicStyle: customGenre,
                  selectedMoods: moods.filter((value) => value !== CUSTOM),
                  customMood,
                  selectedInstruments: instruments.filter((value) => value !== CUSTOM),
                  customInstruments,
                  bpmMode: bpm,
                  customBpm,
                  songStructure: structure,
                  songBlueprint,
                  productionStyle: production,
                  additionalInstructions: instructions,
                  language,
                  languageVariant,
                  customLanguage,
                  smartPresetId: activeSmartPresetId,
                  culturalStyleId: presetCulturalStyleId,
                })
              }
              readGenerator={() => {
                const base = inspirationSetupRef.current!;
                const v = musicTracker.current.values;
                return {
                  versions: { ...musicTracker.current.versions },
                  setup: {
                    ...base,
                    selectedMusicStyles: (v["genres"] as string[]).filter(
                      (value) => value !== CUSTOM,
                    ),
                    customMusicStyle: v["customGenre"] as string,
                    selectedMoods: (v["moods"] as string[]).filter((value) => value !== CUSTOM),
                    customMood: v["customMood"] as string,
                    selectedInstruments: (v["instruments"] as string[]).filter(
                      (value) => value !== CUSTOM,
                    ),
                    customInstruments: v["customInstruments"] as string,
                    songStructure: v["structure"] as string[],
                    songBlueprint: v["songBlueprint"] as SongBlueprintSection[],
                    bpmMode: v["bpm"] as string,
                    customBpm: v["customBpm"] as string,
                    productionStyle: v["production"] as string,
                    additionalInstructions: v["instructions"] as string,
                  },
                };
              }}
              onApply={(next, expected, read) => {
                if (!sameGeneratorFrame(expected, read())) return false;
                inspirationSetupRef.current = next;
                // Commit only groups whose exact projected values changed. This also preserves
                // UI-only Custom sentinels in untouched groups and their edit epochs.
                const changed = (field: InspirationApplyField) =>
                  inspirationOwnedKeys[field].some(
                    (key) => JSON.stringify(expected.setup[key]) !== JSON.stringify(next[key]),
                  );
                if (changed("selectedMusicStyles")) {
                  setGenres(next.selectedMusicStyles);
                  setCustomGenre(next.customMusicStyle);
                }
                if (changed("selectedMoods")) {
                  setMoods(next.selectedMoods);
                  setCustomMood(next.customMood);
                }
                if (changed("selectedInstruments")) {
                  setInstruments(next.selectedInstruments);
                  setCustomInstruments(next.customInstruments);
                }
                if (changed("bpm")) {
                  setBpm(next.bpmMode);
                  setCustomBpm(next.customBpm);
                }
                if (changed("arrangement")) {
                  setStructure(next.songStructure);
                  setSongBlueprint(next.songBlueprint);
                }
                if (changed("productionStyle")) setProduction(next.productionStyle);
                if (changed("additionalInstructions")) setInstructions(next.additionalInstructions);
                return true;
              }}
            />
          )}
          {!freshSession && !revisionMode && (
            <AtlasGeneratorBridge
              key={user?.id}
              layer={atlasOwnerIdRef.current === user?.id ? atlasInstructions : null}
              onLayerChange={setAtlasInstructions}
              onApplied={() => setAdvanced(true)}
            />
          )}
          {atlasImportNotice && (
            <p role="status" className="my-3 text-sm text-amber-200">
              {appLanguage === "el"
                ? "Οι ενιαίες ή ασαφείς οδηγίες θεωρούνται χειροκίνητες. Δεν θα αφαιρεθεί κείμενο βάσει ομοιότητας με Atlas."
                : "Plain or ambiguous instructions are treated as manual. No text will be removed by matching Atlas wording."}
            </p>
          )}
          {atlasRecoveryText && (
            <section className="my-3 border border-amber-300 p-3">
              <p>
                {appLanguage === "el"
                  ? "Κείμενο με ασαφή προέλευση διατηρήθηκε για έλεγχο:"
                  : "Text with ambiguous provenance was retained for review:"}
              </p>
              <textarea
                readOnly
                aria-label="Unattributed Atlas recovery text"
                value={atlasRecoveryText}
              />
              <button
                type="button"
                onClick={() => {
                  setInstructions((current) =>
                    current ? current + "\n\n" + atlasRecoveryText : atlasRecoveryText,
                  );
                  setAtlasRecoveryText("");
                }}
              >
                {appLanguage === "el"
                  ? "Διατήρηση ως χειροκίνητες οδηγίες"
                  : "Keep as manual instructions"}
              </button>
            </section>
          )}
          <div
            data-testid="generator-settings-panel"
            className="glass-strong space-y-4 rounded-3xl p-5 sm:p-6"
          >
            <div>
              <FieldLabel>{t("generator.targetPlatform")}</FieldLabel>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("generator.targetPlatformHint")}
              </p>
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label={t("generator.targetPlatform")}
              >
                {AI_TARGET_PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={targetPlatform === platform}
                    onClick={() => setTargetPlatform(platform)}
                    className={
                      targetPlatform === platform
                        ? "rounded-full border border-transparent bg-gradient-neon px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-neon"
                        : "rounded-full border border-white/10 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                    }
                  >
                    {AI_TARGET_PLATFORM_LABEL[platform]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {(advanced && !revisionMode) || (canClear && !revisionMode) ? (
                <div className="flex flex-wrap items-center gap-2">
                  {advanced && !revisionMode && songSetupFeature.allowed && (
                    <button
                      type="button"
                      onClick={() => setSongSetupAssistantOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("generator.songSetupAssistant")}
                    </button>
                  )}
                  {advanced && !revisionMode && (
                    <>
                      {(["import", "export"] as const).map((kind) => (
                        <div
                          key={kind}
                          ref={(element) => {
                            setupMenuRefs.current[kind] = element;
                          }}
                          className="relative"
                        >
                          <button
                            type="button"
                            aria-expanded={setupMenuOpen === kind}
                            onClick={() =>
                              setSetupMenuOpen((current) => (current === kind ? null : kind))
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            {kind === "import" ? (
                              <Upload className="h-3.5 w-3.5" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            {kind === "import"
                              ? appLanguage === "el"
                                ? "Εισαγωγή"
                                : "Import"
                              : appLanguage === "el"
                                ? "Εξαγωγή"
                                : "Export"}
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {setupMenuOpen === kind && (
                            <div className="absolute left-0 top-full z-30 mt-1 min-w-36 rounded-lg border border-white/15 bg-[#17171d] p-1 shadow-xl">
                              {(["JSON", "MD"] as const).map((format) => (
                                <button
                                  key={format}
                                  type="button"
                                  disabled={kind === "export" && format === "MD" && !result}
                                  onClick={() => {
                                    setSetupMenuOpen(null);
                                    if (kind === "import") {
                                      if (format === "JSON") setupFileInputRef.current?.click();
                                      else mdFileInputRef.current?.click();
                                    } else if (format === "JSON") exportAdvancedSetup();
                                    else exportGeneratorBenchmark();
                                  }}
                                  className="block w-full rounded-md px-3 py-2 text-left text-xs text-foreground hover:bg-white/10 disabled:opacity-40"
                                >
                                  {kind === "import"
                                    ? appLanguage === "el"
                                      ? "Εισαγωγή"
                                      : "Import"
                                    : appLanguage === "el"
                                      ? "Εξαγωγή"
                                      : "Export"}{" "}
                                  {format}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <input
                        ref={mdFileInputRef}
                        type="file"
                        accept=".md,text/markdown,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          void onSongMarkdownSelected(file);
                        }}
                      />
                      <input
                        ref={setupFileInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          void onSetupFileSelected(file);
                        }}
                      />
                    </>
                  )}
                  {canClear && !revisionMode && (
                    <button
                      onClick={() => setConfirmClear(true)}
                      disabled={busy || checking}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("generator.clear")}
                    </button>
                  )}
                  {setupIoError && advanced && !revisionMode && (
                    <p role="alert" className="w-full text-xs text-red-400">
                      {setupIoError}
                    </p>
                  )}
                </div>
              ) : null}
              {pendingSetupImport &&
                createPortal(
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="setup-import-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onClick={() => setPendingSetupImport(null)}
                  >
                    <div
                      className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#0e0e12] p-6 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3
                        id="setup-import-title"
                        className="text-base font-semibold text-foreground"
                      >
                        {setupIoText.import}
                      </h3>
                      <p className="text-xs text-muted-foreground">{setupIoText.confirmBody}</p>
                      <div className="flex flex-row items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingSetupImport(null)}
                          className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
                        >
                          {setupIoText.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={confirmSetupImport}
                          className="rounded-xl bg-gradient-neon px-4 py-2 text-xs font-semibold text-primary-foreground glow-neon"
                        >
                          {setupIoText.confirm}
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
            </div>

            {advanced && !revisionMode && moderation.isSuperAdmin && (
              <div className="rounded-xl border border-accent/25 bg-accent/[0.035] p-3">
                <label
                  htmlFor="generator-prompt-version"
                  className="mb-2 block text-xs font-semibold text-accent"
                >
                  Generator Prompt Version · Super Admin
                </label>
                <select
                  id="generator-prompt-version"
                  className={fieldClass}
                  value={promptVersion}
                  disabled={busy || Boolean(jobId)}
                  onChange={(event) =>
                    setPromptVersion(
                      event.target.value === "v5_beta_1"
                        ? "v5_beta_1"
                        : event.target.value === "v4_beta"
                          ? "v4_beta"
                          : event.target.value === "v3"
                            ? "v3"
                            : event.target.value === "v2"
                              ? "v2"
                              : "v1",
                    )
                  }
                >
                  <option value="v1">Prompt Version 1 — Original</option>
                  <option value="v2">Prompt Version 2 — Blueprint Optimized</option>
                  <option value="v3">Prompt Version 3 — Adaptive Singability (Experimental)</option>
                  <option value="v4_beta">Prompt Version 4 BETA — Unified Master (R3.1)</option>
                  <option value="v5_beta_1">Prompt Version 5 BETA 1 — Creative Master</option>
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {appLanguage === "el"
                    ? "Οι V1–V4 παραμένουν αμετάβλητες. Η V5 BETA 1 είναι ερευνητικός υποψήφιος Creative Master, όχι αποδεδειγμένα ανώτερο prompt. Μόνο για Super Admin."
                    : "V1–V4 remain unchanged. V5 BETA 1 is a Creative Master research candidate, not a proven superior prompt. Super Admin only."}
                </p>
              </div>
            )}
            {revisionMode && (
              <div className="space-y-4 rounded-2xl border border-accent/30 bg-accent/[0.04] p-4">
                <div>
                  <h2 className="font-display text-base font-bold text-accent">
                    {t("generator.revision")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("generator.revisionBaseHint")}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium">{t("generator.revisionProject")}</span>
                    <select
                      value={revisionProjectId}
                      onChange={(e) => changeRevisionProject(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">{t("generator.revisionSelectProject")}</option>
                      {(promptProjects.data?.projects ?? []).map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-medium">{t("generator.revisionVersion")}</span>
                    <select
                      value={revisionBasePromptId}
                      onChange={(e) => changeRevisionBase(e.target.value)}
                      disabled={!revisionProjectId || revisionVersions.isLoading}
                      className={fieldClass}
                    >
                      <option value="">{t("generator.revisionSelectVersion")}</option>
                      {(revisionVersions.data?.prompts ?? []).map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>
                          {prompt.version_number ? `V${prompt.version_number}` : "—"}
                          {prompt.version_label
                            ? ` — ${prompt.version_label}`
                            : prompt.custom_name
                              ? ` — ${prompt.custom_name}`
                              : prompt.title
                                ? ` — ${prompt.title}`
                                : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {revisionProjectId &&
                  !revisionVersions.isLoading &&
                  (revisionVersions.data?.prompts.length ?? 0) === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("generator.revisionNoVersions")}
                    </p>
                  )}
                {revisionBase.isLoading && (
                  <p className="text-xs text-muted-foreground">{t("generator.revisionLoading")}</p>
                )}
                {revisionBase.data?.prompt && (
                  <>
                    {!revisionBase.data.prompt.generator_input_snapshot && (
                      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
                        {t("generator.revisionLegacySnapshot")}
                      </p>
                    )}
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {t("generator.revisionBase")}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {revisionBase.data.prompt.title ||
                          revisionBase.data.prompt.custom_name ||
                          t("library.untitledPrompt")}
                      </p>
                      {revisionBase.data.prompt.tags && (
                        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {revisionBase.data.prompt.tags}
                        </pre>
                      )}
                      {revisionBase.data.prompt.lyrics && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-muted-foreground">
                          {revisionBase.data.prompt.lyrics}
                        </pre>
                      )}
                      {revisionBase.data.prompt.note && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {revisionBase.data.prompt.note}
                        </p>
                      )}
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-foreground">
                        {t("generator.revisionRequest")}
                      </span>
                      <textarea
                        value={revisionRequest}
                        onChange={(e) => setRevisionRequest(e.target.value.slice(0, 3000))}
                        rows={4}
                        placeholder={t("generator.revisionRequestPlaceholder")}
                        className="w-full rounded-xl border border-accent/30 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
                      />
                      <p className="text-right text-[11px] text-muted-foreground">
                        {revisionRequest.length}/3000
                      </p>
                    </label>
                  </>
                )}
              </div>
            )}

            {advanced && (
              <SmartPresetsPanel
                activePresetId={activeSmartPresetId}
                culturalStyleId={presetCulturalStyleId}
                onCulturalStyleChange={setPresetCulturalStyleId}
                onApply={applySmartPreset}
                initiallyOpen={search.presets === "open"}
              />
            )}

            <div ref={themeRequiredRef}>
              {advanced ? (
                <SectionHeader title={t("generator.theme")} onClear={() => setTheme("")} />
              ) : (
                <FieldLabel>{t("generator.theme")}</FieldLabel>
              )}
              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                maxLength={hasAdminInputBypass ? undefined : themeLimit}
                rows={3}
                placeholder={t("generator.themePlaceholder")}
                aria-label={t("generator.theme")}
                className={`w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]${requiredControlClass("theme")}`}
              />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">
                {theme.length}/{themeLimit}
              </p>
            </div>

            <div ref={musicStyleRequiredRef}>
              {!advanced && <FieldLabel>{t("generator.musicStyle")}</FieldLabel>}
              {advanced ? (
                <>
                  <SectionHeader
                    title={t("generator.musicStyle")}
                    hint={t("generator.pickMany")}
                    optionsOpen={showStyleTags}
                    onToggleOptions={() => setShowStyleTags((value) => !value)}
                    onClear={() => {
                      setGenres([]);
                      setCustomGenre("");
                    }}
                  />
                  {showStyleTags && (
                    <ChipGroup
                      label={t("generator.musicStyle")}
                      options={ADVANCED_STYLES.filter((style) => style !== CUSTOM)}
                      selected={genres}
                      onToggle={toggleValue(setGenres)}
                      labelFor={styleLabel}
                    />
                  )}
                </>
              ) : (
                <select
                  value={genres[0] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    pickPrimary(setGenres)(value);
                    if (value !== CUSTOM) setCustomGenre("");
                  }}
                  aria-label={t("generator.musicStyle")}
                  className={
                    fieldClass + (genres[0] !== CUSTOM ? requiredControlClass("musicStyle") : "")
                  }
                >
                  <option value="" disabled className="bg-[#0a0a0c]">
                    {t("generator.selectMusicStyle")}
                  </option>
                  {GENRE_OPTIONS.map((genre) => (
                    <option key={genre} value={genre} className="bg-[#0a0a0c]">
                      {genre === CUSTOM
                        ? t("generator.option.custom")
                        : translatedOption(BASIC_MUSIC_STYLES, genre, t)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {(advanced || customGenreSelected || customGenre.trim().length > 0) && (
              <div>
                <input
                  value={customGenre}
                  onChange={(e) => setCustomGenre(e.target.value)}
                  placeholder={t("generator.customStylePlaceholder")}
                  aria-label={`${t("common.custom")} ${t("generator.musicStyle")}`}
                  maxLength={advanced && !hasAdminInputBypass ? musicStyleLimit : undefined}
                  className={
                    (advanced ? fieldClass + " mt-2" : fieldClass) +
                    requiredControlClass("musicStyle")
                  }
                />
                {advanced && (
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    {baseGenre.length}/{musicStyleLimit}
                  </p>
                )}
              </div>
            )}

            {advanced ? (
              <>
                <div ref={moodRequiredRef}>
                  <SectionHeader
                    title={t("generator.mood")}
                    hint={t("generator.pickMany")}
                    optionsOpen={showMoodTags}
                    onToggleOptions={() => setShowMoodTags((value) => !value)}
                    onClear={() => {
                      setMoods([]);
                      setCustomMood("");
                    }}
                  />
                  {showMoodTags && (
                    <ChipGroup
                      label={t("generator.mood")}
                      options={ADVANCED_MOOD_VALUES}
                      selected={moods}
                      onToggle={toggleValue(setMoods)}
                      labelFor={moodLabel}
                    />
                  )}
                  <input
                    value={customMood}
                    onChange={(e) => setCustomMood(e.target.value)}
                    placeholder={t("generator.customMoodPlaceholder")}
                    aria-label={`${t("common.custom")} ${t("generator.mood")}`}
                    maxLength={hasAdminInputBypass ? undefined : 120}
                    className={fieldClass + " mt-2" + requiredControlClass("mood")}
                  />
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    {effectiveMood.length}/120
                  </p>
                </div>
                <div>
                  <SectionHeader
                    title={t("generator.instruments")}
                    hint={t("generator.pickMany")}
                    optionsOpen={showInstrumentTags}
                    onToggleOptions={() => setShowInstrumentTags((value) => !value)}
                    onClear={() => {
                      setInstruments([]);
                      setCustomInstruments("");
                    }}
                  />
                  {showInstrumentTags && (
                    <ChipGroup
                      label={t("generator.instruments")}
                      options={INSTRUMENTS}
                      selected={instruments}
                      onToggle={toggleValue(setInstruments)}
                      labelFor={instrumentLabel}
                    />
                  )}
                  <input
                    value={customInstruments}
                    onChange={(e) => setCustomInstruments(e.target.value)}
                    placeholder={t("generator.customInstrumentsPlaceholder")}
                    aria-label={`${t("common.custom")} ${t("generator.instruments")}`}
                    maxLength={hasAdminInputBypass ? undefined : 200}
                    className={fieldClass + " mt-2"}
                  />
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    {instrumentsText.length}/200
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <SectionHeader
                      title={t("generator.bpm")}
                      hint={t("generator.chooseOne")}
                      onClear={() => {
                        setBpm("Auto");
                        setCustomBpm("");
                      }}
                    />
                    <select
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value)}
                      aria-label={t("generator.bpm")}
                      className={fieldClass}
                    >
                      {BPM_OPTIONS.map((item) => (
                        <option key={item} value={item} className="bg-[#0a0a0c]">
                          {item === "Auto"
                            ? t("generator.option.auto")
                            : item === "Custom"
                              ? t("common.custom")
                              : item}
                        </option>
                      ))}
                    </select>
                  </div>
                  {bpm === "Custom" && (
                    <div>
                      <FieldLabel>{t("generator.customBpm")}</FieldLabel>
                      <input
                        type="number"
                        min={40}
                        max={260}
                        value={customBpm}
                        onChange={(e) => setCustomBpm(e.target.value)}
                        placeholder={t("generator.customBpmPlaceholder")}
                        aria-label={t("generator.customBpm")}
                        className={fieldClass}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-white/5 border-l-2 border-l-accent bg-white/[0.02] px-2.5 py-1">
                    <button
                      type="button"
                      onClick={() => setShowStructureTags((value) => !value)}
                      aria-expanded={showStructureTags}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-accent transition-transform ${showStructureTags ? "" : "-rotate-90"}`}
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
                        {t("generator.songStructure")}
                      </span>
                      <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
                        · {t("generator.structureHint")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowArrangementAdvanced((value) => !value)}
                      aria-expanded={showArrangementAdvanced}
                      className={
                        showArrangementAdvanced ||
                        arrangement.some(
                          (section) => section.instruction.trim() || section.energy != null,
                        )
                          ? "shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/10"
                          : "shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                      }
                    >
                      {t("generator.arrangement.advanced")}
                    </button>
                    {structure.length > 0 && (
                      <button
                        type="button"
                        onClick={clearStructure}
                        aria-label={`${t("generator.clear")} ${t("generator.songStructure")}`}
                        title={`${t("generator.clear")} ${t("generator.songStructure")}`}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-red-300"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {showStructureTags && (
                    <div className="mb-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      {arrangement.length > 0 && (
                        <div
                          role="list"
                          aria-label={t("generator.songStructure")}
                          className="flex flex-wrap gap-2"
                        >
                          {arrangement.map((section) => {
                            const sameTypeCount = arrangement.filter(
                              (item) => item.sectionType === section.sectionType,
                            ).length;
                            const label =
                              sameTypeCount > 1
                                ? `${structureLabel(section.sectionType)} ${section.occurrence}`
                                : structureLabel(section.sectionType);
                            return (
                              <span
                                key={section.sectionId}
                                role="listitem"
                                className="inline-flex min-h-7 items-center gap-0.5 rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-medium leading-none text-accent shadow-[0_0_6px_color-mix(in_oklab,var(--accent)_10%,transparent)]"
                              >
                                <span>{label}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSimpleStructureSection(section.sectionId)}
                                  aria-label={t("generator.removeStructure", {
                                    name: label,
                                    position: section.structureIndex + 1,
                                  })}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none text-accent/70 transition-colors hover:bg-accent/10 hover:text-accent"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div
                        role="group"
                        aria-label={t("generator.songStructure")}
                        className="flex flex-wrap gap-2"
                      >
                        {STRUCTURE_TAGS.map((sectionType) => (
                          <button
                            key={sectionType}
                            type="button"
                            onClick={() => addSimpleStructureSection(sectionType)}
                            disabled={structure.length >= 40}
                            className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-35"
                          >
                            {structureLabel(sectionType)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showArrangementAdvanced && (
                    <VisualSongArrangement
                      sections={arrangement}
                      availableSectionTypes={STRUCTURE_TAGS}
                      labelForSection={structureLabel}
                      onChange={commitArrangement}
                      advancedView={
                        <SongBlueprintEditor
                          sections={arrangement}
                          onChange={commitArrangement}
                          labelForSection={structureLabel}
                        />
                      }
                    />
                  )}
                </div>
                <div>
                  <SectionHeader
                    title={t("generator.productionStyle")}
                    hint={t("common.optional")}
                    onClear={() => setProduction("")}
                  />
                  <textarea
                    value={production}
                    onChange={(e) => setProduction(e.target.value)}
                    rows={3}
                    placeholder={t("generator.productionPlaceholder")}
                    aria-label={t("generator.productionStyle")}
                    className={fieldClass + " h-auto resize-y py-3"}
                  />
                </div>
                <div>
                  <SectionHeader
                    title={t("generator.additionalInstructions")}
                    hint={t("common.optional")}
                    onClear={() => setInstructions("")}
                  />
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                    placeholder={t("generator.additionalInstructionsPlaceholder")}
                    aria-label={t("generator.additionalInstructions")}
                    className={fieldClass + " h-auto resize-y py-3"}
                  />
                </div>
                <div ref={languageRequiredRef}>
                  <SectionHeader
                    title={t("generator.language")}
                    onClear={() => {
                      setLanguage("");
                      setLanguageVariant("");
                      setCustomLanguage("");
                    }}
                  />
                  <LanguagePicker
                    value={language}
                    onChange={(value) => {
                      setLanguage(value);
                      setLanguageVariant("");
                      if (value !== CUSTOM) setCustomLanguage("");
                    }}
                    ariaLabel={t("generator.language")}
                    className={language !== CUSTOM ? requiredPickerClass("language") : ""}
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div ref={moodRequiredRef} className="space-y-3">
                  <select
                    value={moods[0] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      pickPrimary(setMoods)(value);
                      if (value !== CUSTOM) setCustomMood("");
                    }}
                    aria-label={t("generator.mood")}
                    className={
                      fieldClass + (moods[0] !== CUSTOM ? requiredControlClass("mood") : "")
                    }
                  >
                    <option value="" disabled className="bg-[#0a0a0c]">
                      {t("generator.selectMood")}
                    </option>
                    {MOOD_OPTIONS.map((item) => (
                      <option key={item} value={item} className="bg-[#0a0a0c]">
                        {item === CUSTOM
                          ? t("generator.option.custom")
                          : translatedOption(BASIC_MOODS, item, t)}
                      </option>
                    ))}
                  </select>
                  {(moods[0] === CUSTOM || customMood.trim().length > 0) && (
                    <input
                      value={customMood}
                      onChange={(e) => setCustomMood(e.target.value)}
                      placeholder={t("generator.customMoodPlaceholder")}
                      aria-label={`${t("common.custom")} ${t("generator.mood")}`}
                      className={fieldClass + requiredControlClass("mood")}
                    />
                  )}
                </div>
                <div ref={languageRequiredRef}>
                  <LanguagePicker
                    value={language}
                    onChange={(value) => {
                      setLanguage(value);
                      setLanguageVariant("");
                      if (value !== CUSTOM) setCustomLanguage("");
                    }}
                    ariaLabel={t("generator.language")}
                    className={language !== CUSTOM ? requiredPickerClass("language") : ""}
                  />
                </div>
              </div>
            )}

            {language === CUSTOM && (
              <input
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                placeholder={t("generator.customLanguagePlaceholder")}
                aria-label={`${t("common.custom")} ${t("generator.language")}`}
                className={fieldClass + requiredControlClass("language")}
              />
            )}
            {language !== CUSTOM && getSongLanguageVariants(language).length > 0 && (
              <LanguageVariantPicker
                language={language}
                value={languageVariant}
                onChange={setLanguageVariant}
              />
            )}
            {validationError && <p className="text-xs text-red-400">{validationError}</p>}
            {revisionMode &&
              revisionBasePromptId &&
              revisionBase.data?.prompt &&
              !revisionRequest.trim() && (
                <p className="text-xs text-red-400">{t("generator.revisionRequestRequired")}</p>
              )}
            {requiredValidationAttempted && !revisionMode && missingRequiredFields.length > 0 && (
              <div
                role="alert"
                className="rounded-2xl border border-accent/35 bg-accent/[0.06] p-4 shadow-[0_0_20px_color-mix(in_oklab,var(--accent)_12%,transparent)]"
              >
                <p className="text-sm font-semibold text-foreground">
                  {appLanguage === "el"
                    ? "Συμπλήρωσε τα απαραίτητα πεδία πριν τη δημιουργία."
                    : "Complete the required fields before generating."}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {missingRequiredFields.map((field) => (
                    <li key={field.key}>• {field.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 pt-1">
              {showGenerationModelSelector ? (
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("generator.generateWith")}</span>
                  <select
                    aria-label={t("generator.aiModel")}
                    value={generationModel}
                    onChange={(e) => {
                      setGenerationModel(e.target.value);
                      setGenerationModelChosen(true);
                    }}
                    className="max-w-[15rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-foreground"
                  >
                    {generationAvailableModels.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#0a0a0c]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : modelAccessLoading ? (
                <p className="text-xs text-muted-foreground">{t("generator.loadingModels")}</p>
              ) : generationModelAccessUnavailable ? (
                <p className="text-xs text-red-400">{t("generator.noModel")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("generator.generationModel", { model: registryModelLabel(generationModel) })}
                </p>
              )}
              {!revisionMode && (
                <div className="mb-3 rounded-2xl border border-accent/20 bg-accent/[0.04] p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={storyDriven}
                      onChange={(event) => setStoryDriven(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {t("generator.storyDrivenLyrics")}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("generator.storyDrivenLyricsDescription")}
                      </span>
                    </span>
                  </label>
                </div>
              )}
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {busy ? (
                  <button
                    type="button"
                    onClick={() => setConfirmStop(true)}
                    disabled={!jobId || stoppingGeneration || stopRequested}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/50 bg-orange-600/20 px-5 py-3 text-sm font-semibold text-orange-200 transition-colors hover:bg-orange-600/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {stoppingGeneration || stopRequested ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {appLanguage === "el"
                      ? stopRequested
                        ? "Διακοπή σε εξέλιξη..."
                        : "Διακοπή"
                      : stopRequested
                        ? "Stopping..."
                        : "Stop"}
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateClick}
                    disabled={generationActionDisabled}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale sm:w-auto ${
                      ready
                        ? "glow-neon"
                        : "opacity-75 saturate-75 shadow-[0_0_14px_color-mix(in_oklab,var(--accent)_16%,transparent)]"
                    }`}
                  >
                    <Wand2 className="h-4 w-4" /> {t("generator.generate")}
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {blocked
                    ? t("generator.tryAgainMinutes", { minutes: minutesLeft })
                    : t("generator.generationsRemaining", { remaining, limit: HOURLY_LIMIT })}
                </span>
              </div>
            </div>

            {confirmStop &&
              jobId &&
              createPortal(
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stop-generation-title"
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                  onClick={() => !stoppingGeneration && setConfirmStop(false)}
                >
                  <div
                    className="w-full max-w-sm space-y-4 rounded-2xl border border-orange-500/30 bg-[#0e0e12] p-6 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3
                      id="stop-generation-title"
                      className="text-base font-semibold text-foreground"
                    >
                      {appLanguage === "el" ? "Επιβεβαίωση διακοπής" : "Confirm cancellation"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {appLanguage === "el"
                        ? "Θέλεις να διακόψεις τη δημιουργία του τραγουδιού;"
                        : "Do you want to stop generating this song?"}
                    </p>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={stoppingGeneration}
                        onClick={() => setConfirmStop(false)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs text-foreground"
                      >
                        {appLanguage === "el" ? "Άκυρο" : "Back"}
                      </button>
                      <button
                        type="button"
                        disabled={stoppingGeneration}
                        onClick={() => void stopGeneration()}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {appLanguage === "el" ? "Επιβεβαίωση διακοπής" : "Confirm stop"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
            {confirmClear &&
              createPortal(
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="clear-title"
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                  onClick={() => setConfirmClear(false)}
                >
                  <div
                    className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#0e0e12] p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <h3 id="clear-title" className="text-base font-semibold text-foreground">
                        {t("generator.clearTitle")}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("generator.clearBody")}
                      </p>
                    </div>
                    {clearError && (
                      <p role="alert" className="text-xs text-red-400">
                        {clearError}
                      </p>
                    )}
                    <div className="flex flex-row items-center justify-end gap-3">
                      <button
                        onClick={() => setConfirmClear(false)}
                        disabled={clearing}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        onClick={clearAll}
                        disabled={clearing}
                        className="rounded-xl bg-red-500/80 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500"
                      >
                        {clearing ? t("generator.clearing") : t("generator.confirmClear")}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
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
              {generationResultModel && (
                <p className="text-xs text-muted-foreground">
                  {t("generator.generatedWith", {
                    model: registryModelLabel(generationResultModel),
                  })}
                </p>
              )}
              {revisionMeta && (
                <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3 text-xs">
                  <p className="font-semibold text-accent">
                    {t("generator.revisionCreated", { version: revisionMeta.versionNumber })}
                  </p>
                  <p className="mt-1 text-muted-foreground">{t("generator.revisionAutoSaved")}</p>
                  {revisionMeta.projectId && (
                    <Link
                      to="/library"
                      search={{ tab: "prompts", project: revisionMeta.projectId }}
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent/35 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {appLanguage === "el" ? "Επιστροφή στο Project" : "Return to Project"}
                    </Link>
                  )}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={toggleAll}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                >
                  {allOpen ? t("generator.collapseAll") : t("generator.expandAll")}
                </button>
              </div>
              <ResultSection
                title={t("generator.result.songTitle")}
                value={result.title}
                open={open.title}
                onToggle={() => setOpen((p) => ({ ...p, title: !p.title }))}
                onChange={(v) => setResult({ ...result, title: v })}
                rows={2}
              />
              <ResultSection
                title={resultTagsLabel}
                value={result.tags}
                open={open.tags}
                onToggle={() => setOpen((p) => ({ ...p, tags: !p.tags }))}
                onChange={(v) => setResult({ ...result, tags: v })}
                rows={4}
              />
              <ResultSection
                title={t("generator.result.lyricsStructure")}
                value={result.lyrics}
                open={open.lyrics}
                onToggle={() => setOpen((p) => ({ ...p, lyrics: !p.lyrics }))}
                onChange={(v) => setResult({ ...result, lyrics: v })}
                rows={18}
              />
              {lyricsWorkspaceFeature.allowed && (
                <button
                  type="button"
                  onClick={openLyricsWorkspace}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("lyricsWorkspace.open")}
                </button>
              )}
              <ResultSection
                title={t("generator.result.producerNote")}
                value={result.note}
                open={open.note}
                onToggle={() => setOpen((p) => ({ ...p, note: !p.note }))}
                onChange={(v) => setResult({ ...result, note: v })}
                rows={5}
              />
              {!revisionMeta && !workspaceResultSaved && (
                <button
                  onClick={openSaveDialog}
                  disabled={saved}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
                >
                  {saved ? <Check className="h-4 w-4 text-accent" /> : <Save className="h-4 w-4" />}
                  {saved ? t("generator.savedLibrary") : t("generator.saveLibrary")}
                </button>
              )}
              <QualityPanel
                quality={quality}
                checking={checking}
                onCheck={runCheck}
                onStop={() => void stopQualityCheck()}
                stopAvailable={!!qualityActionId}
                stopRequested={qualityStopRequested}
                checkError={checkError}
                confirm={confirm}
                setConfirm={setConfirm}
                state={applyState}
                qualityCheckModel={qualityCheckModel}
                qualityCheckVersion={qualityCheckVersion}
                isSuperAdmin={moderation.isSuperAdmin}
                onQualityCheckVersionChange={setQualityCheckVersion}
                availableModels={qualityAvailableModels}
                modelAccessLoading={modelAccessLoading}
                modelAccessReady={modelAccessReady}
                modelAccessUnavailable={qualityModelAccessUnavailable}
                onQualityCheckModelChange={(model) => {
                  setQualityCheckModel(model);
                  setQualityCheckModelChosen(true);
                }}
                qualityCheckResultModel={qualityCheckResultModel}
                showQualityCheckModelSelector={showQualityCheckModelSelector}
                featureAvailable={qualityFeature.allowed}
              />
            </div>
          )}
        </div>
      </div>

      {saveDialogOpen &&
        result &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
            onClick={() => !savingLibrary && setSaveDialogOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0f] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-bold">
                {appLanguage === "el" ? "Αποθήκευση Prompt" : "Save Prompt"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {appLanguage === "el"
                  ? "Το project είναι προαιρετικό. Αν επιλεγεί, ο αριθμός έκδοσης δίνεται αυτόματα."
                  : "Project is optional. When selected, the next version number is assigned automatically."}
              </p>
              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-xs font-medium">
                    {appLanguage === "el" ? "Όνομα Prompt" : "Prompt Name"}
                  </span>
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value.slice(0, 200))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-medium">
                    {appLanguage === "el" ? "Αποθήκευση σε" : "Save to"}
                  </span>
                  <select
                    value={saveProjectId}
                    onChange={(e) => {
                      setSaveProjectId(e.target.value);
                      if (e.target.value) setSaveNewProject("");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm"
                  >
                    <option value="">
                      {appLanguage === "el" ? "Χωρίς Project" : "No Project"}
                    </option>
                    {(promptProjects.data?.projects ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-medium">
                    {appLanguage === "el" ? "Ή νέο Project" : "Or create project"}
                  </span>
                  <input
                    value={saveNewProject}
                    onChange={(e) => {
                      setSaveNewProject(e.target.value.slice(0, 120));
                      if (e.target.value) setSaveProjectId("");
                    }}
                    placeholder={appLanguage === "el" ? "Νέο όνομα project…" : "New project name…"}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                  />
                </label>
                {!saveProjectId && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">
                          {appLanguage === "el" ? "Φάκελος αποθήκευσης" : "Save folder"}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {saveFolderPath ||
                            (appLanguage === "el" ? "Αρχική / χωρίς φάκελο" : "Root / no folder")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSaveFolderPickerOpen(true)}
                        className="shrink-0 rounded-lg border border-accent/30 px-3 py-2 text-xs font-semibold text-accent"
                      >
                        {appLanguage === "el" ? "Επιλογή" : "Choose"}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {saveNewProject.trim()
                        ? appLanguage === "el"
                          ? "Το νέο Project θα δημιουργηθεί σε αυτόν τον φάκελο."
                          : "The new Project will be created in this folder."
                        : appLanguage === "el"
                          ? "Το standalone Prompt θα αποθηκευτεί σε αυτόν τον φάκελο."
                          : "The standalone Prompt will be saved in this folder."}
                    </p>
                  </div>
                )}
                {(saveProjectId || saveNewProject.trim()) && (
                  <label className="block space-y-2">
                    <span className="text-xs font-medium">
                      {appLanguage === "el"
                        ? "Ετικέτα έκδοσης (προαιρετικό)"
                        : "Version label (optional)"}
                    </span>
                    <input
                      value={saveVersionLabel}
                      onChange={(e) => setSaveVersionLabel(e.target.value.slice(0, 120))}
                      placeholder={appLanguage === "el" ? "π.χ. More Guitar" : "e.g. More Guitar"}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                    />
                  </label>
                )}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  disabled={savingLibrary}
                  onClick={() => setSaveDialogOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground"
                >
                  {appLanguage === "el" ? "Ακύρωση" : "Cancel"}
                </button>
                <button
                  disabled={savingLibrary}
                  onClick={save}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {savingLibrary && <Loader2 className="h-4 w-4 animate-spin" />}
                  {appLanguage === "el" ? "Αποθήκευση" : "Save"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <LibraryFolderPicker
        open={saveFolderPickerOpen}
        language={appLanguage}
        title={appLanguage === "el" ? "Επιλογή φακέλου αποθήκευσης" : "Choose save folder"}
        confirmLabel={appLanguage === "el" ? "Επιλογή" : "Choose"}
        initialFolderId={saveFolderId}
        onClose={() => setSaveFolderPickerOpen(false)}
        onSelect={(folderId, path) => {
          setSaveFolderId(folderId);
          setSaveFolderPath(path);
          setSaveFolderPickerOpen(false);
        }}
      />

      {songSetupFeature.allowed && (
        <SongSetupAssistantModal
          open={songSetupAssistantOpen}
          onOpenChange={(nextOpen) => {
            setSongSetupAssistantOpen(nextOpen);
            if (!nextOpen) setSongSetupPrefill(null);
          }}
          targetPlatform={targetPlatform}
          onApply={applySongSetup}
          prefillDescription={songSetupPrefill?.description ?? null}
          prefillSourceLabel={songSetupPrefill?.sourceLabel ?? null}
          prefillKey={songSetupPrefill?.key ?? null}
        />
      )}
    </AppShell>
  );
}
