import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPinned, Sparkles, Wand2 } from "lucide-react";

import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { analyzeLyricsWithStoryMap, createStoryMapFromLyrics } from "@/lib/story-map-ai.functions";
import { completeAuxiliaryRequest, getAuxiliaryRequestKey } from "@/lib/auxiliary-request-key";
import { createStoryMap } from "@/lib/story-map.functions";
import { getStoryMapIdForProject, replaceStoryMapDraft } from "@/lib/story-map-workspace.functions";
import type { StoryMapAnalysis } from "@/lib/story-map.shared";

export function StoryMapLyricsPanel({
  projectId,
  projectName,
  songTitle,
  lyrics,
  structure,
  model,
  onPrepareRewrite,
}: {
  projectId: string | null;
  projectName: string | null;
  songTitle: string;
  lyrics: string;
  structure: string;
  model: string | null;
  onPrepareRewrite: (sectionKey: string, suggestion: string) => void;
}) {
  const { language } = useI18n();
  const el = language === "el";
  const access = useFeatureAccess("story_map");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<StoryMapAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapLookup = useQuery({
    queryKey: ["story-map-for-project", projectId],
    queryFn: () => getStoryMapIdForProject({ data: { projectId: projectId! } }),
    enabled: Boolean(projectId && access.allowed),
  });
  const storyMapId = mapLookup.data?.storyMapId ?? null;

  useEffect(() => setAnalysis(null), [storyMapId, lyrics]);

  const sectionCount = useMemo(
    () =>
      structure
        .split("→")
        .map((value) => value.trim())
        .filter(Boolean).length,
    [structure],
  );

  if (!projectId || (!access.isLoading && !access.allowed)) return null;

  const createFromLyrics = async () => {
    setBusy(true);
    setError(null);
    try {
      const extracted = await createStoryMapFromLyrics({
        data: {
          requestKey: getAuxiliaryRequestKey("story_map:from-lyrics"),
          lyrics,
          songTitle,
          structure,
          model: model || null,
        },
      });
      const created = await createStoryMap({
        data: {
          title: `${projectName || songTitle || (el ? "Τραγούδι" : "Song")} — Story Map`,
          concept:
            extracted.draft.summary ||
            songTitle ||
            (el ? "Story Map από υπάρχοντες στίχους" : "Story Map from existing lyrics"),
          projectId,
        },
      });
      await replaceStoryMapDraft({
        data: { storyMapId: created.storyMap.id, draft: extracted.draft },
      });
      await queryClient.invalidateQueries({ queryKey: ["story-map-for-project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["story-maps"] });
      completeAuxiliaryRequest("story_map:from-lyrics");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Αποτυχία δημιουργίας Story Map."
            : "Could not create Story Map.",
      );
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!storyMapId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeLyricsWithStoryMap({
        data: {
          storyMapId,
          lyrics,
          structure,
          model: model || null,
          requestKey: getAuxiliaryRequestKey(`story_map:${storyMapId}:analyze-lyrics`),
        },
      });
      setAnalysis(result.analysis);
      completeAuxiliaryRequest(`story_map:${storyMapId}:analyze-lyrics`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Η ανάλυση Story Map απέτυχε."
            : "Story Map analysis failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <MapPinned className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Story Map</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {el
              ? "Έλεγχος αφηγηματικής και συναισθηματικής εξέλιξης χωρίς αυτόματη αλλαγή των στίχων."
              : "Review narrative and emotional progression without automatically changing the lyrics."}
          </p>
        </div>
        {storyMapId ? (
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={busy || lyrics.trim().length < 20}
            className="inline-flex items-center gap-2 rounded-xl border border-accent/40 px-3 py-2 text-xs font-semibold text-accent disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {el ? "Ανάλυση με Story Map" : "Analyze with Story Map"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void createFromLyrics()}
            disabled={busy || lyrics.trim().length < 20}
            className="inline-flex items-center gap-2 rounded-xl border border-accent/40 px-3 py-2 text-xs font-semibold text-accent disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {el ? "Δημιουργία Story Map από στίχους" : "Create Story Map from Lyrics"}
          </button>
        )}
      </div>

      {storyMapId && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {el
            ? `Συνδεδεμένο Story Map · ${sectionCount} ενότητες ανιχνεύτηκαν`
            : `Connected Story Map · ${sectionCount} sections detected`}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {analysis && (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed">
            {analysis.overall}
          </p>
          {analysis.observations.map((item, index) => (
            <div
              key={`${item.category}-${index}`}
              className="rounded-xl border border-white/10 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {item.sectionLabel || item.category.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs">{item.evidence}</p>
              <p className="mt-1 text-xs text-accent">{item.suggestion}</p>
            </div>
          ))}
          {analysis.sectionSuggestions.map((item, index) => (
            <div
              key={`${item.sectionKey}-${index}`}
              className="rounded-xl border border-white/10 bg-black/15 p-3"
            >
              <p className="text-xs font-semibold">{item.sectionLabel}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {el ? "Στόχος Story Map" : "Story Map goal"}: {item.storyGoal}
              </p>
              <p className="mt-2 text-xs">{item.issue}</p>
              <p className="mt-1 text-xs text-accent">{item.suggestion}</p>
              <button
                type="button"
                onClick={() => onPrepareRewrite(item.sectionKey, item.suggestion)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent/35 px-2.5 py-1.5 text-[11px] text-accent"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {el ? "Προετοιμασία στοχευμένης επανεγγραφής" : "Prepare targeted rewrite"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
