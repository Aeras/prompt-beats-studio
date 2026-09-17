import { useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, Music, Pencil, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { UPLOAD_GENRES } from "@/lib/tracks";
import { CREATED_WITH_OPTIONS, type CreatedWith } from "@/lib/created-with";
import { deleteTrack, discardUploads, updateTrack } from "@/lib/tracks.functions";
import { type PersistedTrackSourceType, isSupportedExternalTrackUrl } from "@/lib/track-sources";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModeration } from "@/hooks/useModeration";
import { useI18n } from "@/i18n";
import { localizedGenreLabel } from "@/i18n/ui-catalog";

export type EditableTrack = {
  id: string;
  user_id?: string | null;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  audio_url: string;
  audio_type: string;
  source_type?: PersistedTrackSourceType | string | null | undefined;
  source_url?: string | null | undefined;
  created_with?: CreatedWith | null | undefined;
  is_published?: boolean | undefined;
};

const inputCls = "h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-primary/60";
const providerName = (sourceType: string) => sourceType === "suno" ? "Suno" : sourceType === "udio" ? "Udio" : "Upload File";

export function TrackOwnerActions({ track, compact = false }: { track: EditableTrack; compact?: boolean }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { isAdmin } = useModeration();
  const queryClient = useQueryClient();
  const sourceType = (track.source_type ?? (track.audio_type === "upload" ? "upload" : "legacy_link")) as PersistedTrackSourceType;
  const isUpload = sourceType === "upload";
  const initialGenre = UPLOAD_GENRES.includes(track.genre as typeof UPLOAD_GENRES[number]) ? track.genre : "Custom";
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(track.title);
  const [genreOption, setGenreOption] = useState(initialGenre);
  const [customGenre, setCustomGenre] = useState(initialGenre === "Custom" ? track.genre : "");
  const [prompt, setPrompt] = useState(track.prompt);
  const [lyrics, setLyrics] = useState(track.lyrics);
  const [sourceUrl, setSourceUrl] = useState(track.source_url ?? track.audio_url);
  const [createdWith, setCreatedWith] = useState<CreatedWith | "">(track.created_with ?? "");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(track.is_published ?? true);

  const isOwner = Boolean(user && track.user_id && user.id === track.user_id);
  if (!isOwner && !isAdmin) return null;

  const refresh = () => queryClient.invalidateQueries();
  const uploadAudio = async (file: File) => {
    const { data } = await supabase.auth.getSession();
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}, body });
    const value = await response.json() as { key?: string; url?: string; error?: string };
    if (!response.ok || !value.key || !value.url) throw new Error(value.error ?? t("owner.audioUploadFailed"));
    return value as { key: string; url: string };
  };
  const uploadCover = async (file: File) => {
    if (!user) throw new Error(t("studio.signInCover"));
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("track-covers").upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw new Error(t("owner.coverUploadFailed"));
    return { path, url: supabase.storage.from("track-covers").getPublicUrl(path).data.publicUrl };
  };
  const save = async () => {
    const genre = genreOption === "Custom" ? customGenre.trim() : genreOption;
    if (!title.trim()) return setError(t("owner.titleRequired"));
    if (!genre || genre.length > 60) return setError(t("owner.genreRequired"));
    if (isUpload && !createdWith) return setError(language === "el" ? "Επίλεξε με ποια πλατφόρμα δημιουργήθηκε το τραγούδι." : "Select which platform created the track.");
    if (!isUpload && sourceType !== "legacy_link" && !isSupportedExternalTrackUrl(sourceType, sourceUrl)) return setError(t("owner.validLink", { provider: providerName(sourceType) }));
    setBusy(true); setError(null);
    let audio: { key: string; url: string } | null = null;
    let cover: { path: string; url: string } | null = null;
    try {
      if (isUpload && audioFile) audio = await uploadAudio(audioFile);
      if (isUpload && coverFile) cover = await uploadCover(coverFile);
      await updateTrack({ data: { id: track.id, title: title.trim(), genre, prompt, lyrics, is_published: isPublished, source_type: sourceType, created_with: isUpload ? createdWith || null : null, ...(isUpload || sourceType === "legacy_link" ? {} : { source_url: sourceUrl }), ...(audio ? { new_audio_key: audio.key, new_audio_url: audio.url } : {}), ...(cover ? { new_cover_url: cover.url } : {}) } });
      await refresh(); setEditing(false); setAudioFile(null); setCoverFile(null);
    } catch (err) {
      if (audio || cover) try { await discardUploads({ data: { audioKey: audio?.key, coverPath: cover?.path } }); } catch { /* durable cleanup */ }
      setError(err instanceof Error ? err.message : t("owner.saveFailed"));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deleteTrack({ data: { id: track.id } }); await refresh(); setConfirming(false); }
    catch (err) { setError(err instanceof Error ? err.message : t("owner.deleteFailed")); }
    finally { setBusy(false); }
  };
  const buttonClass = "grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent " + (compact ? "h-7 w-7" : "h-8 w-8");

  const editModal = editing && typeof document !== "undefined" && createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-track-title">
      <div className="glass-strong max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7">
        <header className="flex items-center justify-between"><h2 id="edit-track-title" className="font-display text-lg font-bold">{t("owner.editTitle")}</h2><button aria-label={t("common.close")} onClick={() => setEditing(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button></header>
        <div className="mt-5 space-y-4">
          <p className="text-xs uppercase tracking-widest text-accent">{t("owner.source", { provider: providerName(sourceType) })} <span className="text-muted-foreground">({t("owner.immutable")})</span></p>
          {!isUpload && sourceType !== "legacy_link" && <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" aria-label={`${providerName(sourceType)} link`} className={inputCls} />}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} aria-label={t("owner.trackTitle")} className={inputCls} />
          <fieldset className="flex items-center gap-2" aria-label={t("owner.visibility")}><legend className="mr-1 text-xs text-muted-foreground">{t("owner.visibility")}</legend>{([true, false] as const).map((value) => <button key={String(value)} type="button" onClick={() => setIsPublished(value)} aria-pressed={isPublished === value} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${isPublished === value ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{value ? t("common.public") : t("common.private")}</button>)}</fieldset>
          <select value={genreOption} onChange={(event) => setGenreOption(event.target.value)} aria-label={t("owner.musicGenre")} className={inputCls}>{UPLOAD_GENRES.map((genre) => <option key={genre} value={genre} className="bg-[#0a0a0c]">{localizedGenreLabel(genre, t)}</option>)}</select>
          {genreOption === "Custom" && <input value={customGenre} onChange={(event) => setCustomGenre(event.target.value)} maxLength={60} placeholder={t("owner.customGenre")} aria-label={t("owner.customGenre")} className={inputCls} />}
          {isUpload && <label className="block text-xs text-muted-foreground">{language === "el" ? "Δημιουργήθηκε με" : "Created with"}<select value={createdWith} onChange={(event) => setCreatedWith(event.target.value as CreatedWith)} className={`${inputCls} mt-1.5`}><option value="" disabled className="bg-[#0a0a0c]">{language === "el" ? "Επίλεξε πλατφόρμα" : "Select platform"}</option>{CREATED_WITH_OPTIONS.map((option) => <option key={option} value={option} className="bg-[#0a0a0c]">{option}</option>)}</select></label>}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} rows={3} aria-label={t("owner.stylePrompt")} className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none focus:border-primary/60" />
          <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} maxLength={8000} rows={5} aria-label={t("owner.lyrics")} className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none focus:border-primary/60" />
          {isUpload && <>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3 text-sm text-muted-foreground"><Music className="h-4 w-4" /><span>{audioFile ? t("owner.replaceAudioSelected", { name: audioFile.name }) : t("owner.replaceAudio")}</span><input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} className="hidden" /></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3 text-sm text-muted-foreground"><ImagePlus className="h-4 w-4" /><span>{coverFile ? t("owner.replaceCoverSelected", { name: coverFile.name }) : t("owner.replaceCover")}</span><input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} className="hidden" /></label>
          </>}
          {error && <p className="text-center text-xs text-destructive">{error}</p>}
          <div className="flex gap-3"><button onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? t("owner.saving") : t("owner.save")}</button><button onClick={() => setEditing(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground">{t("owner.cancel")}</button></div>
        </div>
      </div>
    </div>, document.body,
  );

  const deleteModal = confirming && typeof document !== "undefined" && createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-track-title">
      <div className="glass-strong w-full max-w-sm space-y-4 rounded-3xl p-6">
        <h2 id="delete-track-title" className="font-display text-lg font-bold">{t("owner.deleteNamed", { title: track.title })}</h2>
        <p className="text-sm text-muted-foreground">{t("owner.deletePermanent")}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-3">
          <button onClick={remove} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("owner.confirmDelete")}</button>
          <button onClick={() => setConfirming(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground">{t("owner.cancel")}</button>
        </div>
      </div>
    </div>, document.body,
  );

  return <>
    <div className="flex shrink-0 items-center gap-1.5">{isOwner && <button aria-label={t("owner.editTrack")} onClick={() => setEditing(true)} className={buttonClass}><Pencil className="h-3.5 w-3.5" /></button>}<button aria-label={t("owner.deleteTrack")} onClick={() => setConfirming(true)} className={buttonClass + " hover:border-destructive/60 hover:text-destructive"}><Trash2 className="h-3.5 w-3.5" /></button></div>
    {editModal}
    {deleteModal}
  </>;
}
