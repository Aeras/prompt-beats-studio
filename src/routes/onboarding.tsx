import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set Up Your Artist Profile — PromptBeats" },
      {
        name: "description",
        content:
          "Add an avatar, a short bio and your social links so listeners can find you on your PromptBeats creator page.",
      },
      { property: "og:title", content: "Set Up Your Artist Profile — PromptBeats" },
      { property: "og:description", content: "Customize your public PromptBeats creator page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]";

function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [alias, setAlias] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState({ website_url: "", instagram_url: "", tiktok_url: "", youtube_url: "", x_url: "" });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile?.display_name && !alias) setAlias(profile.display_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.display_name]);

  const pickAvatar = (file: File | null) => {
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user) return undefined;
    const ext = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl;
  };

  const save = async (completed: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const avatarUrl = completed ? await uploadAvatar() : undefined;
      await updateMyProfile({
        data: {
          profile_completed: completed,
          ...(completed
            ? {
                artist_alias: alias.trim(),
                bio: bio.trim(),
                ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                ...links,
              }
            : {}),
        },
      });
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile");
      setBusy(false);
    }
  };

  return (
    <div className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10">
      <div className="glass-strong w-full max-w-lg rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-neon glow-neon">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Set up your artist profile</h1>
            <p className="truncate text-xs text-muted-foreground">Optional — you can do this later</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="glass flex items-center gap-4 rounded-2xl p-4">
            <img
              src={avatarPreview ?? profile?.avatar_url ?? `https://i.pravatar.cc/80?u=${user?.id ?? "new"}`}
              alt="Your avatar preview"
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
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Artist alias"
            aria-label="Artist alias"
            className={inputClass}
          />
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            placeholder="Short bio (max 500 characters)"
            aria-label="Short bio"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
          />

          {(
            [
              ["website_url", "Website URL"],
              ["instagram_url", "Instagram URL"],
              ["tiktok_url", "TikTok URL"],
              ["youtube_url", "YouTube URL"],
              ["x_url", "X / Twitter URL"],
            ] as const
          ).map(([key, label]) => (
            <input
              key={key}
              value={links[key]}
              onChange={(e) => setLinks({ ...links, [key]: e.target.value })}
              placeholder={label}
              aria-label={label}
              className={inputClass}
            />
          ))}
        </div>

        {error && <p className="mt-4 text-center text-xs text-destructive">{error}</p>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save profile
          </button>
          <button
            onClick={() => save(false)}
            disabled={busy}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
