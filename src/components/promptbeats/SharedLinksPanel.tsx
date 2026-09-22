import { useState } from "react";
import { Check, Copy, Loader2, Share2, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "@/i18n";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import artFallback from "@/assets/art-3.jpg";
import { listMyShareManagement, revokeTrackShareLink, updateTrackShareLink, type ShareManagementTrack } from "@/lib/track-sharing.functions";

function fmt(value: string | null, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

export function SharedLinksPanel() {
  const { language } = useI18n();
  const sharingAccess = useFeatureAccess("sharing_public_links");
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ["library", "shared-links"],
    queryFn: () => listMyShareManagement(),
    enabled: sharingAccess.allowed,
  });

  const copy = async (token: string) => {
    const url = window.location.origin + "/share/" + token;
    try { await navigator.clipboard.writeText(url); setCopied(token); window.setTimeout(() => setCopied(null), 1500); } catch {}
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try { await revokeTrackShareLink({ data: { shareId: id } }); await queryClient.invalidateQueries({ queryKey: ["library", "shared-links"] }); }
    finally { setRevoking(null); }
  };

  const updateLink = async (id: string, includePrompt: boolean, includeLyrics: boolean) => {
    if (!sharingAccess.allowed) return;
    setUpdating(id);
    try {
      await updateTrackShareLink({ data: { shareId: id, includePrompt, includeLyrics } });
      await queryClient.invalidateQueries({ queryKey: ["library", "shared-links"] });
    } finally {
      setUpdating(null);
    }
  };

  if (!sharingAccess.allowed) return null;

  if (data.isLoading) return <p className="mt-6 glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{language === "el" ? "Φόρτωση κοινοποιήσεων..." : "Loading shares..."}</p>;
  const tracks = (data.data?.tracks ?? [])
    .map((track) => ({ ...track, owner_links: track.owner_links.filter((link) => !link.revoked_at) }))
    .filter((track) => track.owner_links.length > 0);
  if (!tracks.length) return <p className="mt-6 glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν ακόμη κοινοποιήσεις για τα τραγούδια σου." : "No shares for your tracks yet."}</p>;

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Share Management</h2>
        <p className="mt-1 text-xs text-muted-foreground">{language === "el" ? "Διαχειρίσου τα links που δημιούργησες και δες συγκεντρωτικά τις κοινοποιήσεις άλλων χρηστών." : "Manage links you created and review aggregated sharing activity from other users."}</p>
      </div>
      {tracks.map((track: ShareManagementTrack) => (
        <article key={track.track_id} className="glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <img src={track.cover_url ?? track.art_url ?? artFallback} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-display font-bold">{track.title}</h3>
                <span className={"rounded-full border px-2 py-0.5 text-[10px] " + (track.is_published ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-muted-foreground")}>{track.is_published ? "Public" : "Private"}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Prompt: {track.prompt_is_public ? "Public" : "Private"} · Lyrics: {track.lyrics_is_public ? "Public" : "Private"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground"><Share2 className="mr-1 inline h-3 w-3" />{language === "el" ? "Κοινοποιήσεις άλλων χρηστών" : "Shares by other users"}: {track.public_share_count}{track.last_public_share_at ? " · " + (language === "el" ? "τελευταία " : "last ") + fmt(track.last_public_share_at, language === "el" ? "el-GR" : "en-US") : ""}</p>
            </div>
          </div>
          {track.owner_links.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{language === "el" ? "Δικά σου share links" : "Your share links"}</p>
              {track.owner_links.map((link) => {
                const active = !link.revoked_at;
                return (
                  <div key={link.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={active ? "text-accent" : "text-muted-foreground"}>{active ? (language === "el" ? "Ενεργό" : "Active") : (language === "el" ? "Ανακλήθηκε" : "Revoked")}</span>
                        {active ? <>
                          <button type="button" disabled={!sharingAccess.allowed || updating === link.id} onClick={() => updateLink(link.id, !link.include_prompt, link.include_lyrics)} className={link.include_prompt ? "rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent" : "rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground"}>Prompt {link.include_prompt ? "✓" : "—"}</button>
                          <button type="button" disabled={!sharingAccess.allowed || updating === link.id} onClick={() => updateLink(link.id, link.include_prompt, !link.include_lyrics)} className={link.include_lyrics ? "rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent" : "rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground"}>Lyrics {link.include_lyrics ? "✓" : "—"}</button>
                        </> : <span>Prompt {link.include_prompt ? "✓" : "—"} · Lyrics {link.include_lyrics ? "✓" : "—"}</span>}
                      </div>
                      <div className="flex gap-1">
                        {active && <button type="button" onClick={() => copy(link.token)} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-accent">{copied === link.token ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}</button>}
                        {active && <button type="button" onClick={() => revoke(link.id)} disabled={revoking === link.id} className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-destructive">{revoking === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>}
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">{language === "el" ? "Ανοίγματα" : "Opens"}: {link.open_count} · {language === "el" ? "Τελευταίο άνοιγμα" : "Last opened"}: {fmt(link.last_opened_at, language === "el" ? "el-GR" : "en-US")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}