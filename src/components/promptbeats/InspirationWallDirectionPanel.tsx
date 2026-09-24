import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BrainCircuit, Link2, Loader2, Music2, Sparkles, Unlink } from "lucide-react";

import {
  linkInspirationWallTrack,
  unlinkInspirationWallTrack,
  updateInspirationWall,
} from "@/lib/inspiration-wall.functions";
import {
  extractInspirationWallCreativeDirection,
  listInspirationWallConnectionOptions,
} from "@/lib/inspiration-wall-ai.functions";
import type {
  InspirationWallCreativeDirection,
  InspirationWallRecord,
  InspirationWallTrackLinkRecord,
} from "@/lib/inspiration-wall.shared";
import { cn } from "@/lib/utils";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAiModelSelection } from "@/hooks/useAiModelSelection";
import { supportsPromptBeatsVisionInput } from "@/lib/ai-model-capabilities.shared";
import { INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY } from "@/lib/inspiration-wall-song-setup.shared";
import {
  completeAuxiliaryRequest,
  getAuxiliaryRequestKey,
} from "@/lib/auxiliary-request-key";

type Props = {
  wall: InspirationWallRecord;
  trackLinks: InspirationWallTrackLinkRecord[];
  language: "en" | "el";
  onRefresh: () => Promise<void>;
};

type ConnectionProject = {
  id: string;
  name: string;
};

type ConnectionTrack = {
  id: string;
  title: string;
  coverUrl: string | null;
  isPublished: boolean;
  durationSeconds: number | null;
};

type FieldKey = keyof InspirationWallCreativeDirection;

const FIELD_META: Array<{
  key: FieldKey;
  en: string;
  el: string;
  array: boolean;
}> = [
  { key: "coreTheme", en: "Core Theme", el: "Κεντρικό Θέμα", array: false },
  { key: "moodPalette", en: "Emotional / Mood Palette", el: "Συναισθηματική Παλέτα", array: true },
  { key: "visualLanguage", en: "Visual Language", el: "Οπτική Γλώσσα", array: true },
  {
    key: "narrativeAngle",
    en: "Possible Narrative Angle",
    el: "Πιθανή Αφηγηματική Κατεύθυνση",
    array: false,
  },
  { key: "musicalCharacter", en: "Musical Character", el: "Μουσικός Χαρακτήρας", array: false },
  { key: "productionTexture", en: "Production Texture", el: "Υφή Παραγωγής", array: false },
  { key: "vocalPersonality", en: "Vocal Personality", el: "Φωνητική Προσωπικότητα", array: false },
  {
    key: "lyricalKeywords",
    en: "Lyrical Keywords / Motifs",
    el: "Λυρικές Λέξεις / Μοτίβα",
    array: true,
  },
  { key: "thingsToAvoid", en: "Things to Avoid", el: "Τι να Αποφευχθεί", array: true },
  {
    key: "contradictions",
    en: "Contradictions / Tensions",
    el: "Αντιφάσεις / Εντάσεις",
    array: true,
  },
  {
    key: "openQuestions",
    en: "Open Questions / Uncertainties",
    el: "Ανοιχτά Ερωτήματα / Αβεβαιότητες",
    array: true,
  },
];

function valueToText(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "string" ? value : "";
}

function textToValue(text: string, isArray: boolean) {
  if (!isArray) return text.trim();
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectApprovedDirection(
  direction: InspirationWallCreativeDirection,
  kept: Record<FieldKey, boolean>,
) {
  const approved: InspirationWallCreativeDirection = {};
  for (const field of FIELD_META) {
    if (!kept[field.key]) continue;
    const value = direction[field.key];
    if (Array.isArray(value)) {
      const clean = value.map((item) => item.trim()).filter(Boolean);
      if (clean.length) (approved as Record<string, unknown>)[field.key] = clean;
    } else if (typeof value === "string" && value.trim()) {
      (approved as Record<string, unknown>)[field.key] = value.trim();
    }
  }
  return approved;
}

export function InspirationWallDirectionPanel({ wall, trackLinks, language, onRefresh }: Props) {
  const el = language === "el";
  const navigate = useNavigate();
  const songSetupFeature = useFeatureAccess("song_setup_assistant");
  const aiModel = useAiModelSelection("aiTools", supportsPromptBeatsVisionInput);
  const [direction, setDirection] = useState<InspirationWallCreativeDirection>(
    wall.creative_direction ?? {},
  );
  const [kept, setKept] = useState<Record<FieldKey, boolean>>(
    () =>
      Object.fromEntries(
        FIELD_META.map((field) => [field.key, wall.creative_direction?.[field.key] !== undefined]),
      ) as Record<FieldKey, boolean>,
  );
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackSearch, setTrackSearch] = useState("");

  useEffect(() => {
    setDirection(wall.creative_direction ?? {});
    setKept(
      Object.fromEntries(
        FIELD_META.map((field) => [field.key, wall.creative_direction?.[field.key] !== undefined]),
      ) as Record<FieldKey, boolean>,
    );
  }, [wall.id, wall.creative_direction]);

  const options = useQuery({
    queryKey: ["inspiration-wall-connections", wall.id, trackSearch.trim()],
    queryFn: () =>
      listInspirationWallConnectionOptions({
        data: { wallId: wall.id, search: trackSearch.trim() },
      }),
  });

  const linkedIds = useMemo(() => new Set(trackLinks.map((link) => link.track_id)), [trackLinks]);

  const extract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const result = await extractInspirationWallCreativeDirection({
        data: {
          wallId: wall.id,
          model: aiModel.selectedModel,
          requestKey: getAuxiliaryRequestKey(`inspiration_wall:${wall.id}`),
        },
      });
      setDirection(result.direction);
      completeAuxiliaryRequest(`inspiration_wall:${wall.id}`);
      setKept(
        Object.fromEntries(FIELD_META.map((field) => [field.key, true])) as Record<
          FieldKey,
          boolean
        >,
      );
      setModelLabel(result.modelLabel);
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : el ? "Η εξαγωγή απέτυχε." : "Extraction failed.",
      );
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const approved = collectApprovedDirection(direction, kept);
      await updateInspirationWall({ data: { wallId: wall.id, creativeDirection: approved } });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : el ? "Η αποθήκευση απέτυχε." : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openSongSetup = async () => {
    if (!songSetupFeature.allowed || handoffBusy) return;
    setHandoffBusy(true);
    setError(null);
    try {
      const approved = collectApprovedDirection(direction, kept);
      if (Object.keys(approved).length === 0) {
        throw new Error(
          el
            ? "Κράτησε τουλάχιστον ένα πεδίο Creative Direction πριν συνεχίσεις."
            : "Keep at least one Creative Direction field before continuing.",
        );
      }
      await updateInspirationWall({ data: { wallId: wall.id, creativeDirection: approved } });
      if (typeof window === "undefined") return;
      window.sessionStorage.setItem(
        INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY,
        JSON.stringify({
          version: 1,
          wallId: wall.id,
          wallTitle: wall.title,
          connectedProjectId: wall.connected_project_id,
          direction: approved,
        }),
      );
      await navigate({ to: "/generate" });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Η μεταφορά στο Song Setup απέτυχε."
            : "Could not open Song Setup.",
      );
    } finally {
      setHandoffBusy(false);
    }
  };

  const connectProject = async (projectId: string) => {
    setConnectionBusy(true);
    setError(null);
    try {
      await updateInspirationWall({
        data: { wallId: wall.id, connectedProjectId: projectId || null },
      });
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project connection failed.");
    } finally {
      setConnectionBusy(false);
    }
  };

  const toggleTrack = async (trackId: string) => {
    setConnectionBusy(true);
    setError(null);
    try {
      if (linkedIds.has(trackId)) {
        await unlinkInspirationWallTrack({ data: { wallId: wall.id, trackId } });
      } else {
        await linkInspirationWallTrack({ data: { wallId: wall.id, trackId } });
      }
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Track connection failed.");
    } finally {
      setConnectionBusy(false);
    }
  };

  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <section
        className="glass rounded-3xl p-4 sm:p-5"
        aria-labelledby={`creative-direction-${wall.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <BrainCircuit className="h-4 w-4" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                {el ? "Creative Direction" : "Creative Direction"}
              </span>
            </div>
            <h3
              id={`creative-direction-${wall.id}`}
              className="mt-1 font-display text-lg font-bold"
            >
              {el ? "Εξαγωγή δημιουργικής κατεύθυνσης" : "Extract creative direction"}
            </h3>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {el
                ? "Η AI ενεργοποιείται μόνο όταν το ζητήσεις. Το κείμενό σου έχει πάντα προτεραιότητα από την ερμηνεία εικόνων."
                : "AI runs only when you ask. Your written direction always outranks image interpretation."}
            </p>
            {modelLabel && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {el ? "Μοντέλο" : "Model"}: {modelLabel}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {aiModel.showSelector && (
              <select
                aria-label={el ? "Μοντέλο AI" : "AI model"}
                value={aiModel.selectedModel}
                onChange={(event) => aiModel.setSelectedModel(event.target.value)}
                disabled={extracting}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
              >
                {aiModel.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void extract()}
              disabled={extracting || aiModel.unavailable || !aiModel.selectedModel}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {el ? "Extract Creative Direction" : "Extract Creative Direction"}
            </button>
          </div>
        </div>

        {aiModel.unavailable && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
            {el
              ? "Δεν υπάρχει διαθέσιμο μοντέλο με υποστήριξη εικόνας για αυτόν τον λογαριασμό."
              : "No image-capable AI model is available for this account."}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {FIELD_META.map((field) => {
            const text = valueToText(direction[field.key]);
            return (
              <div
                key={field.key}
                className={cn(
                  "rounded-2xl border p-3",
                  kept[field.key]
                    ? "border-white/10 bg-black/15"
                    : "border-white/5 bg-black/5 opacity-55",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={`${wall.id}-${field.key}`} className="text-xs font-semibold">
                    {field[language]}
                  </label>
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={kept[field.key]}
                      onChange={(event) =>
                        setKept((current) => ({ ...current, [field.key]: event.target.checked }))
                      }
                    />
                    {el ? "Κράτησέ το" : "Keep"}
                  </label>
                </div>
                <textarea
                  id={`${wall.id}-${field.key}`}
                  value={text}
                  disabled={!kept[field.key]}
                  rows={field.array ? 4 : 3}
                  onChange={(event) =>
                    setDirection((current) => ({
                      ...current,
                      [field.key]: textToValue(event.target.value, field.array),
                    }))
                  }
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent/50 disabled:cursor-not-allowed"
                  placeholder={
                    field.array ? (el ? "Ένα στοιχείο ανά γραμμή" : "One item per line") : ""
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!songSetupFeature.isLoading && !songSetupFeature.allowed && (
            <p className="mr-auto text-[10px] text-muted-foreground">
              {el
                ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
                : "Song Setup Assistant is not available for this account."}
            </p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || handoffBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Αποθήκευση Creative Direction" : "Save Creative Direction"}
          </button>
          <button
            type="button"
            onClick={() => void openSongSetup()}
            disabled={
              handoffBusy || saving || songSetupFeature.isLoading || !songSetupFeature.allowed
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {handoffBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {el ? "Χρήση στο Song Setup" : "Use in Song Setup"}
          </button>
        </div>
      </section>

      <aside className="glass rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-2 text-accent">
          <Link2 className="h-4 w-4" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            {el ? "Συνδέσεις" : "Connections"}
          </span>
        </div>

        <div className="mt-4">
          <label htmlFor={`wall-project-${wall.id}`} className="mb-1.5 block text-xs font-semibold">
            {el ? "Connected Project" : "Connected Project"}
          </label>
          <select
            id={`wall-project-${wall.id}`}
            value={wall.connected_project_id ?? ""}
            disabled={connectionBusy || options.isLoading}
            onChange={(event) => void connectProject(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-accent/50"
          >
            <option value="">{el ? "Χωρίς Project" : "No Project"}</option>
            {(options.data?.projects ?? []).map((project: ConnectionProject) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {el
              ? "Το Project είναι προαιρετικό και ξεχωριστό από τα Result Tracks."
              : "Project connection is optional and separate from Result Tracks."}
          </p>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-accent" />
            <h4 className="text-xs font-semibold">{el ? "Result Tracks" : "Result Tracks"}</h4>
          </div>
          <input
            value={trackSearch}
            onChange={(event) => setTrackSearch(event.target.value)}
            placeholder={el ? "Αναζήτηση δικών σου tracks…" : "Search your tracks…"}
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-accent/50"
          />
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {options.isLoading && (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {el ? "Φόρτωση…" : "Loading…"}
              </div>
            )}
            {(options.data?.tracks ?? []).map((track: ConnectionTrack) => {
              const linked = linkedIds.has(track.id);
              return (
                <button
                  key={track.id}
                  type="button"
                  disabled={connectionBusy}
                  onClick={() => void toggleTrack(track.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-xs",
                    linked
                      ? "border-accent/40 bg-accent/[0.08]"
                      : "border-white/10 bg-black/20 hover:border-accent/30",
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
                    {track.coverUrl ? (
                      <img
                        src={track.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Music2 className="h-4 w-4 text-accent" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{track.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {track.isPublished ? (el ? "Public" : "Public") : el ? "Private" : "Private"}
                    </span>
                  </span>
                  {linked ? (
                    <Unlink className="h-4 w-4 text-accent" />
                  ) : (
                    <Link2 className="h-4 w-4 opacity-60" />
                  )}
                </button>
              );
            })}
            {!options.isLoading && (options.data?.tracks ?? []).length === 0 && (
              <p className="p-3 text-center text-xs text-muted-foreground">
                {el
                  ? "Δεν βρέθηκαν διαθέσιμα uploaded tracks."
                  : "No eligible uploaded tracks found."}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
