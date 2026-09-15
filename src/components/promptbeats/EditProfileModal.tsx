import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, Upload, UserRoundPen, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlayer } from "@/lib/player";
import { updateMyProfile } from "@/lib/profile.functions";
import { useI18n } from "@/i18n";
import { LanguageSelector } from "@/components/promptbeats/LanguageSelector";

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
  donation_provider?: string | null;
  donation_url?: string | null;
  profile_completed?: boolean;
};

const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

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
  const [paypalUrl, setPaypalUrl] = useState("");
  const [revolutUrl, setRevolutUrl] = useState("");
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
    setPaypalUrl(profile.donation_provider === "paypal" ? profile.donation_url || "" : "");
    setRevolutUrl(profile.donation_provider === "revolut" ? profile.donation_url || "" : "");
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

  useEffect(() => () => setPlayerMode("fixed"), [setPlayerMode]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const trackPlayers = Array.from(document.querySelectorAll<HTMLAudioElement>("audio[controls]"));
    const previousVisibility = trackPlayers.map((player) => player.style.visibility);
    trackPlayers.forEach((player) => { player.style.visibility = "hidden"; });
    return () => { trackPlayers.forEach((player, index) => { player.style.visibility = previousVisibility[index] ?? ""; }); };
  }, [open]);

  if (!user || user.id !== profile.id) return null;

  const pickAvatar = (file: File | null) => {
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let avatarUrl = profile.avatar_url;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;
        const avatarBucket = supabase.storage.from("avatars");
        const { error: uploadError } = await avatarBucket.upload(filePath, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(filePath).data.publicUrl;
        if (!avatarUrl) throw new Error(t("editProfile.avatarUrlError"));
      }

      const paypal = paypalUrl.trim();
      const revolut = revolutUrl.trim();
      const profilePatch = {
        profile_completed: Boolean(name.trim()) && Boolean(avatarUrl),
        artist_alias: name.trim(),
        display_name: name.trim(),
        avatar_url: avatarUrl,
        bio: bio.trim(),
        website_url: website.trim() || null,
        instagram_url: instagram.trim() || null,
        tiktok_url: tiktok.trim() || null,
        x_url: xUrl.trim() || null,
        youtube_url: youtube.trim() || null,
        donation_provider: paypal ? "paypal" : revolut ? "revolut" : null,
        donation_url: paypal || revolut || null,
        donation_custom_name: null,
      };
      const { profile: savedProfile } = await updateMyProfile({ data: profilePatch });
      if (!savedProfile) throw new Error(t("editProfile.noSavedProfile"));

      queryClient.setQueriesData(
        { predicate: ({ queryKey }) => queryKey[0] === "public-artist" || queryKey[0] === "public-artist-handle" || queryKey[0] === "public-profile" },
        (current: unknown) => {
          if (!current || typeof current !== "object" || !("profile" in current)) return current;
          const result = current as { profile: EditableProfile | null; tracks?: unknown[] };
          if (result.profile?.id !== user.id) return current;
          return { ...result, profile: { ...result.profile, ...savedProfile } };
        },
      );
      window.dispatchEvent(new CustomEvent("promptbeats:profile-updated", { detail: savedProfile }));
      await queryClient.invalidateQueries({ refetchType: "active" });
      toast.success(t("editProfile.saved"));
      setOpen(false);
      setPlayerMode("fixed");
    } catch (err: unknown) {
      const message = typeof err === "object" && err !== null && "message" in err && typeof err.message === "string" ? err.message : t("editProfile.error");
      console.error("Avatar/profile update failed:", err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={openModal} className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20">
        <UserRoundPen className="h-3.5 w-3.5" /> {t("profile.edit")}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={t("editProfile.title")} onClick={() => closeModal()}>
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">{t("editProfile.title")}</h2><button aria-label={t("common.close")} onClick={() => closeModal()} className="text-muted-foreground transition-colors hover:text-foreground"><X className="h-4 w-4" /></button></div>

            <div className="mt-5 space-y-3">
              <div className="space-y-2 rounded-2xl border border-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("preferences.title")}</p>
                <LanguageSelector className="border-0 bg-transparent p-0" />
                <p className="text-[11px] leading-snug text-muted-foreground">{t("preferences.languageHint")}</p>
              </div>

              <div className="glass flex items-center gap-4 rounded-2xl p-4">
                <img src={avatarPreview ?? profile.avatar_url ?? `https://i.pravatar.cc/80?u=${profile.id}`} alt={t("editProfile.avatarPreview")} width={56} height={56} className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary/60" />
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"><Upload className="h-4 w-4" />{avatarFile ? avatarFile.name.slice(0, 24) : t("onboarding.uploadAvatar")}<input type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)} /></label>
              </div>

              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={t("editProfile.displayName")} aria-label={t("editProfile.displayName")} className={inputClass} />
              <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} placeholder={t("editProfile.bioPlaceholder")} aria-label={t("editProfile.bio")} rows={4} className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]" />
              <input value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 300))} placeholder={t("editProfile.websiteOptional")} aria-label={t("editProfile.website")} className={inputClass} />
              <input value={instagram} onChange={(e) => setInstagram(e.target.value.slice(0, 300))} placeholder={t("editProfile.instagramOptional")} aria-label={t("editProfile.instagram")} className={inputClass} />
              <input value={tiktok} onChange={(e) => setTiktok(e.target.value.slice(0, 300))} placeholder={t("editProfile.tiktokOptional")} aria-label={t("editProfile.tiktok")} className={inputClass} />
              <input value={xUrl} onChange={(e) => setXUrl(e.target.value.slice(0, 300))} placeholder={t("editProfile.twitterOptional")} aria-label={t("editProfile.twitter")} className={inputClass} />
              <input value={youtube} onChange={(e) => setYoutube(e.target.value.slice(0, 300))} placeholder={t("editProfile.youtubeOptional")} aria-label={t("editProfile.youtube")} className={inputClass} />

              <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"><Heart className="h-3.5 w-3.5" /> {t("editProfile.donations")}</p>
                <input value={paypalUrl} onChange={(e) => setPaypalUrl(e.target.value.slice(0, 300))} placeholder={t("editProfile.paypalOptional")} aria-label="PayPal URL" className={inputClass} />
                <input value={revolutUrl} onChange={(e) => setRevolutUrl(e.target.value.slice(0, 300))} placeholder={t("editProfile.revolutOptional")} aria-label="Revolut or Support URL" className={inputClass} />
                <p className="text-[11px] leading-snug text-muted-foreground">{t("editProfile.donationHint")}</p>
              </div>
            </div>

            {error && <p className="mt-4 text-center text-xs text-destructive">{error}</p>}
            <button onClick={save} disabled={busy || !name.trim()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? t("profile.saving") : t("profile.save")}</button>
          </div>
        </div>, document.body,
      )}
    </>
  );
}
