import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Edit3, Loader2, RefreshCw, Sparkles, X } from "lucide-react";

import { useAiModelSelection } from "@/hooks/useAiModelSelection";
import { useI18n } from "@/i18n";
import { completeAuxiliaryRequest, getAuxiliaryRequestKey } from "@/lib/auxiliary-request-key";
import {
  approveSongUniverseNextSongDirection,
  planNextSongUniverseDirection,
} from "@/lib/song-universe-planner.functions";
import type {
  NextSongBrief,
  SongUniversePlannerEditableField,
} from "@/lib/song-universe-planner.shared";
import { updateSongUniverse } from "@/lib/song-universe.functions";
import {
  SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY,
  type SongUniverseRecord,
} from "@/lib/song-universe.shared";

const EDITABLE_FIELDS: Array<{
  key: SongUniversePlannerEditableField;
  en: string;
  el: string;
}> = [
  { key: "themesToExplore", en: "Themes to explore", el: "Θέματα για εξερεύνηση" },
  { key: "recommendedMood", en: "Mood", el: "Διάθεση" },
  { key: "recommendedEnergy", en: "Energy", el: "Ενέργεια" },
  { key: "recommendedBpmDirection", en: "BPM direction", el: "Κατεύθυνση BPM" },
  {
    key: "recommendedStructureDirection",
    en: "Structure direction",
    el: "Κατεύθυνση δομής",
  },
  { key: "recommendedHookDirection", en: "Hook direction", el: "Κατεύθυνση hook" },
  { key: "recommendedPov", en: "Point of view", el: "Οπτική / POV" },
  {
    key: "recommendedSettingDirection",
    en: "Setting direction",
    el: "Κατεύθυνση σκηνικού",
  },
  { key: "storyProgression", en: "Story progression", el: "Εξέλιξη ιστορίας" },
  {
    key: "nextNarrativeOpportunity",
    en: "Next narrative opportunity",
    el: "Επόμενη αφηγηματική ευκαιρία",
  },
];

function lines(value: string[]) {
  return value.join("\n");
}

function parseLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listOrDash(items: string[]) {
  return items.length ? items : ["—"];
}

export function SongUniverseNextSongPlanner({
  universe,
  projects,
  onClose,
  onRefresh,
}: {
  universe: SongUniverseRecord;
  projects: Array<{ id: string; projectId: string; projectName: string; universeRole: string | null }>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { language } = useI18n();
  const el = language === "el";
  const navigate = useNavigate();
  const aiModel = useAiModelSelection("aiTools");
  const [currentSongIntent, setCurrentSongIntent] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [contrastLevel, setContrastLevel] = useState<"low" | "balanced" | "high">(
    universe.plannerContrast,
  );
  const [plannedTrackCount, setPlannedTrackCount] = useState(
    universe.plannedTrackCount?.toString() ?? "",
  );
  const [arcDirection, setArcDirection] = useState(universe.arcDirection ?? "");
  const [canonFacts, setCanonFacts] = useState(lines(universe.storyBible.canonFacts));
  const [characters, setCharacters] = useState(lines(universe.storyBible.characters));
  const [relationships, setRelationships] = useState(lines(universe.storyBible.relationships));
  const [locations, setLocations] = useState(lines(universe.storyBible.locations));
  const [worldRules, setWorldRules] = useState(lines(universe.storyBible.worldRules));
  const [recurringSymbols, setRecurringSymbols] = useState(lines(universe.storyBible.recurringSymbols));
  const [desiredEnding, setDesiredEnding] = useState(universe.storyBible.desiredEnding ?? "");
  const [storyTone, setStoryTone] = useState(universe.storyBible.tone ?? "");
  const [storyAudience, setStoryAudience] = useState(universe.storyBible.audience ?? "");
  const [busy, setBusy] = useState<"plan" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<NextSongBrief | null>(null);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [planMeta, setPlanMeta] = useState<{
    planId: string;
    historyFingerprint: string;
    plannerSchemaVersion: string;
    fallback: boolean;
    fallbackReason: {
      code: string;
      stage: string;
      message: string;
      retryCount: number;
    } | null;
    trackCount: number;
    plannedTrackCount: number | null;
    overallCompleteness: string;
    continuityFresh: boolean | null;
    modelLabel: string | null;
    duplicateRisk: {
      level: "none" | "low" | "high";
      projectTitle: string | null;
      similarity: number | null;
      reason: string;
    };
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [pinnedFields, setPinnedFields] = useState<Set<SongUniversePlannerEditableField>>(
    new Set(),
  );

  const nextPosition = projects.length;
  const isSeries = universe.universeType === "song_series";
  const roleSuggestions = useMemo(
    () =>
      isSeries
        ? ["chapter", "bridge chapter", "climax", "epilogue"]
        : ["opener", "single", "centerpiece", "interlude", "climax", "closer"],
    [isSeries],
  );

  const storyBible = () => ({
    canonFacts: parseLines(canonFacts),
    characters: parseLines(characters),
    relationships: parseLines(relationships),
    locations: parseLines(locations),
    worldRules: parseLines(worldRules),
    recurringSymbols: parseLines(recurringSymbols),
    desiredEnding: desiredEnding.trim() || null,
    tone: storyTone.trim() || null,
    audience: storyAudience.trim() || null,
  });

  const savePlanningSettings = async () => {
    const parsedCount = plannedTrackCount.trim() ? Number(plannedTrackCount) : null;
    if (
      parsedCount != null &&
      (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 200)
    ) {
      throw new Error(
        el
          ? "Ο προγραμματισμένος αριθμός tracks πρέπει να είναι 1–200."
          : "Planned track count must be 1–200.",
      );
    }
    await updateSongUniverse({
      data: {
        universeId: universe.id,
        plannedTrackCount: parsedCount,
        arcDirection: arcDirection.trim() || null,
        storyBible: storyBible(),
        plannerContrast: contrastLevel,
      },
    });
    await onRefresh();
  };

  const runPlan = async (regenerate = false) => {
    setBusy("plan");
    setError(null);
    try {
      await savePlanningSettings();
      const scope = `song_universe:${universe.id}:next-song-plan`;
      const result = await planNextSongUniverseDirection({
        data: {
          universeId: universe.id,
          currentSongIntent: currentSongIntent.trim() || null,
          targetRole: targetRole.trim() || null,
          targetPosition: nextPosition,
          contrastLevel,
          previousBrief: regenerate ? brief : null,
          pinnedFields: regenerate ? [...pinnedFields] : [],
          model: aiModel.selectedModel || null,
          requestKey: getAuxiliaryRequestKey(scope),
        },
      });
      completeAuxiliaryRequest(scope);
      setBrief(result.brief);
      setCopiedBrief(false);
      setPlanMeta({
        planId: result.planId,
        historyFingerprint: result.historyFingerprint,
        plannerSchemaVersion: result.plannerSchemaVersion,
        fallback: result.fallback,
        fallbackReason: result.fallbackReason,
        trackCount: result.trackCount,
        plannedTrackCount: result.plannedTrackCount,
        overallCompleteness: result.overallCompleteness,
        continuityFresh: result.continuityFresh,
        modelLabel: result.modelLabel,
        duplicateRisk: result.duplicateRisk,
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const approveAndUse = async () => {
    if (!brief || !planMeta) return;
    setBusy("approve");
    setError(null);
    try {
      const approved = await approveSongUniverseNextSongDirection({
        data: { universeId: universe.id, planId: planMeta.planId, brief },
      });
      const selectedItems = universe.creativeBible.items.filter((item) => item.enabled);
      const capturedAt = new Date().toISOString();
      const handoff = {
        version: 2 as const,
        universeId: universe.id,
        universeTitle: universe.title,
        universeType: universe.universeType,
        projectId: null,
        selectedItems,
        approvedNextSongBrief: brief,
        contextSnapshot: {
          universeId: universe.id,
          universeTitle: universe.title,
          capturedAt,
          selectedItemIds: selectedItems.map((item) => item.id),
          inheritedItems: selectedItems,
          universeType: universe.universeType,
          historyFingerprint: approved.historyFingerprint,
          plannerPlanId: approved.planId,
          plannerStrategyVersion: approved.strategyVersion,
          plannerSchemaVersion: approved.plannerSchemaVersion,
          approvedNextSongBrief: brief,
          plannedTrackCount:
            plannedTrackCount.trim() && Number.isFinite(Number(plannedTrackCount))
              ? Number(plannedTrackCount)
              : null,
          targetPosition: nextPosition,
          targetRole: targetRole.trim() || null,
        },
      };
      window.sessionStorage.setItem(
        SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY,
        JSON.stringify(handoff),
      );
      void navigate({ to: "/generate" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(null);
    }
  };

  const togglePin = (field: SongUniversePlannerEditableField) => {
    setPinnedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const updateBriefField = (field: SongUniversePlannerEditableField, value: string) => {
    if (!brief) return;
    if (field === "themesToExplore") {
      setBrief({ ...brief, themesToExplore: parseLines(value) });
      return;
    }
    setBrief({ ...brief, [field]: value.trim() ? value : null });
  };

  const editableValue = (field: SongUniversePlannerEditableField) => {
    if (!brief) return "";
    const value = brief[field];
    return Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
  };

  const copyListBlock = (title: string, items: string[]) =>
    `${title}\n${items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "—"}`;

  const copyTextBlock = (title: string, value: string | null | undefined) =>
    `${title}\n${value?.trim() || "—"}`;

  const copyBrief = async () => {
    if (!brief || !planMeta) return;

    const title = isSeries ? "Next Chapter Direction" : "Next Song Direction";
    const metadata = [
      `${el ? "Tracks" : "Tracks"}: ${planMeta.trackCount}${planMeta.plannedTrackCount ? ` / ${planMeta.plannedTrackCount}` : ""}`,
      `${el ? "Δεδομένα" : "Data"}: ${planMeta.overallCompleteness}`,
      planMeta.modelLabel ? `${el ? "Μοντέλο" : "Model"}: ${planMeta.modelLabel}` : null,
    ].filter((item): item is string => Boolean(item));

    const blocks = [
      title,
      metadata.join("\n"),
      copyListBlock(el ? "Διατήρησε" : "Keep", brief.identityToPreserve),
      copyListBlock(el ? "Υποχρεωτικά σεβάσου" : "Must respect", brief.mustRespect),
      copyListBlock(el ? "Εξερεύνησε" : "Explore", brief.themesToExplore),
      copyListBlock(
        el ? "Προτίμησε να μην επαναλάβεις" : "Prefer not to repeat",
        [...brief.preferNotToRepeatThemes, ...brief.preferNotToRepeatMotifs],
      ),
      ...(brief.mustAvoid.length > 0
        ? [copyListBlock(el ? "Must avoid" : "Must avoid", brief.mustAvoid)]
        : []),
      copyListBlock(el ? "Portfolio balance" : "Portfolio balance", brief.portfolioBalanceNotes),
      ...(isSeries
        ? [
            copyTextBlock(el ? "Story so far" : "Story so far", brief.narrativeState),
            copyListBlock(el ? "Μην επαναλάβεις" : "Do not repeat", brief.eventsNotToRepeat),
            copyTextBlock(el ? "Εξέλιξη" : "Story progression", brief.storyProgression),
            copyTextBlock(
              el ? "Επόμενη αφηγηματική ευκαιρία" : "Next chapter opportunity",
              brief.nextNarrativeOpportunity,
            ),
          ]
        : []),
      ...EDITABLE_FIELDS.filter(
        (item) => isSeries || !["storyProgression", "nextNarrativeOpportunity"].includes(item.key),
      ).map((item) => copyTextBlock(el ? item.el : item.en, editableValue(item.key))),
      copyListBlock(el ? "Γιατί" : "Why", brief.evidence.map((item) => item.statement)),
      copyTextBlock(el ? "Σύνοψη reasoning" : "Reasoning summary", brief.reasoningSummary),
    ];

    if (planMeta.fallback && planMeta.fallbackReason) {
      blocks.splice(
        2,
        0,
        `${el ? "Αιτία fallback" : "Fallback reason"}: ${planMeta.fallbackReason.code}\n${planMeta.fallbackReason.message}`,
      );
    }
    if (planMeta.duplicateRisk.level !== "none") {
      blocks.splice(
        2,
        0,
        `${el ? "Έλεγχος ομοιότητας" : "Similarity check"}\n${planMeta.duplicateRisk.reason}${planMeta.duplicateRisk.projectTitle ? ` — ${planMeta.duplicateRisk.projectTitle}` : ""}`,
      );
    }

    try {
      await navigator.clipboard.writeText(blocks.join("\n\n"));
      setCopiedBrief(true);
      window.setTimeout(() => setCopiedBrief(false), 1600);
    } catch {
      setError(el ? "Η αντιγραφή απέτυχε." : "Copy failed.");
    }
  };

  return (
    <div className="glass rounded-2xl border border-accent/25 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="font-display text-lg font-bold">
              {el ? "Κατεύθυνση επόμενου τραγουδιού" : "Next Song Direction"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSeries
              ? el
                ? "Συνέχισε τον κόσμο και προχώρησε την ιστορία — όχι την ίδια σκηνή ξανά."
                : "Continue the world and advance the story — do not repeat the same scene."
              : el
                ? "Διατήρησε τον καλλιτέχνη, όχι το ίδιο τραγούδι."
                : "Preserve the artist, not the same song."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground"
          aria-label={el ? "Κλείσιμο" : "Close"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {aiModel.showSelector && (
        <label className="mt-4 block max-w-sm text-xs text-muted-foreground">
          {el ? "Μοντέλο AI" : "AI model"}
          <select
            aria-label={el ? "Μοντέλο AI" : "AI model"}
            value={aiModel.selectedModel}
            onChange={(event) => aiModel.setSelectedModel(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
          >
            {aiModel.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {el ? "Τι θέλεις ειδικά από αυτό το τραγούδι;" : "Current Song Intent"}
          <textarea
            value={currentSongIntent}
            onChange={(event) => setCurrentSongIntent(event.target.value)}
            placeholder={
              el
                ? "Προαιρετικό: π.χ. πιο γρήγορο, πιο φωτεινό, νέο POV…"
                : "Optional: e.g. faster, brighter, a new POV…"
            }
            className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            {el ? "Στόχος tracks" : "Planned tracks"}
            <input
              inputMode="numeric"
              value={plannedTrackCount}
              onChange={(event) => setPlannedTrackCount(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder={el ? "π.χ. 10" : "e.g. 10"}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {el ? "Επίπεδο αντίθεσης" : "Contrast level"}
            <select
              value={contrastLevel}
              onChange={(event) =>
                setContrastLevel(event.target.value as "low" | "balanced" | "high")
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
            >
              <option value="low">{el ? "Χαμηλό" : "Low"}</option>
              <option value="balanced">{el ? "Ισορροπημένο" : "Balanced"}</option>
              <option value="high">{el ? "Υψηλό" : "High"}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">
            {el ? "Ρόλος επόμενου track" : "Target track role"}
            <input
              list={`song-universe-role-${universe.id}`}
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder={el ? "Προαιρετικό" : "Optional"}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground"
            />
            <datalist id={`song-universe-role-${universe.id}`}>
              {roleSuggestions.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </label>
        </div>
      </div>

      <label className="mt-4 block text-xs text-muted-foreground">
        {el ? "Κατεύθυνση συνολικού arc" : "Overall arc direction"}
        <textarea
          value={arcDirection}
          onChange={(event) => setArcDirection(event.target.value)}
          placeholder={
            el
              ? "Προαιρετικό: π.χ. εσωστρεφές άνοιγμα → πιο ενεργητικό κέντρο → στοχαστικό κλείσιμο"
              : "Optional: e.g. intimate opening → energetic middle → reflective close"
          }
          className="mt-1 min-h-16 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground"
        />
      </label>

      {isSeries && (
        <details className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold">
            {el ? "Story Bible / Canon" : "Story Bible / Canon"}
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <StoryLines label={el ? "Canon facts" : "Canon facts"} value={canonFacts} onChange={setCanonFacts} />
            <StoryLines label={el ? "Χαρακτήρες" : "Characters"} value={characters} onChange={setCharacters} />
            <StoryLines label={el ? "Σχέσεις" : "Relationships"} value={relationships} onChange={setRelationships} />
            <StoryLines label={el ? "Τοποθεσίες" : "Locations"} value={locations} onChange={setLocations} />
            <StoryLines label={el ? "Κανόνες κόσμου" : "World rules"} value={worldRules} onChange={setWorldRules} />
            <StoryLines label={el ? "Επαναλαμβανόμενα σύμβολα" : "Recurring symbols"} value={recurringSymbols} onChange={setRecurringSymbols} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <StoryText label={el ? "Επιθυμητό τέλος" : "Desired ending"} value={desiredEnding} onChange={setDesiredEnding} />
            <StoryText label={el ? "Τόνος" : "Tone"} value={storyTone} onChange={setStoryTone} />
            <StoryText label={el ? "Κοινό" : "Audience"} value={storyAudience} onChange={setStoryAudience} />
          </div>
        </details>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runPlan(false)}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {brief
            ? el
              ? "Νέα κατεύθυνση"
              : "New direction"
            : el
              ? "Δημιουργία κατεύθυνσης"
              : "Create direction"}
        </button>
        {brief && (
          <button
            type="button"
            onClick={() => void runPlan(true)}
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
            {el ? "Εναλλακτική κατεύθυνση" : "Alternative direction"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">
          {error}
        </p>
      )}

      {brief && planMeta && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-white/10 px-2 py-1">
              {el ? "Tracks" : "Tracks"}: {planMeta.trackCount}
              {planMeta.plannedTrackCount ? ` / ${planMeta.plannedTrackCount}` : ""}
            </span>
            <span className="rounded-full border border-white/10 px-2 py-1">
              {el ? "Δεδομένα" : "Data"}: {planMeta.overallCompleteness}
            </span>
            {planMeta.modelLabel && (
              <span className="rounded-full border border-white/10 px-2 py-1">{planMeta.modelLabel}</span>
            )}
            {planMeta.fallback && (
              <span className="rounded-full border border-amber-400/30 px-2 py-1 text-amber-200">
                Reduced Planner fallback
              </span>
            )}
          </div>

          {planMeta.fallback && planMeta.fallbackReason && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
              <div className="font-semibold">
                {el ? "Αιτία fallback" : "Fallback reason"}: {planMeta.fallbackReason.code}
              </div>
              <div className="mt-1 text-amber-100/80">{planMeta.fallbackReason.message}</div>
            </div>
          )}

          {planMeta.duplicateRisk.level !== "none" && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                planMeta.duplicateRisk.level === "high"
                  ? "border-amber-400/30 bg-amber-400/5 text-amber-100"
                  : "border-white/10 bg-black/20 text-muted-foreground"
              }`}
            >
              {el ? "Έλεγχος ομοιότητας" : "Similarity check"}: {planMeta.duplicateRisk.reason}
              {planMeta.duplicateRisk.projectTitle ? ` — ${planMeta.duplicateRisk.projectTitle}` : ""}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold">
              {isSeries
                ? el
                  ? "Next Chapter Direction"
                  : "Next Chapter Direction"
                : el
                  ? "Next Song Direction"
                  : "Next Song Direction"}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyBrief()}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
              >
                {copiedBrief ? (el ? "Αντιγράφηκε" : "Copied") : el ? "Αντιγραφή όλων" : "Copy all"}
              </button>
              <button
                type="button"
                onClick={() => setEditing((current) => !current)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs"
              >
                {editing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                {editing ? (el ? "Τέλος" : "Done") : el ? "Επεξεργασία" : "Edit"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <BriefList title={el ? "Διατήρησε" : "Keep"} items={brief.identityToPreserve} />
            <BriefList title={el ? "Υποχρεωτικά σεβάσου" : "Must respect"} items={brief.mustRespect} />
            <BriefList title={el ? "Εξερεύνησε" : "Explore"} items={brief.themesToExplore} />
            <BriefList
              title={el ? "Προτίμησε να μην επαναλάβεις" : "Prefer not to repeat"}
              items={[...brief.preferNotToRepeatThemes, ...brief.preferNotToRepeatMotifs]}
            />
            {brief.mustAvoid.length > 0 && (
              <BriefList title={el ? "Must avoid" : "Must avoid"} items={brief.mustAvoid} />
            )}
            <BriefList
              title={el ? "Portfolio balance" : "Portfolio balance"}
              items={brief.portfolioBalanceNotes}
            />
          </div>

          {isSeries && (
            <div className="grid gap-3 lg:grid-cols-2">
              <BriefText title={el ? "Story so far" : "Story so far"} value={brief.narrativeState} />
              <BriefList title={el ? "Μην επαναλάβεις" : "Do not repeat"} items={brief.eventsNotToRepeat} />
              <BriefText title={el ? "Εξέλιξη" : "Story progression"} value={brief.storyProgression} />
              <BriefText
                title={el ? "Επόμενη αφηγηματική ευκαιρία" : "Next chapter opportunity"}
                value={brief.nextNarrativeOpportunity}
              />
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {el
                ? "Κατεύθυνση που μπορείς να επεξεργαστείς / κλειδώσεις"
                : "Editable / pinnable direction"}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {EDITABLE_FIELDS.filter(
                (item) =>
                  isSeries || !["storyProgression", "nextNarrativeOpportunity"].includes(item.key),
              ).map((item) => (
                <label key={item.key} className="text-xs text-muted-foreground">
                  <span className="flex items-center justify-between gap-2">
                    <span>{el ? item.el : item.en}</span>
                    <button
                      type="button"
                      onClick={() => togglePin(item.key)}
                      className={`rounded-md border px-2 py-0.5 text-[10px] ${
                        pinnedFields.has(item.key)
                          ? "border-accent/50 text-accent"
                          : "border-white/10 text-muted-foreground"
                      }`}
                    >
                      {pinnedFields.has(item.key)
                        ? el
                          ? "Κλειδωμένο"
                          : "Pinned"
                        : el
                          ? "Κλείδωμα"
                          : "Pin"}
                    </button>
                  </span>
                  {editing ? (
                    <textarea
                      rows={item.key === "themesToExplore" || item.key === "storyProgression" ? 3 : 2}
                      value={editableValue(item.key)}
                      onChange={(event) => updateBriefField(item.key, event.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-foreground"
                    />
                  ) : (
                    <div className="mt-1 min-h-10 rounded-lg border border-white/5 bg-black/10 p-2 text-xs text-foreground/90">
                      {editableValue(item.key) || "—"}
                    </div>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <BriefList title={el ? "Γιατί" : "Why"} items={brief.evidence.map((item) => item.statement)} />
            <BriefText title={el ? "Σύνοψη reasoning" : "Reasoning summary"} value={brief.reasoningSummary} />
          </div>

          <button
            type="button"
            onClick={() => void approveAndUse()}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {el
              ? "Χρήση αυτής της κατεύθυνσης στο Song Setup"
              : "Use this direction in Song Setup"}
          </button>
        </div>
      )}
    </div>
  );
}

function StoryLines({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="One item per line"
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-foreground"
      />
    </label>
  );
}

function StoryText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <textarea
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-foreground"
      />
    </label>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed">
        {listOrDash(items).map((item, index) => (
          <li key={`${index}-${item}`}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function BriefText({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{value || "—"}</p>
    </div>
  );
}
