import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AudioLines, Check, Download, FlaskConical, ImagePlus, Loader2, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { discardLyriaSong, generateLyriaSong, getAiMusicLabAccess } from "@/lib/ai-music-lab.functions";
import { createTrack, discardUploads } from "@/lib/tracks.functions";
import { UPLOAD_GENRES } from "@/lib/tracks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { localizedGenreLabel } from "@/i18n/ui-catalog";

export const AI_MUSIC_LAB_TRANSFER_KEY = "pb:ai-music-lab-package";

export const Route = createFileRoute("/ai-music-lab")({
  head: () => ({ meta: [{ title: "AI Music Lab | PromptBeats" }, { name: "robots", content: "noindex" }] }),
  component: AiMusicLabPage,
});

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60";

function LabSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-white/5 border-l-2 border-l-accent bg-white/[0.02] px-2.5 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/90">{children}</span>
    </div>
  );
}

function inferGenre(musicStyle: string) {
  const source = musicStyle.toLowerCase();
  const aliases: Array<[string, string]> = [
    ["hip-hop", "Hip-Hop / Rap"], ["hip hop", "Hip-Hop / Rap"], ["rap", "Hip-Hop / Rap"],
    ["drum & bass", "Drum & Bass"], ["drum and bass", "Drum & Bass"],
    ["r&b", "R&B / Soul"], ["rnb", "R&B / Soul"],
    ["lo-fi", "Lo-Fi / Chill"], ["lofi", "Lo-Fi / Chill"],
    ["soundtrack", "Cinematic / Soundtrack"], ["cinematic", "Cinematic / Soundtrack"],
    ["folk", "Acoustic / Folk"], ["acoustic", "Acoustic / Folk"],
    ["classical", "Classical"], ["country", "Country"], ["reggae", "Reggae"], ["latin", "Latin"],
    ["techno", "Techno"], ["trance", "Trance"], ["house", "House"], ["electronic", "Electronic / EDM"], ["edm", "Electronic / EDM"],
    ["metal", "Metal"], ["rock", "Rock"], ["jazz", "Jazz"], ["blues", "Blues"], ["funk", "Funk / Disco"], ["disco", "Funk / Disco"], ["soul", "R&B / Soul"], ["pop", "Pop"],
  ];
  return aliases.find(([needle]) => source.includes(needle))?.[1] ?? "Experimental";
}

type GeneratedAudio = { audioUrl: string; audioKey: string; mimeType: string; generatedText: string; model: "lyria-3.5" };

function AiMusicLabPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useI18n();
  const copy: LabCopy = language === "el" ? el : en;
  const access = useQuery({ queryKey: ["ai-music-lab-access"], queryFn: () => getAiMusicLabAccess(), retry: false, staleTime: 60_000 });

  useEffect(() => {
    if (!access.isLoading && (access.isError || access.data?.allowed !== true)) void navigate({ to: "/", replace: true });
  }, [access.data, access.isError, access.isLoading, navigate]);

  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [musicStyle, setMusicStyle] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [generated, setGenerated] = useState<GeneratedAudio | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveGenre, setSaveGenre] = useState("Experimental");
  const [savePrompt, setSavePrompt] = useState("");
  const [saveLyrics, setSaveLyrics] = useState("");
  const [savePublished, setSavePublished] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);

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
    mutationFn: () => generateLyriaSong({ data: { title, musicStyle, lyrics, productionNotes, previousAudioKey: generated?.audioKey ?? null } }),
    onSuccess: (result) => {
      setGenerated(result);
      setDiscardError(null);
      setSaveOpen(false);
    },
  });

  const discardMutation = useMutation({ mutationFn: (audioKey: string) => discardLyriaSong({ data: { audioKey } }) });

  const discardCurrent = async () => {
    if (!generated) return;
    setDiscardError(null);
    try {
      await discardMutation.mutateAsync(generated.audioKey);
      setGenerated(null);
      setSaveOpen(false);
    } catch (error) {
      setDiscardError(error instanceof Error ? error.message : copy.discardError);
    }
  };

  const reset = async () => {
    if (generated) await discardCurrent();
    setTitle(""); setLyrics(""); setMusicStyle(""); setProductionNotes(""); setGenerated(null); setSaveOpen(false); setDiscardError(null); generation.reset();
  };

  const openSave = () => {
    setSaveTitle(title.trim() || copy.untitled);
    setSaveGenre(inferGenre(musicStyle));
    setSavePrompt([musicStyle.trim(), productionNotes.trim() && `PRODUCER NOTES:\n${productionNotes.trim()}`].filter(Boolean).join("\n\n"));
    setSaveLyrics(lyrics);
    setSavePublished(true);
    setCoverFile(null);
    setSaveError(null);
    setSaveOpen(true);
  };

  const uploadCover = async (file: File) => {
    if (!user) throw new Error(copy.signInRequired);
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("track-covers").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error(error.message);
    return { path, url: supabase.storage.from("track-covers").getPublicUrl(path).data.publicUrl };
  };

  const saveToPromptBeats = async () => {
    if (!generated) return;
    if (!saveTitle.trim()) { setSaveError(copy.titleRequired); return; }
    setSaveBusy(true); setSaveError(null);
    let cover: { path: string; url: string } | null = null;
    try {
      if (coverFile) cover = await uploadCover(coverFile);
      await createTrack({ data: {
        title: saveTitle.trim(),
        genre: saveGenre,
        prompt: savePrompt,
        lyrics: saveLyrics,
        audio_url: generated.audioUrl,
        audio_type: "upload",
        source_type: "upload",
        created_with: "Google Lyria 3.5",
        audio_key: generated.audioKey,
        ...(cover ? { cover_url: cover.url } : {}),
        is_published: savePublished,
      } });
      setSaveOpen(false);
      setGenerated(null);
      await navigate({ to: "/library" });
    } catch (error) {
      if (cover) {
        try { await discardUploads({ data: { coverPath: cover.path } }); } catch { /* durable cleanup handles any later failure */ }
      }
      setSaveError(error instanceof Error ? error.message : copy.saveError);
    } finally {
      setSaveBusy(false);
    }
  };

  const canGenerate = Boolean(title.trim() || musicStyle.trim() || lyrics.trim() || productionNotes.trim());

  if (access.isLoading) return <AppShell header={<Header copy={copy} />}><main className="mx-auto max-w-6xl px-4 py-8 md:px-8"><p className="text-sm text-muted-foreground">{copy.checking}</p></main></AppShell>;
  if (access.isError || access.data?.allowed !== true) return null;

  const downloadName = `${(title.trim() || "promptbeats-lyria").replace(/[\\/:*?"<>|]+/g, "-")}.${generated?.mimeType.includes("wav") ? "wav" : "mp3"}`;

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
                    <div><h1 className="font-display text-2xl font-bold">Google Lyria</h1><p className="text-xs text-muted-foreground">Lyria 3.5 · {copy.adminOnly}</p></div>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200"><FlaskConical className="h-3.5 w-3.5" />{copy.testMode}</span>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="font-display text-lg font-semibold">{copy.songPackage}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.songPackageHint}</p></div>
                <button type="button" onClick={() => void reset()} disabled={generation.isPending || discardMutation.isPending || (!canGenerate && !generated)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />{copy.reset}</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><LabSectionHeader>{copy.title}</LabSectionHeader><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={copy.titlePlaceholder} /></label>
                <label className="sm:col-span-2"><LabSectionHeader>{copy.musicStyle}</LabSectionHeader><textarea value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder={copy.musicStylePlaceholder} /></label>
                <label className="sm:col-span-2"><LabSectionHeader>{copy.lyrics}</LabSectionHeader><textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={14} className={`${inputClass} resize-y font-mono text-[13px]`} placeholder={copy.lyricsPlaceholder} /></label>
                <label className="sm:col-span-2"><LabSectionHeader>{copy.productionNotes}</LabSectionHeader><textarea value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} rows={4} className={`${inputClass} resize-y`} placeholder={copy.productionPlaceholder} /></label>
              </div>
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-display text-base font-semibold">{copy.preview}</h2></div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.previewHint}</p>
              <pre className="mt-4 max-h-[420px] min-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-foreground/90">{promptPreview || copy.emptyPreview}</pre>
              <button type="button" onClick={() => generation.mutate()} disabled={!canGenerate || generation.isPending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-45">{generation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}{generation.isPending ? copy.generating : copy.generate}</button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">{copy.costWarning}</p>
              {generation.isError && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{generation.error instanceof Error ? generation.error.message : copy.generationError}</p>}
            </div>

            {generated && (
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-base font-semibold">{copy.result}</h2><p className="mt-1 text-xs text-muted-foreground">Google Lyria 3.5 · {generated.mimeType.includes("wav") ? "WAV" : "MP3"}</p></div><Check className="h-4 w-4 text-emerald-300" /></div>
                <audio className="mt-4 w-full" controls src={generated.audioUrl}>{copy.audioUnsupported}</audio>
                <div className="mt-4 grid gap-2">
                  <a href={generated.audioUrl} download={downloadName} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent"><Download className="h-4 w-4" />{copy.download}</a>
                  <button type="button" onClick={openSave} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-3 py-2.5 text-xs font-semibold text-primary-foreground"><Save className="h-4 w-4" />{copy.savePromptBeats}</button>
                  <button type="button" onClick={() => void discardCurrent()} disabled={discardMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 px-3 py-2.5 text-xs text-red-300 transition-colors hover:bg-red-400/5 disabled:opacity-50">{discardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{copy.discard}</button>
                </div>
                {discardError && <p className="mt-3 text-xs text-red-300">{discardError}</p>}
                {generated.generatedText && <details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">{copy.generatedText}</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs">{generated.generatedText}</pre></details>}
              </div>
            )}

            <div className="glass rounded-2xl border border-emerald-300/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-emerald-300" />{copy.adminProtected}</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.adminProtectedBody}</p>
            </div>
          </aside>
        </div>
      </main>

      {saveOpen && generated && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="save-lyria-track-title">
          <div className="glass-strong max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7">
            <header className="flex items-center justify-between gap-3"><div><h2 id="save-lyria-track-title" className="font-display text-lg font-bold">{copy.savePromptBeats}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.saveHint}</p></div><button onClick={() => setSaveOpen(false)} aria-label={copy.close} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></header>
            <div className="mt-5 space-y-4">
              <label className="block text-xs text-muted-foreground">{copy.title}<input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} maxLength={120} className={`${inputClass} mt-1.5`} /></label>
              <label className="block text-xs text-muted-foreground">{copy.genre}<select value={saveGenre} onChange={(e) => setSaveGenre(e.target.value)} className={`${inputClass} mt-1.5`}>{UPLOAD_GENRES.filter((genre) => genre !== "Custom").map((genre) => <option key={genre} value={genre} className="bg-[#0a0a0c]">{localizedGenreLabel(genre, t)}</option>)}</select></label>
              <label className="block text-xs text-muted-foreground">{copy.musicPrompt}<textarea value={savePrompt} onChange={(e) => setSavePrompt(e.target.value)} rows={5} maxLength={4000} className={`${inputClass} mt-1.5 resize-y`} /></label>
              <label className="block text-xs text-muted-foreground">{copy.lyrics}<textarea value={saveLyrics} onChange={(e) => setSaveLyrics(e.target.value)} rows={8} maxLength={8000} className={`${inputClass} mt-1.5 resize-y`} /></label>
              <label className="block text-xs text-muted-foreground">{copy.createdWith}<div className="mt-1.5 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm text-accent">Google Lyria 3.5</div></label>
              <fieldset className="flex items-center gap-2"><legend className="mr-1 text-xs text-muted-foreground">{copy.visibility}</legend>{([true, false] as const).map((value) => <button key={String(value)} type="button" onClick={() => setSavePublished(value)} aria-pressed={savePublished === value} className={`rounded-full border px-3 py-1.5 text-xs ${savePublished === value ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground"}`}>{value ? copy.public : copy.private}</button>)}</fieldset>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"><ImagePlus className="h-4 w-4" /><span className="truncate">{coverFile ? coverFile.name : copy.coverOptional}</span><input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} className="hidden" /></label>
              {saveError && <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{saveError}</p>}
              <button type="button" onClick={() => void saveToPromptBeats()} disabled={saveBusy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saveBusy ? copy.saving : savePublished ? copy.publishTrack : copy.saveTrack}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Header({ copy }: { copy: LabCopy }) {
  return <div><p className="font-display text-lg font-semibold">AI Music Lab</p><p className="text-xs text-muted-foreground">{copy.headerSub}</p></div>;
}

const en = {
  headerSub: "Experimental audio generation workspace", checking: "Checking admin access…", adminOnly: "Admin only",
  intro: "A separate workspace for testing real AI audio generation without changing the existing AI Prompt Studio. Google Lyria 3.5 is connected through the same Gemini API project.",
  testMode: "Test mode", songPackage: "Song package", songPackageHint: "The four fields mirror the PromptBeats generator result and are sent to Lyria as one structured song package.", reset: "Reset",
  title: "Title", titlePlaceholder: "Song title", musicStyle: "Music style", musicStylePlaceholder: "The complete PromptBeats music style prompt…", productionNotes: "Producer notes", productionPlaceholder: "Arrangement, dynamics, vocal treatment and production direction…", lyrics: "Lyrics", lyricsPlaceholder: "Paste or write the generated lyrics here…",
  preview: "Lyria request preview", previewHint: "This is the PromptBeats package used to build the server-side Lyria request.", emptyPreview: "Add a title, music style, lyrics or producer notes to preview the package.",
  generate: "Generate Audio with Lyria", generating: "Generating with Lyria…", costWarning: "Admin test: pressing Generate makes a paid Lyria 3.5 API request.", generationError: "Lyria generation failed.", result: "Generated audio", audioUnsupported: "Your browser does not support audio playback.", generatedText: "Lyria text output",
  download: "Download", discard: "Discard", discardError: "Could not discard this generation.", savePromptBeats: "Save to PromptBeats", saveHint: "The generated audio and song details are ready. Add a cover if you want, choose visibility, then save.", genre: "Genre", musicPrompt: "Music prompt", createdWith: "Created with", visibility: "Visibility", public: "Public", private: "Private", coverOptional: "Add cover art (optional)", publishTrack: "Publish Track", saveTrack: "Save Track", saving: "Saving…", saveError: "Could not save this track.", titleRequired: "A title is required.", signInRequired: "Sign in to save a cover.", close: "Close", untitled: "Untitled Lyria song",
  adminProtected: "Admin-protected workspace", adminProtectedBody: "The sidebar item is shown only to admins, and every generation request also verifies the admin role on the server.",
} as const;

type LabCopy = { [K in keyof typeof en]: string };

const el: LabCopy = {
  headerSub: "Πειραματικός χώρος δημιουργίας πραγματικού audio", checking: "Έλεγχος πρόσβασης διαχειριστή…", adminOnly: "Μόνο για admin",
  intro: "Ξεχωριστός χώρος για δοκιμές πραγματικής δημιουργίας audio με AI, χωρίς να αλλάζει το υπάρχον AI Prompt Studio. Το Google Lyria 3.5 συνδέεται μέσω του ίδιου Gemini API project.",
  testMode: "Λειτουργία δοκιμών", songPackage: "Πακέτο τραγουδιού", songPackageHint: "Τα τέσσερα πεδία αντιστοιχούν ακριβώς στο αποτέλεσμα του PromptBeats Generator και στέλνονται στο Lyria ως ένα δομημένο πακέτο τραγουδιού.", reset: "Επαναφορά",
  title: "Τίτλος", titlePlaceholder: "Τίτλος τραγουδιού", musicStyle: "Μουσικό στυλ", musicStylePlaceholder: "Το ολοκληρωμένο Music Style prompt του PromptBeats…", productionNotes: "Σημειώσεις παραγωγής", productionPlaceholder: "Ενορχήστρωση, δυναμικές, επεξεργασία φωνής και κατεύθυνση παραγωγής…", lyrics: "Στίχοι", lyricsPlaceholder: "Επικόλλησε ή γράψε εδώ τους στίχους που δημιούργησε ο Generator…",
  preview: "Προεπισκόπηση αιτήματος Lyria", previewHint: "Αυτό είναι το πακέτο PromptBeats από το οποίο δημιουργείται το server-side αίτημα προς το Lyria.", emptyPreview: "Πρόσθεσε τίτλο, μουσικό στυλ, στίχους ή σημειώσεις παραγωγής για να δεις την προεπισκόπηση.",
  generate: "Δημιουργία Audio με Lyria", generating: "Δημιουργία με Lyria…", costWarning: "Admin test: το Generate πραγματοποιεί χρεώσιμη κλήση στο Lyria 3.5 API.", generationError: "Η δημιουργία με Lyria απέτυχε.", result: "Audio που δημιουργήθηκε", audioUnsupported: "Ο browser δεν υποστηρίζει αναπαραγωγή audio.", generatedText: "Κείμενο εξόδου Lyria",
  download: "Λήψη", discard: "Απόρριψη", discardError: "Δεν ήταν δυνατή η απόρριψη αυτού του αποτελέσματος.", savePromptBeats: "Αποθήκευση στο PromptBeats", saveHint: "Το audio και τα στοιχεία του τραγουδιού είναι έτοιμα. Πρόσθεσε προαιρετικά cover, επίλεξε ορατότητα και αποθήκευσε.", genre: "Είδος", musicPrompt: "Music prompt", createdWith: "Δημιουργήθηκε με", visibility: "Ορατότητα", public: "Δημόσιο", private: "Ιδιωτικό", coverOptional: "Προσθήκη cover art (προαιρετικό)", publishTrack: "Δημοσίευση τραγουδιού", saveTrack: "Αποθήκευση τραγουδιού", saving: "Αποθήκευση…", saveError: "Δεν ήταν δυνατή η αποθήκευση του τραγουδιού.", titleRequired: "Απαιτείται τίτλος.", signInRequired: "Συνδέσου για να αποθηκεύσεις cover.", close: "Κλείσιμο", untitled: "Τραγούδι Lyria χωρίς τίτλο",
  adminProtected: "Προστατευμένος χώρος admin", adminProtectedBody: "Η επιλογή εμφανίζεται μόνο σε admin και κάθε αίτημα δημιουργίας επαληθεύει ξανά τον ρόλο admin στον server.",
};
