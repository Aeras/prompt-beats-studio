from pathlib import Path


def must_replace(s: str, old: str, new: str, label: str) -> str:
    if old not in s:
        raise SystemExit(f"missing anchor: {label}")
    return s.replace(old, new, 1)

# Song Universe workspace: add deliberate AI controls and saved continuity view.
p = Path('src/routes/song-universe.tsx')
s = p.read_text()
s = must_replace(
    s,
    'import { Archive, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";',
    'import { Archive, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";',
    'route icon import',
)
s = must_replace(
    s,
    'import {\n  addProjectToSongUniverse,',
    'import {\n  analyzeSongUniverseContinuity,\n  analyzeSongUniverseProjectFit,\n  generateSongUniverseCreativeBible,\n  getLatestSongUniverseContinuity,\n  refineSongUniverseCreativeBible,\n} from "@/lib/song-universe-ai.functions";\nimport {\n  addProjectToSongUniverse,',
    'route AI imports',
)
s = must_replace(
    s,
    '      <div className="glass rounded-2xl p-5">\n        <h2 className="font-display text-lg font-bold">{el ? "Τραγούδια / Projects" : "Songs / Projects"}</h2>',
    '      <UniverseAiPanel universe={universe} projects={projects} onRefresh={refresh} />\n\n      <div className="glass rounded-2xl p-5">\n        <h2 className="font-display text-lg font-bold">{el ? "Τραγούδια / Projects" : "Songs / Projects"}</h2>',
    'insert AI panel',
)
s += r'''

function UniverseAiPanel({
  universe,
  projects,
  onRefresh,
}: {
  universe: SongUniverseRecord;
  projects: Awaited<ReturnType<typeof getSongUniverse>>["projects"];
  onRefresh: () => Promise<void>;
}) {
  const { language } = useI18n();
  const el = language === "el";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [fit, setFit] = useState<{
    projectName: string;
    strongMatches: string[];
    differences: string[];
    interpretation: string;
  } | null>(null);
  const latest = useQuery({
    queryKey: ["song-universe-continuity", universe.id],
    queryFn: () => getLatestSongUniverseContinuity({ data: { universeId: universe.id } }),
  });

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const applyBible = async (creativeBible: SongUniverseRecord["creativeBible"]) => {
    await updateSongUniverse({ data: { universeId: universe.id, creativeBible } });
    await onRefresh();
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">AI Continuity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {el
              ? "Οι AI ενέργειες εκτελούνται μόνο όταν τις ζητήσεις. Δεν αλλάζουν αυτόματα Projects ή Story Maps."
              : "AI actions run only when you request them. They never automatically change Projects or Story Maps."}
          </p>
        </div>
        <button
          disabled={busy !== null || projects.length === 0}
          onClick={() =>
            void run("continuity", async () => {
              await analyzeSongUniverseContinuity({ data: { universeId: universe.id } });
              await latest.refetch();
            })
          }
          className="flex items-center gap-2 rounded-xl border border-accent/40 px-4 py-2 text-sm text-accent disabled:opacity-40"
        >
          {busy === "continuity" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {el ? "Ανάλυση συνοχής" : "Analyze Continuity"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          disabled={busy !== null}
          onClick={() =>
            void run("generate-bible", async () => {
              const result = await generateSongUniverseCreativeBible({ data: { universeId: universe.id } });
              await applyBible(result.creativeBible);
            })
          }
          className="rounded-xl border border-white/10 bg-black/20 p-3 text-left text-sm hover:border-accent/40 disabled:opacity-40"
        >
          <span className="font-medium">{el ? "Δημιουργία Creative Bible με AI" : "Generate Creative Bible with AI"}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {el ? "Χρησιμοποιεί την ιδέα/περιγραφή του Universe και αντικαθιστά το Creative Bible μετά την AI πρόταση." : "Uses the Universe idea/description and replaces the Creative Bible with the AI proposal."}
          </span>
        </button>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <input
            value={refineInstruction}
            onChange={(event) => setRefineInstruction(event.target.value)}
            placeholder={el ? "Π.χ. λιγότερο synth, περισσότερη οργανική αίσθηση…" : "e.g. less synth, more organic character…"}
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <button
            disabled={busy !== null || refineInstruction.trim().length < 3}
            onClick={() =>
              void run("refine-bible", async () => {
                const result = await refineSongUniverseCreativeBible({
                  data: { universeId: universe.id, instruction: refineInstruction },
                });
                await applyBible(result.creativeBible);
                setRefineInstruction("");
              })
            }
            className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"
          >
            {el ? "Βελτίωση Creative Bible" : "Refine Creative Bible"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">{error}</p>}

      {latest.data?.analysis && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <Insight title={el ? "Σύνοψη" : "Summary"} items={[latest.data.analysis.summary]} />
          <Insight title={el ? "Ισχυρή συνοχή" : "Strong continuity"} items={latest.data.analysis.strongContinuity} />
          <Insight title={el ? "Πιθανή επανάληψη" : "Possible repetition"} items={latest.data.analysis.possibleRepetition} />
          <Insight title={el ? "Υποχρησιμοποιημένες κατευθύνσεις" : "Underused directions"} items={latest.data.analysis.underusedDirections} />
          <Insight title={el ? "Διαφοροποίηση" : "Diversity"} items={latest.data.analysis.diversityNotes} />
          <Insight title={el ? "Δημιουργικές ευκαιρίες" : "Creative opportunities"} items={latest.data.analysis.opportunities} />
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motif Usage</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {latest.data.analysis.motifUsage.map((motif) => (
                <span key={`${motif.motif}-${motif.usage}`} title={motif.note} className="rounded-full border border-white/10 px-3 py-1 text-xs">
                  {motif.motif} · {motif.usage}
                </span>
              ))}
              {latest.data.analysis.motifUsage.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{el ? "Έλεγχος Project Fit" : "Project Fit"}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {projects.map((project) => (
              <button
                key={project.id}
                disabled={busy !== null}
                onClick={() =>
                  void run(`fit:${project.id}`, async () => {
                    const result = await analyzeSongUniverseProjectFit({
                      data: { universeId: universe.id, projectId: project.projectId },
                    });
                    setFit({ projectName: project.projectName, ...result.fit });
                  })
                }
                className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"
              >
                {busy === `fit:${project.id}` ? "…" : project.projectName}
              </button>
            ))}
          </div>
          {fit && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold">{fit.projectName}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Insight title={el ? "Ισχυρές αντιστοιχίες" : "Strong matches"} items={fit.strongMatches} />
                <Insight title={el ? "Διαφορές" : "Differences"} items={fit.differences} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{fit.interpretation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Insight({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-xs text-muted-foreground">—</div>
      ) : (
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-foreground/90">
          {items.filter(Boolean).map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}
        </ul>
      )}
    </div>
  );
}
'''
p.write_text(s)

# Generator: consume Universe handoff through the canonical Song Setup Assistant.
p = Path('src/routes/generate.tsx')
s = p.read_text()
s = must_replace(
    s,
    'import { replaceStoryMapDraft } from "@/lib/story-map-workspace.functions";\n',
    'import { replaceStoryMapDraft } from "@/lib/story-map-workspace.functions";\nimport {\n  buildSongUniverseContextText,\n  SONG_UNIVERSE_SONG_SETUP_HANDOFF_KEY,\n  songUniverseSongSetupHandoffSchema,\n  type SongUniverseSongSetupHandoff,\n} from "@/lib/song-universe.shared";\n',
    'generator universe import',
)
s = must_replace(
    s,
    '  const storyMapFeature = useFeatureAccess("story_map");\n',
    '  const storyMapFeature = useFeatureAccess("story_map");\n  const songUniverseFeature = useFeatureAccess("song_universe");\n',
    'generator feature access',
)
s = must_replace(
    s,
    '  const [storyMapHandoff, setStoryMapHandoff] = useState<StoryMapSongSetupHandoff | null>(null);\n',
    '  const [storyMapHandoff, setStoryMapHandoff] = useState<StoryMapSongSetupHandoff | null>(null);\n  const [songUniverseHandoff, setSongUniverseHandoff] = useState<SongUniverseSongSetupHandoff | null>(null);\n',
    'generator universe state',
)
anchor = '  useEffect(() => {\n    if (typeof window === "undefined") return;\n    const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);'
insert = r'''  useEffect(() => {
    if (typeof window === "undefined") return;
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

'''
s = must_replace(s, anchor, insert + anchor, 'generator universe effects')
p.write_text(s)

print('Song Universe phase 2 integrations applied')
