import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AudioLines, FlaskConical, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import {
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
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60";

function ElevenMusicLabPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const el = language === "el";
  const access = useQuery({
    queryKey: ["eleven-music-lab-access"],
    queryFn: () => getElevenMusicLabAccess(),
    retry: false,
  });

  useEffect(() => {
    if (!access.isLoading && (access.isError || access.data?.allowed !== true))
      void navigate({ to: "/", replace: true });
  }, [access.data, access.isError, access.isLoading, navigate]);

  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(180);
  const [planText, setPlanText] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{
    audioUrl: string;
    audioKey: string;
    model: "music_v2_5";
    songId: string | null;
  } | null>(null);
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
    },
  });

  const planGeneration = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(planText);
      } catch {
        throw new Error(
          el ? "Το Composition Plan δεν είναι έγκυρο JSON." : "Composition Plan is not valid JSON.",
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
    },
  });

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

  const generating = directGeneration.isPending || planGeneration.isPending;
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
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground"
          >
            ← Google Lyria
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <AudioLines className="h-5 w-5 text-primary" />
                <div>
                  <h1 className="font-display text-2xl font-bold">Eleven Music</h1>
                  <p className="text-xs text-muted-foreground">Music v2.5 · API experiment</p>
                </div>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {el
                  ? "Για σωστό A/B test χρησιμοποίησε το ίδιο PromptBeats prompt που δίνεις στο Suno."
                  : "For a clean A/B test, use the same PromptBeats prompt you send to Suno."}
              </p>
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
                  el ? "Επικόλλησε το PromptBeats prompt…" : "Paste the PromptBeats prompt…"
                }
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-40 flex-1 text-xs text-muted-foreground">
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
                <div className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-muted-foreground">
                  ~{estimatedCredits.toLocaleString()} credits*
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {el
                  ? "* Εκτίμηση με βάση ~900 credits/λεπτό. Το πραγματικό billing καθορίζεται από την ElevenLabs."
                  : "* Estimate based on ~900 credits/minute. Actual billing is determined by ElevenLabs."}
              </p>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="font-display text-lg font-semibold">Composition Plan</h2>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {el
                  ? "Η δημιουργία του plan δεν καταναλώνει ElevenLabs credits. Μπορείς να επεξεργαστείς το JSON πριν το audio generation."
                  : "Creating the plan does not consume ElevenLabs credits. You can edit the JSON before audio generation."}
              </p>
              <button
                type="button"
                onClick={() => planMutation.mutate()}
                disabled={!prompt.trim() || planMutation.isPending || generating}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-45"
              >
                {planMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Composition Plan — FREE
              </button>
              {planMutation.isError && (
                <p className="mt-3 text-xs text-red-300">
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
                placeholder="Composition Plan JSON…"
              />
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-200" />
                <h2 className="font-display text-base font-semibold">
                  {el ? "Δημιουργία Audio" : "Generate Audio"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => directGeneration.mutate()}
                disabled={!prompt.trim() || generating || planMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-45"
              >
                {directGeneration.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate from Prompt
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!planText.trim()) {
                    setPlanError(
                      el
                        ? "Δημιούργησε πρώτα ένα Composition Plan."
                        : "Generate a Composition Plan first.",
                    );
                    return;
                  }
                  planGeneration.mutate();
                }}
                disabled={!planText.trim() || generating || planMutation.isPending}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-45"
              >
                {planGeneration.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate from Plan
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrompt("");
                  setPlanText("");
                  setPlanError(null);
                  setGenerated(null);
                  directRequestKey.current = null;
                  planRequestKey.current = null;
                }}
                disabled={generating}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-muted-foreground disabled:opacity-45"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {el ? "Καθαρισμός" : "Clear"}
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-amber-200/80">
                {el
                  ? "Το audio generation καταναλώνει credits. Η ElevenLabs αναφέρει ότι το Music API απαιτεί paid plan."
                  : "Audio generation consumes credits. ElevenLabs states that the Music API requires a paid plan."}
              </p>
              {generationError && (
                <p className="mt-3 text-xs text-red-300">
                  {generationError instanceof Error
                    ? generationError.message
                    : "Eleven Music generation failed"}
                </p>
              )}
            </div>

            {generated && (
              <div className="glass rounded-2xl p-5">
                <h2 className="font-display text-base font-semibold">
                  {el ? "Audio που δημιουργήθηκε" : "Generated audio"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Eleven Music v2.5 · MP3</p>
                <audio className="mt-4 w-full" controls src={generated.audioUrl} />
                {generated.songId && (
                  <p className="mt-2 break-all text-[10px] text-muted-foreground">
                    song-id: {generated.songId}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
