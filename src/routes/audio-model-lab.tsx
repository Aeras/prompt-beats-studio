import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, Check, ClipboardCopy, Loader2, ShieldAlert, Upload } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  analyzeAudioWithLabModel,
  AUDIO_MODEL_LAB_MAX_FILE_BYTES,
  AUDIO_MODEL_LAB_MODELS,
  getAudioModelLabAccess,
  type AudioModelLabModelId,
} from "@/lib/audio-model-lab.functions";

export const Route = createFileRoute("/audio-model-lab")({
  head: () => ({
    meta: [
      { title: "AI Music Analyzer Lab — PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AudioModelLabPage,
});

type LabResult = {
  model: AudioModelLabModelId;
  label: string;
  provider: string;
  providerModelId: string;
  text: string;
  durationMs: number;
};

type LabState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: LabResult }
  | { status: "error"; error: string };

const ACCEPTED_AUDIO = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,audio/*";

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected audio file."));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) return reject(new Error("Could not prepare the audio file."));
      resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatResult(result: LabResult, fileName: string) {
  return [
    `MODEL: ${result.label}`,
    `PROVIDER: ${result.provider}`,
    `PROVIDER MODEL ID: ${result.providerModelId}`,
    `FILE: ${fileName}`,
    `DURATION: ${(result.durationMs / 1000).toFixed(1)}s`,
    "",
    result.text,
  ].join("\n");
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function AudioModelLabPage() {
  const { user, loading } = useAuth();
  const access = useQuery({
    queryKey: ["audio-model-lab-access", user?.id],
    queryFn: () => getAudioModelLabAccess(),
    enabled: Boolean(user),
    retry: false,
  });

  const [file, setFile] = useState<File | null>(null);
  const [activeModel, setActiveModel] = useState<AudioModelLabModelId>("gemini-3.8-flash");
  const [states, setStates] = useState<Record<AudioModelLabModelId, LabState>>({
    "gemini-3.8-flash": { status: "idle" },
    "gemini-3.1-pro-preview": { status: "idle" },
    "qwen-3.8-omni-flash": { status: "idle" },
  });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileError = useMemo(() => {
    if (!file) return null;
    if (file.size > AUDIO_MODEL_LAB_MAX_FILE_BYTES) {
      return `Το αρχείο είναι πολύ μεγάλο. Μέγιστο μέγεθος: ${Math.floor(AUDIO_MODEL_LAB_MAX_FILE_BYTES / 1024 / 1024)} MB.`;
    }
    return null;
  }, [file]);

  const anyRunning = Object.values(states).some((state) => state.status === "running");
  const completed = AUDIO_MODEL_LAB_MODELS.flatMap((model) => {
    const state = states[model.id];
    return state.status === "done" ? [state.result] : [];
  });

  const runModel = async (model: AudioModelLabModelId, audioBase64?: string) => {
    if (!file || fileError) return;
    setStates((current) => ({ ...current, [model]: { status: "running" } }));
    setActiveModel(model);
    try {
      const prepared = audioBase64 ?? (await readFileBase64(file));
      const result = (await analyzeAudioWithLabModel({
        data: {
          model,
          fileName: file.name,
          mimeType: file.type || "audio/mpeg",
          audioBase64: prepared,
        },
      })) as LabResult;
      setStates((current) => ({ ...current, [model]: { status: "done", result } }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Η ανάλυση απέτυχε.";
      setStates((current) => ({ ...current, [model]: { status: "error", error: message } }));
      return null;
    }
  };

  const runAll = async () => {
    if (!file || fileError || anyRunning) return;
    setGlobalError(null);
    setCopyFeedback(null);
    try {
      const audioBase64 = await readFileBase64(file);
      for (const model of AUDIO_MODEL_LAB_MODELS) {
        await runModel(model.id, audioBase64);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Δεν ήταν δυνατή η προετοιμασία του αρχείου.");
    }
  };

  const copyOne = async (model: AudioModelLabModelId) => {
    if (!file) return;
    const state = states[model];
    if (state.status !== "done") return;
    await copyText(formatResult(state.result, file.name));
    setCopyFeedback(model);
    window.setTimeout(() => setCopyFeedback((value) => (value === model ? null : value)), 1600);
  };

  const copyAll = async () => {
    if (!file || !completed.length) return;
    const text = completed
      .map((result) => formatResult(result, file.name))
      .join("\n\n============================================================\n\n");
    await copyText(text);
    setCopyFeedback("all");
    window.setTimeout(() => setCopyFeedback((value) => (value === "all" ? null : value)), 1600);
  };

  const header = (
    <div className="flex items-center gap-2">
      <AudioLines className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">AI Music Analyzer Lab</span>
      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        Admin only
      </span>
    </div>
  );

  if (loading) {
    return (
      <AppShell header={header}>
        <main className="p-8 text-sm text-muted-foreground">Φόρτωση…</main>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8">
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Απαιτείται σύνδεση.</p>
            <Link to="/auth" className="mt-4 inline-flex rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold">
              Σύνδεση
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  if (access.isLoading) {
    return (
      <AppShell header={header}>
        <main className="p-8 text-sm text-muted-foreground">Έλεγχος πρόσβασης…</main>
      </AppShell>
    );
  }

  if (access.isError) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8">
          <div className="glass rounded-2xl border border-red-400/20 p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-red-300" />
            <h1 className="mt-3 font-display text-lg font-bold">Admin access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">Η προσωρινή σελίδα είναι διαθέσιμη μόνο σε διαχειριστές.</p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1500px] px-4 pb-28 pt-6 md:px-8">
        <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="glass h-fit rounded-2xl p-5">
            <h1 className="font-display text-xl font-bold">Direct model benchmark</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ίδιο audio και ίδιο prompt. Χωρίς RunPod, Demucs, Essentia, MERT, Qdrant, Stage A/B ή Final Judge.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center hover:border-accent/50">
              <Upload className="h-7 w-7 text-accent" />
              <span className="mt-2 text-sm font-semibold">{file ? file.name : "Επιλογή τραγουδιού"}</span>
              <span className="mt-1 text-xs text-muted-foreground">MP3, WAV, M4A, AAC, OGG, FLAC · έως 14 MB</span>
              <input
                type="file"
                className="hidden"
                accept={ACCEPTED_AUDIO}
                disabled={anyRunning}
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  setGlobalError(null);
                  setStates({
                    "gemini-3.8-flash": { status: "idle" },
                    "gemini-3.1-pro-preview": { status: "idle" },
                    "qwen-3.8-omni-flash": { status: "idle" },
                  });
                }}
              />
            </label>

            {fileError ? <p className="mt-3 text-sm text-red-300">{fileError}</p> : null}
            {globalError ? <p className="mt-3 text-sm text-red-300">{globalError}</p> : null}

            <button
              type="button"
              onClick={() => void runAll()}
              disabled={!file || Boolean(fileError) || anyRunning}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {anyRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
              {anyRunning ? "Ανάλυση σε εξέλιξη…" : "Ανάλυση με όλα τα μοντέλα"}
            </button>

            <div className="mt-4 grid gap-2">
              {AUDIO_MODEL_LAB_MODELS.map((model) => {
                const state = states[model.id];
                return (
                  <button
                    type="button"
                    key={model.id}
                    onClick={() => void runModel(model.id)}
                    disabled={!file || Boolean(fileError) || anyRunning}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm disabled:opacity-50"
                  >
                    <span>{model.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {state.status === "running" ? "Τρέχει…" : state.status === "done" ? "Έτοιμο" : state.status === "error" ? "Σφάλμα" : "Μόνο αυτό"}
                    </span>
                  </button>
                );
              })}
            </div>

            {completed.length ? (
              <button
                type="button"
                onClick={() => void copyAll()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent"
              >
                {copyFeedback === "all" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copyFeedback === "all" ? "Αντιγράφηκαν" : "Αντιγραφή όλων των αποτελεσμάτων"}
              </button>
            ) : null}
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {AUDIO_MODEL_LAB_MODELS.map((model) => {
                const state = states[model.id];
                return (
                  <button
                    type="button"
                    key={model.id}
                    onClick={() => setActiveModel(model.id)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      activeModel === model.id
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-white/10 bg-black/20 text-muted-foreground"
                    }`}
                  >
                    {model.label}
                    {state.status === "running" ? " · …" : state.status === "done" ? " · ✓" : state.status === "error" ? " · !" : ""}
                  </button>
                );
              })}
            </div>

            {AUDIO_MODEL_LAB_MODELS.map((model) => {
              if (model.id !== activeModel) return null;
              const state = states[model.id];
              return (
                <div key={model.id} className="glass rounded-2xl p-5 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-bold">{model.label}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {model.provider === "dashscope" ? "Alibaba Cloud Model Studio" : "Google Gemini"}
                      </p>
                    </div>
                    {state.status === "done" ? (
                      <button
                        type="button"
                        onClick={() => void copyOne(model.id)}
                        className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent"
                      >
                        {copyFeedback === model.id ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                        {copyFeedback === model.id ? "Αντιγράφηκε" : "Αντιγραφή ανάλυσης"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-5 min-h-[420px] rounded-xl border border-white/10 bg-black/20 p-4">
                    {state.status === "idle" ? (
                      <p className="text-sm text-muted-foreground">Δεν υπάρχει ακόμη αποτέλεσμα για αυτό το μοντέλο.</p>
                    ) : state.status === "running" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Το μοντέλο αναλύει απευθείας το audio…
                      </div>
                    ) : state.status === "error" ? (
                      <div>
                        <p className="text-sm font-semibold text-red-300">Η ανάλυση απέτυχε.</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{state.error}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-white/10 px-2 py-1">{state.result.provider}</span>
                          <span className="rounded-full border border-white/10 px-2 py-1">{(state.result.durationMs / 1000).toFixed(1)}s</span>
                        </div>
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">{state.result.text}</pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </main>
    </AppShell>
  );
}