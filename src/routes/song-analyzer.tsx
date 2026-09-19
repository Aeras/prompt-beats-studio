import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2, Save, Send, ShieldAlert, Upload } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { createPromptProject, listPromptProjects } from "@/lib/ai.functions";
import {
  analyzeSong,
  DEFAULT_SONG_ANALYZER_MODEL,
  getSongAnalyzerAccess,
  saveSongAnalysisToProject,
  SONG_ANALYZER_MAX_FILE_BYTES,
  SONG_ANALYZER_MODELS,
  type SongAnalysisResult,
} from "@/lib/song-analyzer.functions";

const ANALYZER_HANDOFF_KEY = "pb:song-analyzer-handoff";

export const Route = createFileRoute("/song-analyzer")({
  head: () => ({
    meta: [
      { title: "AI Song Analyzer — PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SongAnalyzerPage,
});

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio file"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode audio file"));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function bpmLabel(result: SongAnalysisResult) {
  const bpm = result.generatorReady.bpm;
  if (bpm.rangeMin != null && bpm.rangeMax != null) return `${bpm.rangeMin}–${bpm.rangeMax} BPM`;
  if (bpm.approximate != null) return `≈ ${bpm.approximate} BPM`;
  return "Uncertain";
}

function SongAnalyzerPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["song-analyzer-access", user?.id],
    queryFn: () => getSongAnalyzerAccess(),
    enabled: Boolean(user),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ["song-analyzer-projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user && access.data?.allowed),
  });

  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState(DEFAULT_SONG_ANALYZER_MODEL);
  const [result, setResult] = useState<SongAnalysisResult | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [newProject, setNewProject] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fileError = useMemo(() => {
    if (!file) return null;
    if (file.size > SONG_ANALYZER_MAX_FILE_BYTES) return "The Analyzer accepts audio files up to 15 MB.";
    return null;
  }, [file]);

  const analyze = async () => {
    if (!file || fileError) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const audioBase64 = await fileToBase64(file);
      const response = await analyzeSong({
        data: {
          audioBase64,
          mimeType: file.type as any,
          model: model as any,
        },
      });
      setResult(response.result);
      setResultModel(response.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Song analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result || !resultModel) return;
    setSaving(true);
    setError(null);
    try {
      let targetProjectId = projectId;
      if (newProject.trim()) {
        const created = await createPromptProject({ data: { name: newProject.trim() } });
        targetProjectId = created.project?.id ?? "";
      }
      if (!targetProjectId) throw new Error("Choose or create a Project first.");
      await saveSongAnalysisToProject({
        data: {
          projectId: targetProjectId,
          model: resultModel as any,
          result,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["song-analyzer-projects"], exact: false });
      setSaved(true);
      setProjectId(targetProjectId);
      setNewProject("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save analysis.");
    } finally {
      setSaving(false);
    }
  };

  const sendToGenerator = () => {
    if (!result || typeof window === "undefined") return;
    window.sessionStorage.setItem(ANALYZER_HANDOFF_KEY, JSON.stringify(result.generatorReady));
    void navigate({ to: "/generate" });
  };

  const header = (
    <div className="flex items-center gap-2">
      <AudioLines className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">AI Song Analyzer</span>
      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Admin</span>
    </div>
  );

  if (loading) return <AppShell header={header}><main className="p-8 text-sm text-muted-foreground">Loading…</main></AppShell>;
  if (!user) return <AppShell header={header}><main className="mx-auto max-w-xl p-8"><div className="glass rounded-2xl p-8 text-center"><p className="text-sm text-muted-foreground">Sign in to continue.</p><Link to="/auth" className="mt-4 inline-flex rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold">Sign in</Link></div></main></AppShell>;
  if (access.isError) return <AppShell header={header}><main className="mx-auto max-w-xl p-8"><div className="glass rounded-2xl border border-red-400/20 p-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-red-300" /><h1 className="mt-3 font-display text-lg font-bold">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">The AI Song Analyzer is currently restricted to administrators and is protected server-side.</p></div></main></AppShell>;
  if (access.isLoading) return <AppShell header={header}><main className="p-8 text-sm text-muted-foreground">Checking access…</main></AppShell>;

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-6 md:px-8">
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="glass h-fit rounded-2xl p-5">
            <h1 className="font-display text-xl font-bold">Analyze a complete song</h1>
            <p className="mt-2 text-sm text-muted-foreground">The source audio is used only for this request. PromptBeats does not create a Track, add it to your Library, or save the audio to a Project.</p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center hover:border-accent/50">
              <Upload className="h-7 w-7 text-accent" />
              <span className="mt-2 text-sm font-semibold">{file ? file.name : "Choose audio file"}</span>
              <span className="mt-1 text-xs text-muted-foreground">MP3, WAV, M4A/MP4, AAC, OGG or FLAC · max 15 MB</span>
              <input
                type="file"
                className="hidden"
                accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac,audio/*"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                  setSaved(false);
                  setError(null);
                }}
              />
            </label>
            {fileError && <p className="mt-2 text-xs text-red-400">{fileError}</p>}

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Analyzer model
              <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground">
                {SONG_ANALYZER_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>

            <button onClick={analyze} disabled={!file || Boolean(fileError) || busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
              {busy ? "Analyzing audio…" : "Analyze Song"}
            </button>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          </section>

          <section className="space-y-5">
            {!result ? (
              <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">Upload a song and run the Analyzer to see generator-ready fields and detailed musical analysis.</div>
            ) : (
              <>
                <div className="glass rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="font-display text-lg font-bold text-gradient-neon">Generator-ready fields</h2><p className="text-xs text-muted-foreground">Analyzed with {SONG_ANALYZER_MODELS.find((item) => item.id === resultModel)?.label ?? resultModel}</p></div>
                    <button onClick={sendToGenerator} className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Send className="h-4 w-4" />Send to AI Generator</button>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field title="Music Style" value={result.generatorReady.musicStyle} />
                    <Field title="Mood" value={result.generatorReady.mood} />
                    <Field title="BPM" value={`${bpmLabel(result)} · confidence: ${result.generatorReady.bpm.confidence}\n${result.generatorReady.bpm.notes}`} />
                    <Field title="Song Structure" value={result.generatorReady.songStructure.join(" → ")} />
                    <Field title="Instruments" value={result.generatorReady.instruments.join("\n")} wide />
                    <Field title="Production Style" value={result.generatorReady.productionStyle} wide />
                    <Field title="Additional Instructions" value={result.generatorReady.additionalInstructions || "—"} wide />
                  </div>
                </div>

                <div className="glass rounded-2xl p-5">
                  <h2 className="font-display text-lg font-bold">Detailed Song Analysis</h2>
                  <div className="mt-5 space-y-4">
                    <Field title="Genre & Style" value={result.detailedAnalysis.genreAndStyle} wide />
                    <Field title="Mood & Emotional Arc" value={result.detailedAnalysis.moodAndEmotionalArc} wide />
                    <Field title="Tempo & Groove" value={result.detailedAnalysis.tempoAndGroove} wide />
                    <ObservationList title="Instrumentation" items={result.detailedAnalysis.instrumentation} />
                    <Field title="Arrangement" value={result.detailedAnalysis.arrangement} wide />
                    <Field title="Song Structure" value={result.detailedAnalysis.songStructure} wide />
                    <Field title="Vocals" value={result.detailedAnalysis.vocals} wide />
                    <ObservationList title="Production & Mix" items={result.detailedAnalysis.productionAndMix} />
                    <Field title="Dynamics & Energy" value={result.detailedAnalysis.dynamicsAndEnergy} wide />
                    <Field title="Notable Characteristics" value={result.detailedAnalysis.notableCharacteristics.join("\n")} wide />
                    <Field title="Confidence / Uncertainty Notes" value={result.detailedAnalysis.confidenceAndUncertaintyNotes.join("\n")} wide />
                  </div>
                </div>

                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center gap-2"><Save className="h-4 w-4 text-accent" /><h2 className="font-display text-sm font-bold">Save to Project</h2></div>
                  <p className="mt-1 text-xs text-muted-foreground">Saved as an Initial Song Analysis item, not as Prompt V0. The source audio is not saved.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground">
                      <option value="">Choose existing Project…</option>
                      {(projects.data?.projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="…or create a new Project" className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-primary/60" />
                  </div>
                  <button onClick={save} disabled={saving || (!projectId && !newProject.trim())} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent/50 px-4 py-2.5 text-sm text-accent disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saved ? "Saved to Project" : "Save Analysis"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function Field({ title, value, wide = false }: { title: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl border border-white/10 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}><p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{value}</p></div>;
}

function ObservationList({ title, items }: { title: string; items: Array<{ observation: string; confidence: "high" | "medium" | "low" }> }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{title}</p><div className="mt-2 space-y-2">{items.map((item, index) => <div key={index} className="text-sm text-foreground/90"><span className="mr-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{item.confidence}</span>{item.observation}</div>)}</div></div>;
}
