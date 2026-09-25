import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AudioLines,
  Check,
  Download,
  FlaskConical,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import {
  discardElevenMusic,
  downloadElevenMusic,
  generateElevenCompositionPlan,
  generateElevenMusic,
  getElevenMusicLabAccess,
} from "@/lib/eleven-music-lab.functions";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/ai-music-lab-eleven")({
  head: () => ({
    meta: [{ title: "Eleven Music Lab | PromptBeats" }, { name: "robots", content: "noindex" }],
  }),
  component: ElevenMusicLabPage,
});

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60";

type GeneratedAudio = {
  audioUrl: string;
  audioKey: string;
  mimeType: string;
  model: "music_v2_5";
  songId: string | null;
};

function ElevenMusicLabPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const el = language === "el";
  const access = useQuery({
    queryKey: ["eleven-music-lab-access"],
    queryFn: () => getElevenMusicLabAccess(),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!access.isLoading && (access.isError || access.data?.allowed !== true))
      void navigate({ to: "/", replace: true });
  }, [access.data, access.isError, access.isLoading, navigate]);

  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(180);
  const [planText, setPlanText] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedAudio | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const directRequestKey = useRef<string | null>(null);
  const planRequestKey = useRef<string | null>(null);

  const estimatedCredits = useMemo(
    () => Math.round((durationSeconds / 60) * 900),
    [durationSeconds],
  );

  const planMutation = useMutation({
    mutationFn: () => generateElevenCompositionPlan({ data: { prompt, durationSeconds } }),
    onSuccess: (result) => {
      setPlanText(JSON.stringify(result.plan, null, 2));
      setPlanError(null);
    },
  });

  const directGeneration = useMutation({
    mutationFn: () =>
      generateElevenMusic({
        data: {
          prompt,
          durationSeconds,
          previousAudioKey: generated?.audioKey ?? null,
          requestKey: (directRequestKey.current ??= crypto.randomUUID()),
        },
      }),
    onSuccess: (result) => {
      directRequestKey.current = null;
      setGenerated(result);
      setDownloadError(null);
      setDiscardError(null);
    },
  });

  const planGeneration = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(planText);
      } catch {
        throw new Error(
          el
            ? "Το Composition Plan δεν είναι έγκυρο JSON."
            : "Composition Plan is not valid JSON.",
        );
      }
      return generateElevenMusic({
        data: {
          compositionPlan: parsed as any,
          durationSeconds,
          previousAudioKey: generated?.audioKey ?? null,
          requestKey: (planRequestKey.current ??= crypto.randomUUID()),
        },
      });
    },
    onSuccess: (result) => {
      planRequestKey.current = null;
      setGenerated(result);
      setDownloadError(null);
      setDiscardError(null);
    },
  });

  const discardMutation = useMutation({
    mutationFn: (audioKey: string) => discardElevenMusic({ data: { audioKey } }),
  });
  const downloadMutation = useMutation({
    mutationFn: (audioKey: string) => downloadElevenMusic({ data: { audioKey } }),
  });

  const discardCurrent = async () => {
    if (!generated) return;
    setDiscardError(null);
    try {
      await discardMutation.mutateAsync(generated.audioKey);
      setGenerated(null);
    } catch (error) {
      setDiscardError(error instanceof Error ? error.message : "Discard failed");
    }
  };

  const downloadCurrent = async () => {
    if (!generated || typeof window === "undefined") return;
    setDownloadError(null);
    try {
      const result = await downloadMutation.mutateAsync(generated.audioKey);
      const binary = window.atob(result.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = "promptbeats-eleven-music.mp3";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed");
    }
  };

  const reset = async () => {
    if (generated) await discardCurrent();
    setPrompt("");
    setDurationSeconds(180);
    setPlanText("");
    setPlanError(null);
    setGenerated(null);
    directRequestKey.current = null;
    planRequestKey.current = null;
    directGeneration.reset();
    planGeneration.reset();
    planMutation.reset();
  };

  if (access.isLoading)
    return (
      <AppShell>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <p className="text-sm text-muted-foreground">
            {el ? "Έλεγχος πρόσβασης…" : "Checking access…"}
          </p>
        </main>
      </AppShell>
    );
  if (access.isError || access.data?.allowed !== true) return null;

  const anyGenerating = directGeneration.isPending || planGeneration.isPending;
  const generationError = directGeneration.error || planGeneration.error;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl font-bold">AI Music Lab · Eleven Music</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Music v2.5 · {el ? "μόνο Super Admin" : "Super Admin only"}
            </p>
          </div>
          <Link
            to="/ai-music-lab"
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
          >
            ← Google Lyria
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-5">
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                      <AudioLines className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="font-display text-2xl font-bold">Eleven Music</h1>
                      <p className="text-xs text-muted-foreground">
                        Music v2.5 · API experiment
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {el
                      ? "Χρησιμοποίησε το ίδιο PromptBeats prompt που δοκιμάζεις στο Suno. Μπορείς να κάνεις direct generation ή πρώτα δωρεάν Composition Plan."
                      : "Use the same PromptBeats prompt you test in Suno. Generate directly or create a free Composition Plan first."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200">
                  <FlaskConical className="h-3.5 w-3.5" />
                  {el ? "Δοκιμή" : "Test mode"}
                </span>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Prompt</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {el
                      ? "Μέχρι 4.100 χαρακτήρες, σύμφωνα με το Eleven Music API."
                      : "Up to 4,100 characters, matching the Eleven Music API."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void reset()}
                  disabled={
                    anyGenerating || planMutation.isPending || (!prompt && !planText && !generated)
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {el ? "Επαναφορά" : "Reset"}
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  directRequestKey.current = null;
                }}
                rows={14}
                maxLength={4100}
                className={`${inputClass} resize-y font-mono text-[13px]`}
                placeholder={
                  el
                    ? "Επικόλλησε εδώ το πλήρες PromptBeats prompt…"
                    : "Paste the complete PromptBeats prompt here…"
                }
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="text-xs text-muted-foreground">
                  {el ? "Διάρκεια" : "Duration"}
                  <select
                    value={durationSeconds}
                    onChange={(event) => {
                      setDurationSeconds(Number(event.target.value));
                      directRequestKey.current = null;
                    }}
                    className={`${inputClass} mt-1.5`}
                  >
                    {[30, 60, 120, 180, 240, 300].map((seconds) => (
                      <option key={seconds} value={seconds} className="bg-[#0a0a0c]">
                        {seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-muted-foreground">
                  ~{estimatedCredits.toLocaleString()} credits*
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                *{" "}
                {el
                  ? "Εκτίμηση με βάση ~900 credits/λεπτό. Το πραγματικό billing καθορίζεται από την ElevenLabs."
                  : "Estimate based on ~900 credits/minute. Actual billing is determined by ElevenLabs."}
              </p>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="font-display text-lg font-semibold">Composition Plan</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {el
                  ? "Το plan δεν καταναλώνει ElevenLabs credits. Μπορείς να επεξεργαστείς το JSON πριν δημιουργήσεις audio."
                  : "The plan does not consume ElevenLabs credits. You can edit the JSON before generating audio."}
              </p>
              <button
                type="button"
                onClick={() => planMutation.mutate()}
                disabled={!prompt.trim() || planMutation.isPending || anyGenerating}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-45"
              >
                {planMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {planMutation.isPending
                  ? el
                    ? "Δημιουργία Plan…"
                    : "Generating Plan…"
                  : "Generate Composition Plan — FREE"}
              </button>
              {planMutation.isError && (
                <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                  {planMutation.error instanceof Error
                    ? planMutation.error.message
                    : "Plan generation failed"}
                </p>
              )}
              {planError && <p className="mt-3 text-xs text-red-300">{planError}</p>}
              <textarea
                value={planText}
                onChange={(event) => {
                  setPlanText(event.target.value);
                  planRequestKey.current = null;
                  setPlanError(null);
                }}
                rows={18}
                className={`${inputClass} mt-4 resize-y font-mono text-[12px]`}
                placeholder={
                  el
                    ? "Το Composition Plan θα εμφανιστεί εδώ…"
                    : "Composition Plan will appear here…"
                }
              />
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="glass rounded-2xl p-5">
              <h2 className="font-display text-base font-semibold">
                {el ? "Δημιουργία Audio" : "Generate Audio"}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {el
                  ? "Για καθαρό A/B με Suno, χρησιμοποίησε πρώτα Direct Prompt. Το Plan mode είναι δεύτερο ξεχωριστό test."
                  : "For a clean Suno A/B test, use Direct Prompt first. Plan mode is a separate second test."}
              </p>

              <button
                type="button"
                onClick={() => directGeneration.mutate()}
                disabled={!prompt.trim() || anyGenerating || planMutation.isPending}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-45"
              >
                {directGeneration.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AudioLines className="h-4 w-4" />
                )}
                {directGeneration.isPending
                  ? el
                    ? "Δημιουργία…"
                    : "Generating…"
                  : "Generate from Prompt"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPlanError(null);
                  if (!planText.trim()) {
                    setPlanError(
                      el
                        ? "Δημιούργησε ή επικόλλησε πρώτα ένα Composition Plan."
                        : "Generate or paste a Composition Plan first.",
                    );
                    return;
                  }
                  planGeneration.mutate();
                }}
                disabled={!planText.trim() || anyGenerating || planMutation.isPending}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-45"
              >
                {planGeneration.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AudioLines className="h-4 w-4" />
                )}
                {planGeneration.isPending
                  ? el
                    ? "Δημιουργία από Plan…"
                    : "Generating from Plan…"
                  : "Generate from Plan"}
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-200/80">
                {el
                  ? "Το audio generation καταναλώνει ElevenLabs credits. Η επίσημη τεκμηρίωση αναφέρει ότι το Music API απαιτεί paid plan."
                  : "Audio generation consumes ElevenLabs credits. Official documentation says the Music API requires a paid plan."}
              </p>

              {generationError && (
                <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                  {generationError instanceof Error
                    ? generationError.message
                    : "Eleven Music generation failed"}
                </p>
              )}
            </div>

            {generated && (
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold">
                      {el ? "Audio που δημιουργήθηκε" : "Generated audio"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Eleven Music v2.5 · MP3
                    </p>
                  </div>
                  <Check className="h-4 w-4 text-emerald-300" />
                </div>
                <audio className="mt-4 w-full" controls src={generated.audioUrl} />
                {generated.songId && (
                  <p className="mt-2 break-all text-[10px] text-muted-foreground">
                    song-id: {generated.songId}
                  </p>
                )}
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadCurrent()}
                    disabled={downloadMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold"
                  >
                    {downloadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {el ? "Λήψη" : "Download"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void discardCurrent()}
                    disabled={discardMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 px-3 py-2.5 text-xs text-red-300"
                  >
                    {discardMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {el ? "Απόρριψη" : "Discard"}
                  </button>
                </div>
                {downloadError && <p className="mt-3 text-xs text-red-300">{downloadError}</p>}
                {discardError && <p className="mt-3 text-xs text-red-300">{discardError}</p>}
              </div>
            )}

            <div className="glass rounded-2xl border border-emerald-300/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Super Admin protected
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {el
                  ? "Κάθε server function ελέγχει Feature Access και Super Admin. Το API key παραμένει μόνο στον server."
                  : "Every server function checks Feature Access and Super Admin. The API key remains server-side only."}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
