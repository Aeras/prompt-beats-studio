import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, UserRoundPen, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlayer } from "@/lib/player";
import { updateMyProfile } from "@/lib/profile.functions";
import { useI18n } from "@/i18n";
import { DonationSettingsEditor } from "@/components/promptbeats/DonationSettingsEditor";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { AVATAR_ACCEPT, validateAvatarFile } from "@/lib/avatar-upload";
import { getSafeExternalUrl, type SupportedSocialPlatform } from "@/lib/safe-external-url";

type EditableProfile = {
  id: string;
  artist_alias: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  x_url?: string | null;
  youtube_url?: string | null;
  profile_completed?: boolean;
};

type UrlField = "website" | "instagram" | "tiktok" | "x" | "youtube";
type UrlErrors = Partial<Record<UrlField, string>>;

const inputClass = (invalid = false) =>
  `h-11 w-full rounded-xl border bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground ${
    invalid
      ? "border-destructive/80 shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_18%,transparent)] focus:border-destructive"
      : "border-white/10 focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
  }`;

function isValidProfileUrl(value: string, platform?: SupportedSocialPlatform) {
  const normalized = value.trim();
  return !normalized || Boolean(getSafeExternalUrl(normalized, platform));
}

export function EditProfileModal({ profile }: { profile: EditableProfile }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { setPlayerMode } = usePlayer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [youtube, setYoutube] = useState("");
  const [urlErrors, setUrlErrors] = useState<UrlErrors>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = () => {
    setName(profile.artist_alias || profile.display_name || "");
    setBio(profile.bio || "");
    setWebsite(profile.website_url || "");
    setInstagram(profile.instagram_url || "");
    setTiktok(profile.tiktok_url || "");
    setXUrl(profile.x_url || "");
    setYoutube(profile.youtube_url || "");
    setUrlErrors({});
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
    setPlayerMode("hidden");
    setOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    setPlayerMode("fixed");
  };

  const clearUrlErrorIfValid = (
    field: UrlField,
    value: string,
    platform?: SupportedSocialPlatform,
  ) => {
    if (!urlErrors[field] || !isValidProfileUrl(value, platform)) return;
    setUrlErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  };

  useEffect(() => () => setPlayerMode("fixed"), [setPlayerMode]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const trackPlayers = Array.from(document.querySelectorAll<HTMLAudioElement>("audio[controls]"));
    const previousVisibility = trackPlayers.map((player) => player.style.visibility);
    trackPlayers.forEach((player) => {
      player.style.visibility = "hidden";
    });
    return () => {
      trackPlayers.forEach((player, index) => {
        player.style.visibility = previousVisibility[index] ?? "";
      });
    };
  }, [open]);

  if (!user || user.id !== profile.id) return null;

  const pickAvatar = (file: File | null) => {
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const save = async () => {
    const nextUrlErrors: UrlErrors = {};
    if (!isValidProfileUrl(website)) nextUrlErrors.website = t("editProfile.invalidWebsiteUrl");
    if (!isValidProfileUrl(instagram, "instagram"))
      nextUrlErrors.instagram = t("editProfile.invalidInstagramUrl");
    if (!isValidProfileUrl(tiktok, "tiktok"))
      nextUrlErrors.tiktok = t("editProfile.invalidTiktokUrl");
    if (!isValidProfileUrl(xUrl, "x")) nextUrlErrors.x = t("editProfile.invalidTwitterUrl");
    if (!isValidProfileUrl(youtube, "youtube"))
      nextUrlErrors.youtube = t("editProfile.invalidYoutubeUrl");

    if (Object.keys(nextUrlErrors).length > 0) {
      const message = t("editProfile.fixHighlightedFields");
      setUrlErrors(nextUrlErrors);
      setError(message);
      toast.error(message);
      return;
    }

    setUrlErrors({});
    setBusy(true);
    setError(null);
    try {
      let avatarUrl = profile.avatar_url;
      if (avatarFile) {
        const ext = validateAvatarFile(avatarFile);
        const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;
        const avatarBucket = supabase.storage.from("avatars");
        const { error: uploadError } = await avatarBucket.upload(filePath, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
        });
        if (uploadError) throw uploadError;
        const { data: signed, error: signedUrlError } = await avatarBucket.createSignedUrl(
          filePath,
          60 * 60 * 24 * 365,
        );
        if (signedUrlError) throw signedUrlError;
        avatarUrl = signed?.signedUrl ?? null;
        if (!avatarUrl) throw new Error(t("editProfile.avatarUrlError"));
      }

      const profilePatch = {
        profile_completed: Boolean(name.trim()) && Boolean(avatarUrl),
        artist_alias: name.trim(),
        display_name: name.trim(),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        bio: bio.trim(),
        website_url: website.trim() || null,
        instagram_url: instagram.trim() || null,
        tiktok_url: tiktok.trim() || null,
        x_url: xUrl.trim() || null,
        youtube_url: youtube.trim() || null,
      };
      const { profile: savedProfile } = await updateMyProfile({ data: profilePatch });
      if (!savedProfile) throw new Error(t("editProfile.noSavedProfile"));

      queryClient.setQueriesData(
        {
          predicate: ({ queryKey }) =>
            queryKey[0] === "public-artist" ||
            queryKey[0] === "public-artist-handle" ||
            queryKey[0] === "public-profile",
        },
        (current: unknown) => {
          if (!current || typeof current !== "object" || !("profile" in current)) return current;
          const result = current as { profile: EditableProfile | null; tracks?: unknown[] };
          if (result.profile?.id !== user.id) return current;
          return { ...result, profile: { ...result.profile, ...savedProfile } };
        },
      );
      window.dispatchEvent(
        new CustomEvent("promptbeats:profile-updated", { detail: savedProfile }),
      );
      await queryClient.invalidateQueries({ refetchType: "active" });
      toast.success(t("editProfile.saved"));
      setOpen(false);
      setPlayerMode("fixed");
    } catch (err: unknown) {
      console.error("Avatar/profile update failed:", err);
      const knownMessage =
        err instanceof Error &&
        (err.message === t("editProfile.avatarUrlError") ||
          err.message === t("editProfile.noSavedProfile"))
          ? err.message
          : t("editProfile.error");
      setError(knownMessage);
      toast.error(knownMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
      >
        <UserRoundPen className="h-3.5 w-3.5" /> {t("profile.edit")}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-2 backdrop-blur-md sm:p-4 lg:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={t("editProfile.title")}
            onClick={() => closeModal()}
          >
            <div
              className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0f] shadow-2xl sm:max-h-[92vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="font-display text-xl font-bold">{t("editProfile.title")}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("editProfile.settingsHint")}
                  </p>
                </div>
                <button
                  aria-label={t("common.close")}
                  onClick={() => closeModal()}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                  <div className="space-y-5">
                    <section className="glass space-y-4 rounded-2xl border border-white/10 p-4 sm:p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                          {t("editProfile.profileSection")}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("editProfile.profileSectionHint")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <img
                          src={avatarPreview ?? getUserAvatarUrl(profile.avatar_url)}
                          alt={t("editProfile.avatarPreview")}
                          width={88}
                          height={88}
                          className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary/60 sm:h-24 sm:w-24"
                        />
                        <div className="min-w-0">
                          <p className="mb-2 text-xs font-medium text-foreground">
                            {t("editProfile.avatar")}
                          </p>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">
                            <Upload className="h-4 w-4" />
                            {avatarFile
                              ? avatarFile.name.slice(0, 28)
                              : t("editProfile.uploadAvatar")}
                            <input
                              type="file"
                              accept={AVATAR_ACCEPT}
                              className="hidden"
                              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </div>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-foreground">
                          {t("editProfile.displayName")}
                        </span>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value.slice(0, 60))}
                          placeholder={t("editProfile.displayName")}
                          className={inputClass()}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-foreground">
                          {t("editProfile.bio")}
                        </span>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value.slice(0, 500))}
                          placeholder={t("editProfile.bioPlaceholder")}
                          rows={5}
                          className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
                        />
                      </label>
                    </section>
                  </div>

                  <div className="space-y-5">
                    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                          {t("editProfile.socialSection")}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("editProfile.socialSectionHint")}
                        </p>
                      </div>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-foreground">
                          {t("editProfile.website")}
                        </span>
                        <input
                          value={website}
                          onChange={(e) => {
                            const value = e.target.value.slice(0, 300);
                            setWebsite(value);
                            clearUrlErrorIfValid("website", value);
                          }}
                          placeholder={t("editProfile.websiteOptional")}
                          inputMode="url"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={Boolean(urlErrors.website)}
                          aria-describedby={urlErrors.website ? "website-url-error" : undefined}
                          className={inputClass(Boolean(urlErrors.website))}
                        />
                        {urlErrors.website && (
                          <span
                            id="website-url-error"
                            className="block text-[11px] text-destructive"
                            role="alert"
                          >
                            {urlErrors.website}
                          </span>
                        )}
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-2">
                          <span className="text-xs font-medium text-foreground">
                            {t("editProfile.instagram")}
                          </span>
                          <input
                            value={instagram}
                            onChange={(e) => {
                              const value = e.target.value.slice(0, 300);
                              setInstagram(value);
                              clearUrlErrorIfValid("instagram", value, "instagram");
                            }}
                            placeholder={t("editProfile.instagramOptional")}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={Boolean(urlErrors.instagram)}
                            aria-describedby={
                              urlErrors.instagram ? "instagram-url-error" : undefined
                            }
                            className={inputClass(Boolean(urlErrors.instagram))}
                          />
                          {urlErrors.instagram && (
                            <span
                              id="instagram-url-error"
                              className="block text-[11px] text-destructive"
                              role="alert"
                            >
                              {urlErrors.instagram}
                            </span>
                          )}
                        </label>
                        <label className="block space-y-2">
                          <span className="text-xs font-medium text-foreground">
                            {t("editProfile.tiktok")}
                          </span>
                          <input
                            value={tiktok}
                            onChange={(e) => {
                              const value = e.target.value.slice(0, 300);
                              setTiktok(value);
                              clearUrlErrorIfValid("tiktok", value, "tiktok");
                            }}
                            placeholder={t("editProfile.tiktokOptional")}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={Boolean(urlErrors.tiktok)}
                            aria-describedby={urlErrors.tiktok ? "tiktok-url-error" : undefined}
                            className={inputClass(Boolean(urlErrors.tiktok))}
                          />
                          {urlErrors.tiktok && (
                            <span
                              id="tiktok-url-error"
                              className="block text-[11px] text-destructive"
                              role="alert"
                            >
                              {urlErrors.tiktok}
                            </span>
                          )}
                        </label>
                        <label className="block space-y-2">
                          <span className="text-xs font-medium text-foreground">
                            {t("editProfile.twitter")}
                          </span>
                          <input
                            value={xUrl}
                            onChange={(e) => {
                              const value = e.target.value.slice(0, 300);
                              setXUrl(value);
                              clearUrlErrorIfValid("x", value, "x");
                            }}
                            placeholder={t("editProfile.twitterOptional")}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={Boolean(urlErrors.x)}
                            aria-describedby={urlErrors.x ? "x-url-error" : undefined}
                            className={inputClass(Boolean(urlErrors.x))}
                          />
                          {urlErrors.x && (
                            <span
                              id="x-url-error"
                              className="block text-[11px] text-destructive"
                              role="alert"
                            >
                              {urlErrors.x}
                            </span>
                          )}
                        </label>
                        <label className="block space-y-2">
                          <span className="text-xs font-medium text-foreground">
                            {t("editProfile.youtube")}
                          </span>
                          <input
                            value={youtube}
                            onChange={(e) => {
                              const value = e.target.value.slice(0, 300);
                              setYoutube(value);
                              clearUrlErrorIfValid("youtube", value, "youtube");
                            }}
                            placeholder={t("editProfile.youtubeOptional")}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={Boolean(urlErrors.youtube)}
                            aria-describedby={urlErrors.youtube ? "youtube-url-error" : undefined}
                            className={inputClass(Boolean(urlErrors.youtube))}
                          />
                          {urlErrors.youtube && (
                            <span
                              id="youtube-url-error"
                              className="block text-[11px] text-destructive"
                              role="alert"
                            >
                              {urlErrors.youtube}
                            </span>
                          )}
                        </label>
                      </div>
                    </section>

                    <DonationSettingsEditor showSectionHeader />
                  </div>
                </div>
                {error && (
                  <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-white/10 bg-black/30 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={() => closeModal()}
                  disabled={busy}
                  className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={save}
                  disabled={busy || !name.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-6 py-2.5 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? t("profile.saving") : t("editProfile.saveChanges")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
