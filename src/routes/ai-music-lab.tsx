import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, FlaskConical, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { getAiMusicLabAccess } from "@/lib/ai-music-lab.functions";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/ai-music-lab")({
  head: () => ({ meta: [{ title: "AI Music Lab | PromptBeats" }, { name: "robots", content: "noindex" }] }),
  component: AiMusicLabPage,
});

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60";

function AiMusicLabPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const copy = language === "el" ? el : en;
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

  const promptPreview = useMemo(() => {
    const parts = [
      title.trim() && `TITLE: ${title.trim()}`,
      musicStyle.trim() && `MUSIC DIRECTION: ${musicStyle.trim()}`,
      productionNotes.trim() && `PRODUCTION DIRECTION: ${productionNotes.trim()}`,
      lyrics.trim() && `LYRICS:\n${lyrics.trim()}`,
    ].filter(Boolean);
    return parts.join("\n\n");
  }, [lyrics, musicStyle, productionNotes, title]);

  const reset = () => {
    setTitle("");
    setLyrics("");
    setMusicStyle("");
    setProductionNotes("");
  };

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
                <button type="button" onClick={reset} disabled={!title && !lyrics && !musicStyle && !productionNotes} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />{copy.reset}</button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.title}</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={copy.titlePlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.musicStyle}</span><textarea value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder={copy.musicStylePlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.productionNotes}</span><textarea value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} rows={4} className={`${inputClass} resize-y`} placeholder={copy.productionPlaceholder} /></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{copy.lyrics}</span><textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={14} className={`${inputClass} resize-y font-mono text-[13px]`} placeholder={copy.lyricsPlaceholder} /></label>
              </div>
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-display text-base font-semibold">{copy.preview}</h2></div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.previewHint}</p>
              <pre className="mt-4 max-h-[420px] min-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-foreground/90">{promptPreview || copy.emptyPreview}</pre>
              <button type="button" disabled className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground opacity-45 grayscale"><AudioLines className="h-4 w-4" />{copy.generate}</button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">{copy.connectionPending}</p>
            </div>

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

function Header({ copy }: { copy: typeof en }) {
  return <div><p className="font-display text-lg font-semibold">AI Music Lab</p><p className="text-xs text-muted-foreground">{copy.headerSub}</p></div>;
}

const en = {
  headerSub: "Experimental audio generation workspace",
  checking: "Checking admin access…",
  adminOnly: "Admin only",
  intro: "A separate workspace for testing real AI audio generation without changing the existing AI Prompt Studio. The first provider is Google Lyria.",
  testMode: "Test mode",
  songPackage: "Song package",
  songPackageHint: "Prepare the exact material that will later be adapted and sent to Lyria.",
  reset: "Reset",
  title: "Title",
  titlePlaceholder: "Song title",
  musicStyle: "Music style / direction",
  musicStylePlaceholder: "Genre, mood, BPM, instruments, vocal direction, energy…",
  productionNotes: "Production notes",
  productionPlaceholder: "Arrangement, dynamics, mix texture, vocal treatment, build-up, chorus impact…",
  lyrics: "Lyrics",
  lyricsPlaceholder: "Paste or write the generated lyrics here…",
  preview: "Lyria request preview",
  previewHint: "For now this shows the package we will convert into a Lyria-specific request. No paid API call is made yet.",
  emptyPreview: "Add a title, style, production direction or lyrics to preview the package.",
  generate: "Generate Audio with Lyria",
  connectionPending: "Disabled until the Lyria API request/response flow is connected and verified.",
  adminProtected: "Admin-protected workspace",
  adminProtectedBody: "The sidebar item is shown only to admins, and this route also verifies admin access on the server.",
} as const;

const el: typeof en = {
  headerSub: "Πειραματικός χώρος δημιουργίας πραγματικού audio",
  checking: "Έλεγχος πρόσβασης διαχειριστή…",
  adminOnly: "Μόνο για admin",
  intro: "Ξεχωριστός χώρος για δοκιμές πραγματικής δημιουργίας audio με AI, χωρίς να αλλάζει το υπάρχον AI Prompt Studio. Ο πρώτος provider είναι το Google Lyria.",
  testMode: "Λειτουργία δοκιμών",
  songPackage: "Πακέτο τραγουδιού",
  songPackageHint: "Ετοίμασε ακριβώς το υλικό που αργότερα θα προσαρμόζεται και θα στέλνεται στο Lyria.",
  reset: "Επαναφορά",
  title: "Τίτλος",
  titlePlaceholder: "Τίτλος τραγουδιού",
  musicStyle: "Μουσικό στυλ / κατεύθυνση",
  musicStylePlaceholder: "Είδος, διάθεση, BPM, όργανα, φωνητική κατεύθυνση, ενέργεια…",
  productionNotes: "Σημειώσεις παραγωγής",
  productionPlaceholder: "Ενορχήστρωση, δυναμικές, υφή μίξης, επεξεργασία φωνής, build-up, ένταση ρεφρέν…",
  lyrics: "Στίχοι",
  lyricsPlaceholder: "Επικόλλησε ή γράψε εδώ τους στίχους που δημιούργησε ο Generator…",
  preview: "Προεπισκόπηση αιτήματος Lyria",
  previewHint: "Προς το παρόν εμφανίζεται το πακέτο που θα μετατρέψουμε σε Lyria-specific request. Δεν γίνεται ακόμη καμία χρεώσιμη API κλήση.",
  emptyPreview: "Πρόσθεσε τίτλο, στυλ, οδηγίες παραγωγής ή στίχους για να δεις την προεπισκόπηση.",
  generate: "Δημιουργία Audio με Lyria",
  connectionPending: "Παραμένει απενεργοποιημένο μέχρι να συνδέσουμε και να επαληθεύσουμε το request/response flow του Lyria API.",
  adminProtected: "Προστατευμένος χώρος admin",
  adminProtectedBody: "Η επιλογή εμφανίζεται μόνο σε admin και η ίδια η σελίδα επαληθεύει την πρόσβαση admin και στον server.",
};
