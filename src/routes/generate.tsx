import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Save, Sparkles, Wand2, ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/promptbeats/AppShell";
import {
  generateSongPrompt,
  getGenerationUsage,
  savePromptToLibrary,
  HOURLY_LIMIT,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/generate")({
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
        content: "Generate optimized metatags, structured lyrics and producer notes for AI music platforms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneratePage,
});

const CUSTOM = "Custom…";
const GENRE_OPTIONS = [
  "Reggaeton", "Cumbia", "Latin Pop", "Italo Disco", "Synthwave", "Acoustic", "Hip-Hop",
  "Pop", "Rock", "R&B", "House", "Techno", "Electronic / EDM", "Drum & Bass", "Trap", "Jazz",
  "Lo-fi", "Country", "Metal", "Afrobeats", CUSTOM,
];

const MOOD_OPTIONS = ["Energetic", "Melancholic", "Dark", "Uplifting", "Romantic", "Dreamy", "Aggressive", "Nostalgic", CUSTOM];
const LANGUAGE_OPTIONS = ["Greek", "English", "Spanish", "Russian", "Italian", "French", "German", "Portuguese", CUSTOM];

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Copy"
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

function OutputCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 font-display text-sm font-semibold tracking-wide text-gradient-neon">{title}</h2>
        <CopyButton value={body} />
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{body || "—"}</pre>
    </div>
  );
}

function GeneratePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [theme, setTheme] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [customGenre, setCustomGenre] = useState("");

  const [mood, setMood] = useState("");
  const [customMood, setCustomMood] = useState("");
  const [language, setLanguage] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ title: string; tags: string; lyrics: string; note: string } | null>(null);
  const [now, setNow] = useState(Date.now());

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

  const remaining = usage?.remaining ?? HOURLY_LIMIT;
  const minutesLeft = useMemo(() => {
    if (!usage?.resetAt) return 0;
    return Math.max(1, Math.ceil((new Date(usage.resetAt).getTime() - now) / 60000));
  }, [usage?.resetAt, now]);

  const blocked = remaining <= 0;

  // Resolve the effective value: the typed custom text when "Custom…" is chosen.
  const customGenreSelected = genres.includes(CUSTOM);
  const effectiveGenre = [
    ...genres.filter((g) => g !== CUSTOM),
    ...(customGenreSelected ? [customGenre.trim()] : []),
  ]
    .filter(Boolean)
    .join(", ");

  const effectiveMood = mood === CUSTOM ? customMood.trim() : mood;
  const effectiveLanguage = language === CUSTOM ? customLanguage.trim() : language;
  const ready =
    theme.trim().length >= 3 && !!effectiveGenre && !!effectiveMood && !!effectiveLanguage;

  const generate = async () => {
    setBusy(true);
    setStatus(null);
    setSaved(false);
    try {
      const res = await generateSongPrompt({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      if (res.error === "rate_limited") {
        setStatus("You've hit the hourly limit. Try again soon.");
        return;
      }
      setResult(res.result);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    try {
      await savePromptToLibrary({
        data: {
          theme: theme.trim(),
          genre: effectiveGenre,
          mood: effectiveMood,
          language: effectiveLanguage,
          ...result,
        },
      });
      setSaved(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save");
    }
  };

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
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to the feed
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="PromptBeats logo"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl glow-neon"
          />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">AI Prompt &amp; Lyrics Generator</h1>
            <p className="truncate text-xs text-muted-foreground">Optimized for Suno &amp; Udio</p>
          </div>
        </div>

        <div className="glass-strong mt-6 space-y-3 rounded-3xl p-5 sm:p-6">
          <div>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              placeholder="Your theme or topic — e.g. a late-night drive through a neon city after a breakup"
              aria-label="Theme or topic"
              className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{theme.length}/300</p>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              Music Style — pick one or more to fuse
            </p>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((g) => {
                const active = genres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
                    }
                    className={
                      active
                        ? "rounded-full border border-transparent bg-gradient-neon px-3.5 py-1.5 text-xs font-semibold text-primary-foreground glow-neon transition-transform active:scale-95"
                        : "rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                    }
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Mood" className={fieldClass}>
              <option value="" disabled className="bg-[#0a0a0c]">
                Select Mood / Vibe (e.g., Energetic, Chill...)
              </option>
              {MOOD_OPTIONS.map((m) => (
                <option key={m} value={m} className="bg-[#0a0a0c]">{m}</option>
              ))}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" className={fieldClass}>
              <option value="" disabled className="bg-[#0a0a0c]">
                Select Language (e.g., English, Greek...)
              </option>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l} value={l} className="bg-[#0a0a0c]">{l}</option>
              ))}
            </select>
          </div>

          {customGenreSelected && (
            <input
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              placeholder="Type your own style tags (merged with the selected genres)"
              aria-label="Custom music style"
              className={fieldClass}
            />
          )}

          {mood === CUSTOM && (
            <input
              value={customMood}
              onChange={(e) => setCustomMood(e.target.value)}
              placeholder="Type your own mood / vibe"
              aria-label="Custom mood"
              className={fieldClass}
            />
          )}
          {language === CUSTOM && (
            <input
              value={customLanguage}
              onChange={(e) => setCustomLanguage(e.target.value)}
              placeholder="Type your own language"
              aria-label="Custom language"
              className={fieldClass}
            />
          )}

          <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
            <button
              onClick={generate}
              disabled={busy || blocked || !ready}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale sm:w-auto"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate with AI
            </button>
            <span className="text-xs text-muted-foreground">
              {blocked ? `Try again in ${minutesLeft}m` : `Generations remaining: ${remaining}/${HOURLY_LIMIT}`}
            </span>
          </div>

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
            <OutputCard title="SONG TITLE" body={result.title} />
            <OutputCard title="STYLE PROMPT (METATAGS)" body={result.tags} />
            <OutputCard title="LYRICS & STRUCTURE" body={result.lyrics} />
            <OutputCard title="PRODUCER'S NOTE" body={result.note} />
            <button
              onClick={save}
              disabled={saved}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
            >
              {saved ? <Check className="h-4 w-4 text-accent" /> : <Save className="h-4 w-4" />}
              {saved ? "Saved to your library" : "Save to My Library"}
            </button>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
