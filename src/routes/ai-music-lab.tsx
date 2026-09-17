import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AudioLines, FlaskConical, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { generateLyriaSong, getAiMusicLabAccess } from "@/lib/ai-music-lab.functions";
import { useI18n } from "@/i18n";

export const AI_MUSIC_LAB_TRANSFER_KEY = "pb:ai-music-lab-package";

export const Route = createFileRoute("/ai-music-lab")({
  head: () => ({ meta: [{ title: "AI Music Lab | PromptBeats" }, { name: "robots", content: "noindex" }] }),
  component: AiMusicLabPage,
});

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60";

function AiMusicLabPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const copy: LabCopy = language === "el" ? el : en;
  const access = useQuery({ queryKey: ["ai-music-lab-access"], queryFn: () => getAiMusicLabAccess(), retry: false, staleTime: 60_000 });

  useEffect(() => {
    if (!access.isLoading && (access.isError || access.data?.allowed !== true)) {
      void navigate({ to: "/", replace: true });
    }
  }, [access.data, access.isError, access.isLoading, navigate]);

  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [musicStyle, setMusicStyle] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState("");

  useEffect(() => {
    if (access.data?.allowed !== true || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(AI_MUSIC_LAB_TRANSFER_KEY);
    if (!raw) return;
    try {
      const value = JSON.parse(raw) as Partial<{ title: string; musicStyle: string; lyrics: string; productionNotes: string }>;
      if (typeof value.title === "string") setTitle(value.title);
      if (typeof value.musicStyle === "string") setMusicStyle(value.musicStyle);
      if (typeof value.lyrics === "string") setLyrics(value.lyrics);
      if (typeof value.productionNotes === "string") setProductionNotes(value.productionNotes);
      window.sessionStorage.removeItem(AI_MUSIC_LAB_TRANSFER_KEY);
    } catch {
      window.sessionStorage.removeItem(AI_MUSIC_LAB_TRANSFER_KEY);
    }
  }, [access.data?.allowed]);

  const promptPreview = useMemo(() => {
    const parts = [
      title.trim() && `TITLE: ${title.trim()}`,
      musicStyle.trim() && `MUSIC STYLE: ${musicStyle.trim()}`,
      lyrics.trim() && `LYRICS:\n${lyrics.trim()}`,
      productionNotes.trim() && `PRODUCER NOTES: ${productionNotes.trim()}`,
    ].filter(Boolean);
    return parts.join("\n\n");
  }, [lyrics, musicStyle, productionNotes, title]);

  const generation = useMutation({
    mutationFn: () => generateLyriaSong({ data: { title, musicStyle, lyrics, productionNotes } }),
    onSuccess: (result) => {
      setAudioSrc(`data:${result.mimeType};base64,${result.audioBase64}`);
      setGeneratedText(result.generatedText);
    },
  });

  const reset = () => {
    setTitle("");
    setLyrics("");
    setMusicStyle("");
    setProductionNotes("");
    setAudioSrc(null);
    setGeneratedText("");
    generation.reset();
  };

  const canGenerate = Boolean(title.trim() || musicStyle.trim() || lyrics.trim() || productionNotes.trim());

  if (access.isLoading) {
    return <AppShell header={<Header copy={copy} />}><main className="mx-auto max-w-6xl px-4 py-8 md:px-8"><p className="text-sm text-muted-foreground">{copy.checking}</p></main></AppShell>;
  }

  if (access.isError || access.data?.allowed !== true) return null;

  return (
    <AppShell header={<Header copy={copy} />}>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><AudioLines className="h-5 w-5" /></div>
                    <div>
                      <h1 className="font-display text-2xl font-bold">Google Lyria</h1>
                      <p className="text-xs text-muted-foreground">Lyria 3.5 · {copy.adminOnly}</p>
                    </div>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200"><FlaskConical className="h-3.5 w-3.5" />{copy.testMode}</span>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="font-display text-lg font-semibold">{copy.songPackage}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.songPackageHint}</p></div>
                <button type="button" onClick={reset} disabled={!canGenerate && !audioSrc} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />{copy.reset}</button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.title}</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={copy.titlePlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.musicStyle}</span><textarea value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder={copy.musicStylePlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.lyrics}</span><textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={14} className={`${inputClass} resize-y font-mono text-[13px]`} placeholder={copy.lyricsPlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.productionNotes}</span><textarea value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} rows={4} className={`${inputClass} resize-y`} placeholder={copy.productionPlaceholder} /></label>
              </div>
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-display text-base font-semibold">{copy.preview}</h2></div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.previewHint}</p>
              <pre className="mt-4 max-h-[420px] min-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-foreground/90">{promptPreview || copy.emptyPreview}</pre>
              <button type="button" onClick={() => generation.mutate()} disabled={!canGenerate || generation.isPending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-45"><>{generation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}{generation.isPending ? copy.generating : copy.generate}</></button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">{copy.costWarning}</p>
              {generation.isError && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{generation.error instanceof Error ? generation.error.message : copy.generationError}</p>}
            </div>

            {audioSrc && (
              <div className="glass rounded-2xl p-5">
                <h2 className="font-display text-base font-semibold">{copy.result}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Lyria 3.5 · MP3</p>
                <audio className="mt-4 w-full" controls src={audioSrc}>{copy.audioUnsupported}</audio>
                {generatedText && <details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">{copy.generatedText}</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs">{generatedText}</pre></details>}
              </div>
            )}

            <div className="glass rounded-2xl border border-emerald-300/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-emerald-300" />{copy.adminProtected}</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.adminProtectedBody}</p>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function Header({ copy }: { copy: LabCopy }) {
  return <div><p className="font-display text-lg font-semibold">AI Music Lab</p><p className="text-xs text-muted-foreground">{copy.headerSub}</p></div>;
}

const en = {
  headerSub: "Experimental audio generation workspace",
  checking: "Checking admin access…",
  adminOnly: "Admin only",
  intro: "A separate workspace for testing real AI audio generation without changing the existing AI Prompt Studio. Google Lyria 3.5 is connected through the same Gemini API project.",
  testMode: "Test mode",
  songPackage: "Song package",
  songPackageHint: "The four fields mirror the PromptBeats generator result and are sent to Lyria as one structured song package.",
  reset: "Reset",
  title: "Title",
  titlePlaceholder: "Song title",
  musicStyle: "Music style",
  musicStylePlaceholder: "The complete PromptBeats music style prompt…",
  productionNotes: "Producer notes",
  productionPlaceholder: "Arrangement, dynamics, vocal treatment and production direction…",
  lyrics: "Lyrics",
  lyricsPlaceholder: "Paste or write the generated lyrics here…",
  preview: "Lyria request preview",
  previewHint: "This is the PromptBeats package used to build the server-side Lyria request.",
  emptyPreview: "Add a title, music style, lyrics or producer notes to preview the package.",
  generate: "Generate Audio with Lyria",
  generating: "Generating with Lyria…",
  costWarning: "Admin test: pressing Generate makes a paid Lyria 3.5 API request.",
  generationError: "Lyria generation failed.",
  result: "Generated audio",
  audioUnsupported: "Your browser does not support audio playback.",
  generatedText: "Lyria text output",
  adminProtected: "Admin-protected workspace",
  adminProtectedBody: "The sidebar item is shown only to admins, and every generation request also verifies the admin role on the server.",
} as const;

type LabCopy = { [K in keyof typeof en]: string };

const el: LabCopy = {
  headerSub: "Πειραματικός χώρος δημιουργίας πραγματικού audio",
  checking: "Έλεγχος πρόσβασης διαχειριστή…",
  adminOnly: "Μόνο για admin",
  intro: "Ξεχωριστός χώρος για δοκιμές πραγματικής δημιουργίας audio με AI, χωρίς να αλλάζει το υπάρχον AI Prompt Studio. Το Google Lyria 3.5 συνδέεται μέσω του ίδιου Gemini API project.",
  testMode: "Λειτουργία δοκιμών",
  songPackage: "Πακέτο τραγουδιού",
  songPackageHint: "Τα τέσσερα πεδία αντιστοιχούν ακριβώς στο αποτέλεσμα του PromptBeats Generator και στέλνονται στο Lyria ως ένα δομημένο πακέτο τραγουδιού.",
  reset: "Επαναφορά",
  title: "Τίτλος",
  titlePlaceholder: "Τίτλος τραγουδιού",
  musicStyle: "Μουσικό στυλ",
  musicStylePlaceholder: "Το ολοκληρωμένο Music Style prompt του PromptBeats…",
  productionNotes: "Σημειώσεις παραγωγής",
  productionPlaceholder: "Ενορχήστρωση, δυναμικές, επεξεργασία φωνής και κατεύθυνση παραγωγής…",
  lyrics: "Στίχοι",
  lyricsPlaceholder: "Επικόλλησε ή γράψε εδώ τους στίχους που δημιούργησε ο Generator…",
  preview: "Προεπισκόπηση αιτήματος Lyria",
  previewHint: "Αυτό είναι το πακέτο PromptBeats από το οποίο δημιουργείται το server-side αίτημα προς το Lyria.",
  emptyPreview: "Πρόσθεσε τίτλο, μουσικό στυλ, στίχους ή σημειώσεις παραγωγής για να δεις την προεπισκόπηση.",
  generate: "Δημιουργία Audio με Lyria",
  generating: "Δημιουργία με Lyria…",
  costWarning: "Admin test: το Generate πραγματοποιεί χρεώσιμη κλήση στο Lyria 3.5 API.",
  generationError: "Η δημιουργία με Lyria απέτυχε.",
  result: "Audio που δημιουργήθηκε",
  audioUnsupported: "Ο browser δεν υποστηρίζει αναπαραγωγή audio.",
  generatedText: "Κείμενο εξόδου Lyria",
  adminProtected: "Προστατευμένος χώρος admin",
  adminProtectedBody: "Η επιλογή εμφανίζεται μόνο σε admin και κάθε αίτημα δημιουργίας επαληθεύει ξανά τον ρόλο admin στον server.",
};
