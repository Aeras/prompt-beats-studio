import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, Upload, UserRoundPen, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlayer } from "@/lib/player";
import { PlayerBar } from "@/components/promptbeats/PlayerBar";

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


const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

export function EditProfileModal({ profile }: { profile: EditableProfile }) {
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
    setPlayerMode("inline");
    setOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    setPlayerMode("fixed");
  };

  useEffect(() => {
    return () => {
      setPlayerMode("fixed");
    };
  }, [setPlayerMode]);

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
        const { error: uploadError } = await avatarBucket
          .upload(filePath, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (uploadError) throw uploadError;

        avatarUrl = supabase.storage.from("avatars").getPublicUrl(filePath).data.publicUrl;
        if (!avatarUrl) throw new Error("Avatar public URL could not be generated");
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
      const { data: savedProfile, error: profileError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", user.id)
        .select("artist_alias, display_name, avatar_url, bio, website_url, instagram_url, tiktok_url, x_url, youtube_url, donation_provider, donation_url, donation_custom_name, profile_completed")
        .single();
      if (profileError) throw profileError;
      if (!savedProfile) throw new Error("Profile update returned no saved profile");

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
      window.dispatchEvent(new CustomEvent("promptbeats:profile-updated", { detail: savedProfile }));
      await queryClient.invalidateQueries({ refetchType: "active" });
      toast.success("Profile updated");
      setOpen(false);
      setPlayerMode("fixed");
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
          ? error.message
          : String(error);
      console.error("Avatar/profile update failed:", error);
      setError(message);
      toast.error(message);
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
        <UserRoundPen className="h-3.5 w-3.5" />
        Edit Profile
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
          onClick={() => closeModal()}
        >
          <div
            className="glass-strong relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Edit profile</h2>
              <button
                aria-label="Close"
                onClick={() => closeModal()}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="glass flex items-center gap-4 rounded-2xl p-4">
                <img
                  src={avatarPreview ?? profile.avatar_url ?? `https://i.pravatar.cc/80?u=${profile.id}`}
                  alt="Avatar preview"
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary/60"
                />
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent">
                  <Upload className="h-4 w-4" />
                  {avatarFile ? avatarFile.name.slice(0, 24) : "Upload avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="Display name"
                aria-label="Display name"
                className={inputClass}
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 500))}
                placeholder="Short bio (max 500 characters)"
                aria-label="Bio"
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
              />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value.slice(0, 300))}
                placeholder="Website URL (optional)"
                aria-label="Website URL"
                className={inputClass}
              />
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.slice(0, 300))}
                placeholder="Instagram URL (optional)"
                aria-label="Instagram URL"
                className={inputClass}
              />
              <input
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.slice(0, 300))}
                placeholder="TikTok URL (optional)"
                aria-label="TikTok URL"
                className={inputClass}
              />
              <input
                value={xUrl}
                onChange={(e) => setXUrl(e.target.value.slice(0, 300))}
                placeholder="X (Twitter) URL (optional)"
                aria-label="X (Twitter) URL"
                className={inputClass}
              />
              <input
                value={youtube}
                onChange={(e) => setYoutube(e.target.value.slice(0, 300))}
                placeholder="YouTube URL (optional)"
                aria-label="YouTube URL"
                className={inputClass}
              />

              <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
                  <Heart className="h-3.5 w-3.5" /> Donations
                </p>
                <input
                  value={paypalUrl}
                  onChange={(e) => setPaypalUrl(e.target.value.slice(0, 300))}
                  placeholder="PayPal URL (optional)"
                  aria-label="PayPal URL"
                  className={inputClass}
                />
                <input
                  value={revolutUrl}
                  onChange={(e) => setRevolutUrl(e.target.value.slice(0, 300))}
                  placeholder="Revolut / Support URL (optional)"
                  aria-label="Revolut or Support URL"
                  className={inputClass}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Shown as a Support / Tip button on your public creator page. If both are filled, PayPal is used.
                </p>
              </div>
            </div>

            {error && <p className="mt-4 text-center text-xs text-destructive">{error}</p>}

            <button
              onClick={save}
              disabled={busy || !name.trim()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>

            <div className="relative mt-6 w-full min-w-0">
              <PlayerBar />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
