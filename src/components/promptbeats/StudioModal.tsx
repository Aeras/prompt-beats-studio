import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Music,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { UPLOAD_GENRES } from "@/lib/tracks";
import { CREATED_WITH_OPTIONS, type CreatedWith } from "@/lib/created-with";
import { isSupportedExternalTrackUrl, type TrackSourceType } from "@/lib/track-sources";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createTrack, discardUploads } from "@/lib/tracks.functions";
import {
  checkTrackDuplicate,
  createUploadedTrackWithIdentity,
} from "@/lib/track-duplicate.functions";
import { computeAudioIdentity } from "@/lib/audio-identity";
import { useModeration } from "@/hooks/useModeration";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { localizedGenreLabel } from "@/i18n/ui-catalog";
import { COVER_ACCEPT, validateCoverFile } from "@/lib/cover-upload";
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  useAccountPreferences,
  type AccountPreferences,
} from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";

type Row = {
  key: string;
  file: File | null;
  cover: File | null;
  sourceType: TrackSourceType;
  sourceUrl: string;
  title: string;
  genre: string;
  customGenre: string;
  createdWith: CreatedWith | "";
  isPublished: boolean;
  promptIsPublic: boolean;
  lyricsIsPublic: boolean;
  allowDownload: boolean;
  containsExplicitLyrics: boolean;
  prompt: string;
  lyrics: string;
};

type RowDraft = Omit<Row, "file" | "cover">;

type DuplicateCheck = {
  status: "idle" | "checking" | "unique" | "duplicate" | "similar" | "error";
  contentHash?: string;
  fingerprint?: string;
  durationSeconds?: number;
  duplicateTitle?: string;
  confirmedSimilar?: boolean;
  message?: string;
};

type SubmitTrackDefaults = Pick<
  AccountPreferences,
  "trackPublished" | "promptPublic" | "lyricsPublic" | "allowDownload"
>;

const emptyRow = (defaults: SubmitTrackDefaults = DEFAULT_ACCOUNT_PREFERENCES): Row => ({
  key: Math.random().toString(36).slice(2),
  file: null,
  cover: null,
  sourceType: "upload",
  sourceUrl: "",
  title: "",
  genre: "",
  customGenre: "",
  createdWith: "",
  isPublished: defaults.trackPublished,
  promptIsPublic: defaults.promptPublic,
  lyricsIsPublic: defaults.lyricsPublic,
  allowDownload: defaults.allowDownload,
  containsExplicitLyrics: false,
  prompt: "",
  lyrics: "",
});

const stripExt = (name: string) => name.replace(/\.(mp3|wav)$/i, "");
const inputCls =
  "h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

export function StudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { preferences } = useAccountPreferences();
  const { isBanned } = useModeration();
  const uploadAccess = useFeatureAccess("track_uploads");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [duplicateChecks, setDuplicateChecks] = useState<Record<string, DuplicateCheck>>({});
  const checkRequestRef = useRef<Record<string, string>>({});
  const initialDefaultsAppliedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const serializableRows = useMemo<RowDraft[]>(
    () => rows.map(({ file: _file, cover: _cover, ...row }) => row),
    [rows],
  );

  const clearStudioDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "submit-track",
    enabled: open && preferences.autoSaveDrafts,
    value: serializableRows,
    onRestore: (saved) => {
      setRows(saved.map((row) => ({ ...row, file: null, cover: null })));
      setDuplicateChecks({});
    },
    isEmpty: (saved) =>
      saved.length === 1 &&
      !saved[0]?.sourceUrl.trim() &&
      !saved[0]?.title.trim() &&
      !saved[0]?.genre &&
      !saved[0]?.customGenre.trim() &&
      !saved[0]?.prompt.trim() &&
      !saved[0]?.lyrics.trim(),
  });

  useEffect(() => {
    if (!open || initialDefaultsAppliedRef.current) return;
    initialDefaultsAppliedRef.current = true;
    setRows([emptyRow(preferences)]);
    setDuplicateChecks({});
    setStatus(null);
  }, [open, preferences]);

  useEffect(() => {
    if (!open || uploadAccess.isLoading || uploadAccess.allowed) return;
    setRows((current) =>
      current.map((row) =>
        row.sourceType === "upload"
          ? {
              ...row,
              sourceType: "suno",
              file: null,
              cover: null,
              createdWith: "",
              allowDownload: false,
            }
          : row,
      ),
    );
    setDuplicateChecks({});
  }, [open, uploadAccess.allowed, uploadAccess.isLoading]);

  if (!open) return null;

  const createdWithLabel = language === "el" ? "Δημιουργήθηκε με" : "Created with";
  const selectCreatedWith = language === "el" ? "Επίλεξε πλατφόρμα" : "Select platform";
  const createdWithRequired =
    language === "el"
      ? "Επίλεξε με ποια πλατφόρμα δημιουργήθηκε το uploaded τραγούδι."
      : "Select which platform created the uploaded track.";
  const allowDownloadLabel = language === "el" ? "Επιτρέπεται λήψη" : "Allow download";
  const allowDownloadHint =
    language === "el"
      ? "Να μπορούν οι άλλοι εγγεγραμμένοι χρήστες να κατεβάζουν το αρχείο."
      : "Allow other signed-in users to download the audio file.";

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const setCheck = (key: string, next: DuplicateCheck) =>
    setDuplicateChecks((current) => ({ ...current, [key]: next }));

  const clearCheck = (key: string) => {
    delete checkRequestRef.current[key];
    setCheck(key, { status: "idle" });
  };

  const pickFile = async (key: string, file: File | null) => {
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? { ...r, file, title: r.title.trim() ? r.title : file ? stripExt(file.name) : r.title }
          : r,
      ),
    );
    if (!file) {
      clearCheck(key);
      return;
    }
    if (!user) {
      setCheck(key, {
        status: "error",
        message:
          language === "el"
            ? "Συνδέσου πρώτα για να ελεγχθεί αν το τραγούδι υπάρχει ήδη στη βιβλιοθήκη σου."
            : "Sign in first so we can check whether this track is already in your library.",
      });
      return;
    }

    const requestId = crypto.randomUUID();
    checkRequestRef.current[key] = requestId;
    setCheck(key, { status: "checking" });
    try {
      const identity = await computeAudioIdentity(file);
      if (checkRequestRef.current[key] !== requestId) return;
      const result = await checkTrackDuplicate({
        data: {
          sourceType: "upload",
          contentHash: identity.contentHash,
          fingerprint: identity.fingerprint,
          durationSeconds: identity.durationSeconds,
        },
      });
      if (checkRequestRef.current[key] !== requestId) return;
      setCheck(key, {
        status: result.status,
        contentHash: identity.contentHash,
        fingerprint: identity.fingerprint,
        durationSeconds: identity.durationSeconds,
        duplicateTitle: result.duplicate?.title ?? undefined,
        confirmedSimilar: false,
      });
    } catch (error) {
      if (checkRequestRef.current[key] !== requestId) return;
      setCheck(key, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : language === "el"
              ? "Δεν ήταν δυνατός ο έλεγχος του αρχείου."
              : "The audio file could not be checked.",
      });
    }
  };

  const checkExternal = async (row: Row) => {
    const sourceUrl = row.sourceUrl.trim();
    if (!sourceUrl) {
      clearCheck(row.key);
      return;
    }
    if (!isSupportedExternalTrackUrl(row.sourceType, sourceUrl)) {
      setCheck(row.key, {
        status: "error",
        message:
          language === "el"
            ? "Ο σύνδεσμος δεν είναι έγκυρος για την επιλεγμένη πλατφόρμα."
            : "The link is not valid for the selected platform.",
      });
      return;
    }
    if (!user) {
      setCheck(row.key, {
        status: "error",
        message:
          language === "el"
            ? "Συνδέσου πρώτα για να ελεγχθεί αν το τραγούδι υπάρχει ήδη στη βιβλιοθήκη σου."
            : "Sign in first so we can check whether this track is already in your library.",
      });
      return;
    }

    const requestId = crypto.randomUUID();
    checkRequestRef.current[row.key] = requestId;
    setCheck(row.key, { status: "checking" });
    try {
      const result = await checkTrackDuplicate({
        data: {
          sourceType: row.sourceType as "suno" | "udio",
          sourceUrl,
        },
      });
      if (checkRequestRef.current[row.key] !== requestId) return;
      setCheck(row.key, {
        status: result.status === "invalid" ? "error" : result.status,
        duplicateTitle: result.duplicate?.title ?? undefined,
        message:
          result.status === "invalid"
            ? language === "el"
              ? "Ο σύνδεσμος δεν μπόρεσε να επαληθευτεί."
              : "The link could not be verified."
            : undefined,
      });
    } catch (error) {
      if (checkRequestRef.current[row.key] !== requestId) return;
      setCheck(row.key, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : language === "el"
              ? "Δεν ήταν δυνατός ο έλεγχος του συνδέσμου."
              : "The link could not be checked.",
      });
    }
  };

  const rowCanContinue = (row: Row) => {
    const check = duplicateChecks[row.key];
    if (!check) return false;
    if (check.status === "unique") return true;
    return check.status === "similar" && check.confirmedSimilar === true;
  };

  const uploadOne = async (file: File, token: string | undefined) => {
    if (!uploadAccess.allowed)
      throw new Error(
        language === "el"
          ? "Οι μεταφορτώσεις τραγουδιών δεν είναι διαθέσιμες."
          : "Track uploads are not available.",
      );
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const payload = (await res.json()) as { url?: string; key?: string; error?: string };
    if (!res.ok || !payload.url) throw new Error(payload.error ?? t("studio.uploadFailed"));
    return payload;
  };

  const uploadCover = async (file: File): Promise<{ url: string; path: string }> => {
    if (!user) throw new Error(t("studio.signInCover"));
    const ext = validateCoverFile(file);
    const path = `${user.id}/${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("track-covers")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error(t("studio.coverFailed", { message: error.message }));
    const { data } = supabase.storage.from("track-covers").getPublicUrl(path);
    return { url: data.publicUrl, path };
  };

  const resolvedGenre = (row: Row) => (row.genre === "Custom" ? row.customGenre.trim() : row.genre);

  const publishRow = async (r: Row, token: string | undefined) => {
    let audioKey: string | undefined;
    let coverPath: string | undefined;
    let coverUrl: string | undefined;
    try {
      if (r.sourceType !== "upload") {
        const provider = r.sourceType === "suno" ? "Suno" : "Udio";
        if (!isSupportedExternalTrackUrl(r.sourceType, r.sourceUrl))
          throw new Error(t("studio.validProviderLink", { provider }));
        await createTrack({
          data: {
            title: r.title.trim(),
            genre: resolvedGenre(r),
            prompt: r.prompt,
            lyrics: r.lyrics,
            audio_url: r.sourceUrl,
            audio_type: "link",
            source_type: r.sourceType,
            created_with: null,
            is_published: r.isPublished,
            prompt_is_public: r.promptIsPublic,
            lyrics_is_public: r.lyricsIsPublic,
            contains_explicit_lyrics: r.containsExplicitLyrics,
            allow_download: false,
          },
        });
        return;
      }

      if (!uploadAccess.allowed)
        throw new Error(
          language === "el"
            ? "Οι μεταφορτώσεις τραγουδιών δεν είναι διαθέσιμες."
            : "Track uploads are not available.",
        );

      const identity = duplicateChecks[r.key];
      if (
        !identity?.contentHash ||
        !identity.fingerprint ||
        identity.durationSeconds == null ||
        !rowCanContinue(r)
      ) {
        throw new Error(
          language === "el"
            ? "Το αρχείο ήχου πρέπει πρώτα να ελεγχθεί για διπλότυπο."
            : "The audio file must be checked for duplicates first.",
        );
      }

      const payload = await uploadOne(r.file!, token);
      audioKey = payload.key;
      if (!audioKey) throw new Error(t("studio.uploadFailed"));
      if (r.cover) {
        const cover = await uploadCover(r.cover);
        coverPath = cover.path;
        coverUrl = cover.url;
      }
      if (!r.createdWith) throw new Error(createdWithRequired);

      await createUploadedTrackWithIdentity({
        data: {
          title: r.title.trim(),
          genre: resolvedGenre(r),
          prompt: r.prompt,
          lyrics: r.lyrics,
          audio_url: payload.url!,
          audio_key: audioKey,
          created_with: r.createdWith,
          duration_seconds: identity.durationSeconds,
          audio_content_hash: identity.contentHash,
          audio_fingerprint: identity.fingerprint,
          ...(coverUrl ? { cover_url: coverUrl } : {}),
          is_published: r.isPublished,
          prompt_is_public: r.promptIsPublic,
          lyrics_is_public: r.lyricsIsPublic,
          contains_explicit_lyrics: r.containsExplicitLyrics,
          allow_download: r.allowDownload,
        },
      });
    } catch (err) {
      if (audioKey || coverPath) {
        try {
          await discardUploads({ data: { audioKey, coverPath } });
        } catch {
          /* cleanup failure logged server-side */
        }
      }
      throw err;
    }
  };

  const uploadAll = async () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (isBanned) {
      setStatus(t("studio.suspended"));
      return;
    }
    setStatus(null);
    for (const r of rows) {
      if (r.sourceType === "upload" && !r.file) return setStatus(t("studio.fileRequired"));
      if (!rowCanContinue(r)) {
        return setStatus(
          language === "el"
            ? "Έλεγξε πρώτα το αρχείο ή τον σύνδεσμο για να συνεχίσεις."
            : "Check the audio file or link for duplicates before continuing.",
        );
      }
      if (r.sourceType === "upload" && !r.createdWith) return setStatus(createdWithRequired);
      if (r.sourceType !== "upload" && !isSupportedExternalTrackUrl(r.sourceType, r.sourceUrl))
        return setStatus(
          t("studio.providerRequired", { provider: r.sourceType === "suno" ? "Suno" : "Udio" }),
        );
      if (!r.title.trim()) return setStatus(t("studio.titleRequired"));
      if (!r.genre) return setStatus(t("studio.genreRequired"));
      if (r.genre === "Custom" && (!r.customGenre.trim() || r.customGenre.trim().length > 60))
        return setStatus(t("studio.customGenreRequired"));
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      let done = 0;
      for (const r of rows) {
        setStatus(t("studio.publishing", { current: done + 1, total: rows.length }));
        await publishRow(r, token);
        done += 1;
      }
      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      setStatus(t("studio.published", { count: rows.length }));
      clearStudioDraft();
      setRows([emptyRow(preferences)]);
      setDuplicateChecks({});
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("auth.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const renderDuplicateState = (row: Row) => {
    const check = duplicateChecks[row.key] ?? { status: "idle" as const };
    if (check.status === "idle") return null;
    if (check.status === "checking") {
      return (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {language === "el"
            ? "Έλεγχος αν υπάρχει ήδη στη βιβλιοθήκη σου…"
            : "Checking your library for duplicates…"}
        </div>
      );
    }
    if (check.status === "unique") {
      return (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {language === "el"
            ? "Έτοιμο — δεν βρέθηκε ίδιο τραγούδι στη βιβλιοθήκη σου."
            : "Ready — no matching track was found in your library."}
        </div>
      );
    }
    if (check.status === "duplicate") {
      return (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {language === "el"
              ? `Το τραγούδι υπάρχει ήδη στη βιβλιοθήκη σου${check.duplicateTitle ? ` ως «${check.duplicateTitle}»` : ""}. Δεν χρειάζεται να το ανεβάσεις ξανά.`
              : `This track is already in your library${check.duplicateTitle ? ` as “${check.duplicateTitle}”` : ""}. You do not need to upload it again.`}
          </span>
        </div>
      );
    }
    if (check.status === "similar") {
      return (
        <div className="space-y-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {language === "el"
                ? `Βρέθηκε πολύ παρόμοιο audio στη βιβλιοθήκη σου${check.duplicateTitle ? ` («${check.duplicateTitle}»)` : ""}. Μπορεί να είναι άλλη έκδοση του ίδιου τραγουδιού.`
                : `Very similar audio was found in your library${check.duplicateTitle ? ` (“${check.duplicateTitle}”)` : ""}. It may be another version of the same track.`}
            </span>
          </div>
          {!check.confirmedSimilar && (
            <button
              type="button"
              onClick={() =>
                setCheck(row.key, {
                  ...check,
                  confirmedSimilar: true,
                })
              }
              className="rounded-xl border border-amber-400/40 px-3 py-2 font-medium text-amber-100 transition-colors hover:bg-amber-400/10"
            >
              {language === "el"
                ? "Είναι διαφορετική έκδοση — συνέχεια"
                : "It is a different version — continue"}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-xs text-destructive">
        {check.message ??
          (language === "el"
            ? "Δεν ήταν δυνατός ο έλεγχος. Δοκίμασε ξανά."
            : "The duplicate check failed. Please try again.")}
      </div>
    );
  };

  return (
    <div
      data-pb-bottom-safe="true"
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:inset-0 sm:items-center sm:p-6"
    >
      <div className="glass-strong max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-neon glow-neon">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{t("studio.title")}</h2>
              <p className="truncate text-xs text-muted-foreground">{t("studio.subtitle")}</p>
            </div>
          </div>
          <button
            aria-label={t("studio.close")}
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {isBanned && (
          <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {t("studio.suspended")}
          </p>
        )}

        {!isBanned && (
          <div className="mt-6 space-y-5">
            {rows.map((r, i) => {
              const canContinue = rowCanContinue(r);
              return (
                <section
                  key={r.key}
                  className="space-y-3 rounded-3xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-widest text-accent">
                      {t("studio.track", { number: i + 1 })}
                    </p>
                    {rows.length > 1 && (
                      <button
                        aria-label={t("studio.removeTrack", { number: i + 1 })}
                        onClick={() => {
                          setRows((rs) => rs.filter((x) => x.key !== r.key));
                          setDuplicateChecks((current) => {
                            const next = { ...current };
                            delete next[r.key];
                            return next;
                          });
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <label className="block text-xs text-muted-foreground">
                    {t("studio.audioSource")}
                    <select
                      value={r.sourceType}
                      onChange={(e) => {
                        update(r.key, {
                          sourceType: e.target.value as TrackSourceType,
                          file: null,
                          cover: null,
                          sourceUrl: "",
                          createdWith: "",
                          allowDownload:
                            e.target.value === "upload" ? preferences.allowDownload : false,
                        });
                        clearCheck(r.key);
                      }}
                      aria-label={`${t("studio.track", { number: i + 1 })} ${t("studio.audioSource")}`}
                      className="mt-1.5 h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-foreground outline-none focus:border-accent/60"
                    >
                      <option
                        value="upload"
                        disabled={!uploadAccess.allowed}
                        className="bg-[#0a0a0c]"
                      >
                        {t("studio.uploadFile")}
                      </option>
                      <option value="suno" className="bg-[#0a0a0c]">
                        Suno
                      </option>
                      <option value="udio" className="bg-[#0a0a0c]">
                        Udio
                      </option>
                    </select>
                  </label>

                  {r.sourceType === "upload" ? (
                    <>
                      <label
                        htmlFor={`pb-audio-${r.key}`}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Music className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {r.file ? r.file.name : t("studio.chooseAudio")}
                        </span>
                      </label>
                      <input
                        id={`pb-audio-${r.key}`}
                        type="file"
                        accept=".mp3,.wav,audio/mpeg,audio/wav"
                        onChange={(e) => void pickFile(r.key, e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                    </>
                  ) : (
                    <input
                      value={r.sourceUrl}
                      onChange={(e) => {
                        update(r.key, { sourceUrl: e.target.value });
                        clearCheck(r.key);
                      }}
                      onBlur={() => void checkExternal(r)}
                      placeholder={`${r.sourceType === "suno" ? "Suno" : "Udio"} Link`}
                      aria-label={`${t("studio.track", { number: i + 1 })} ${r.sourceType} link`}
                      type="url"
                      className={inputCls}
                    />
                  )}

                  {renderDuplicateState(r)}

                  {canContinue && (
                    <>
                      <fieldset
                        className="flex items-center gap-2"
                        aria-label={`${t("studio.track", { number: i + 1 })} ${t("studio.visibility")}`}
                      >
                        <legend className="mr-1 text-xs text-muted-foreground">
                          {t("studio.visibility")}
                        </legend>
                        {([true, false] as const).map((isPublished) => (
                          <button
                            key={String(isPublished)}
                            type="button"
                            onClick={() => update(r.key, { isPublished })}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${r.isPublished === isPublished ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground hover:text-foreground"}`}
                            aria-pressed={r.isPublished === isPublished}
                          >
                            {isPublished ? t("common.public") : t("common.private")}
                          </button>
                        ))}
                      </fieldset>

                      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={r.containsExplicitLyrics}
                          onChange={(e) =>
                            update(r.key, { containsExplicitLyrics: e.target.checked })
                          }
                          className="mt-0.5 h-4 w-4 accent-current"
                        />
                        <span>
                          <span className="block text-sm font-medium">{t("explicit.label")}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t("explicit.helper")}
                          </span>
                        </span>
                      </label>

                      {r.sourceType === "upload" && (
                        <>
                          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={r.allowDownload}
                              onChange={(e) => update(r.key, { allowDownload: e.target.checked })}
                              className="mt-0.5 h-4 w-4 accent-current"
                            />
                            <span>
                              <span className="block text-sm font-medium">
                                {allowDownloadLabel}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {allowDownloadHint}
                              </span>
                            </span>
                          </label>

                          <label
                            htmlFor={`pb-cover-${r.key}`}
                            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                          >
                            {r.cover ? (
                              <img
                                src={URL.createObjectURL(r.cover)}
                                alt={t("studio.coverPreview", { number: i + 1 })}
                                className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                              />
                            ) : (
                              <ImagePlus className="h-4 w-4 shrink-0" />
                            )}
                            <span className="truncate">
                              {r.cover ? r.cover.name : t("studio.cover")}
                            </span>
                          </label>
                          <input
                            id={`pb-cover-${r.key}`}
                            type="file"
                            accept={COVER_ACCEPT}
                            onChange={(e) => update(r.key, { cover: e.target.files?.[0] ?? null })}
                            className="hidden"
                          />

                          <label className="block text-xs text-muted-foreground">
                            {createdWithLabel}
                            <select
                              value={r.createdWith}
                              onChange={(e) =>
                                update(r.key, { createdWith: e.target.value as CreatedWith })
                              }
                              className="mt-1.5 h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                              <option value="" disabled className="bg-[#0a0a0c]">
                                {selectCreatedWith}
                              </option>
                              {CREATED_WITH_OPTIONS.map((option) => (
                                <option key={option} value={option} className="bg-[#0a0a0c]">
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={r.title}
                          onChange={(e) => update(r.key, { title: e.target.value })}
                          placeholder={t("studio.trackTitle")}
                          aria-label={`${t("studio.track", { number: i + 1 })} ${t("studio.trackTitle")}`}
                          className={inputCls}
                        />
                        <select
                          value={r.genre}
                          onChange={(e) => update(r.key, { genre: e.target.value })}
                          aria-label={`${t("studio.track", { number: i + 1 })} ${t("owner.musicGenre")}`}
                          className={
                            "h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm outline-none focus:border-accent/60 " +
                            (r.genre ? "text-foreground" : "text-muted-foreground")
                          }
                        >
                          <option value="" disabled className="bg-[#0a0a0c]">
                            {t("studio.selectGenre")}
                          </option>
                          {UPLOAD_GENRES.map((g) => (
                            <option key={g} value={g} className="bg-[#0a0a0c]">
                              {localizedGenreLabel(g, t)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {r.genre === "Custom" && (
                        <input
                          value={r.customGenre}
                          onChange={(e) => update(r.key, { customGenre: e.target.value })}
                          maxLength={60}
                          placeholder={t("studio.customGenre")}
                          aria-label={`${t("studio.track", { number: i + 1 })} ${t("studio.customGenre")}`}
                          className={inputCls}
                        />
                      )}

                      <div className="space-y-2">
                        <textarea
                          value={r.prompt}
                          onChange={(e) => update(r.key, { prompt: e.target.value })}
                          rows={3}
                          placeholder={t("studio.promptPlaceholder")}
                          aria-label={`${t("studio.track", { number: i + 1 })} Prompt`}
                          className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_25%,transparent)]"
                        />
                        <fieldset className="flex items-center gap-2">
                          <legend className="mr-1 text-xs text-muted-foreground">
                            {language === "el" ? "Ορατότητα Prompt" : "Prompt visibility"}
                          </legend>
                          {([true, false] as const).map((value) => (
                            <button
                              key={String(value)}
                              type="button"
                              onClick={() => update(r.key, { promptIsPublic: value })}
                              aria-pressed={r.promptIsPublic === value}
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${r.promptIsPublic === value ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground"}`}
                            >
                              {value ? t("common.public") : t("common.private")}
                            </button>
                          ))}
                        </fieldset>
                      </div>

                      <div className="space-y-2">
                        <textarea
                          value={r.lyrics}
                          onChange={(e) => update(r.key, { lyrics: e.target.value })}
                          rows={4}
                          placeholder={t("studio.lyricsPlaceholder")}
                          aria-label={`${t("studio.track", { number: i + 1 })} ${t("track.lyrics")}`}
                          className="w-full resize-y whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_25%,transparent)]"
                        />
                        <fieldset className="flex items-center gap-2">
                          <legend className="mr-1 text-xs text-muted-foreground">
                            {language === "el" ? "Ορατότητα Lyrics" : "Lyrics visibility"}
                          </legend>
                          {([true, false] as const).map((value) => (
                            <button
                              key={String(value)}
                              type="button"
                              onClick={() => update(r.key, { lyricsIsPublic: value })}
                              aria-pressed={r.lyricsIsPublic === value}
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${r.lyricsIsPublic === value ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground"}`}
                            >
                              {value ? t("common.public") : t("common.private")}
                            </button>
                          ))}
                        </fieldset>
                      </div>
                    </>
                  )}
                </section>
              );
            })}

            <button
              onClick={() => setRows((rs) => [...rs, emptyRow(preferences)])}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/40 px-4 py-3 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              <Plus className="h-4 w-4" /> {t("studio.addTrack")}
            </button>

            {status && <p className="text-center text-xs text-accent">{status}</p>}

            <button
              onClick={uploadAll}
              disabled={busy || isBanned}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {isBanned
                ? t("studio.uploadsDisabled")
                : user
                  ? t("studio.uploadAll")
                  : t("studio.signInUpload")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
