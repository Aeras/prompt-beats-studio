import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { atlasCopy } from "@/i18n/song-atlas";
import {
  ATLAS_HANDOFF_KEY,
  atlasHandoffSchema,
  mergeAtlasInstructions,
  type AtlasHandoff,
} from "@/lib/song-atlas.shared";
import { validateSongAtlasHandoff } from "@/lib/song-atlas.functions";
export function AtlasGeneratorBridge({
  instructions,
  onApply,
}: {
  instructions: string;
  onApply: (instructions: string, origin: AtlasHandoff | null) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { language } = useI18n();
  const t = atlasCopy[language];
  const access = useFeatureAccess("cultural_song_atlas");
  const [pending, setPending] = useState<AtlasHandoff | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [techniques, setTechniques] = useState("");
  const applied = useRef(new Set<string>());
  useEffect(() => {
    setPending(null);
    setError("");
    setTechniques("");
    applied.current.clear();
    if (!userId) return;
    try {
      const raw = sessionStorage.getItem(ATLAS_HANDOFF_KEY + ":" + userId);
      if (raw) {
        const parsed = atlasHandoffSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setPending(parsed.data);
        else setError(t.unavailable);
      }
    } catch {
      setError(t.unavailable);
    }
  }, [userId, t.unavailable]);
  if (!pending && !error) return null;
  const apply = async () => {
    if (!pending || applied.current.has(pending.id)) return;
    setBusy(true);
    try {
      const verified = await validateSongAtlasHandoff({ data: pending });
      const merged = mergeAtlasInstructions(instructions, verified.instructions);
      onApply(merged, verified.handoff);
      applied.current.add(pending.id);
      setTechniques(verified.creativeTechniques);
    } catch {
      setError(t.blocked);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="my-4 space-y-2 rounded-xl border border-purple-400/30 p-3">
      <h3>{t.title} · Beta</h3>
      <p>{t.existing}</p>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <>
          <label className="block">
            {t.techniques}
            <textarea
              className="block w-full rounded-lg bg-background p-2"
              readOnly
              value={techniques}
            />
          </label>
          <button
            type="button"
            disabled={busy || !access.allowed || applied.current.has(pending.id)}
            onClick={() => void apply()}
          >
            {t.apply}
          </button>
        </>
      )}
      <button
        type="button"
        className="ml-4"
        onClick={() => {
          if (user) sessionStorage.removeItem(ATLAS_HANDOFF_KEY + ":" + userId);
          setPending(null);
          setError("");
          onApply(instructions, null);
        }}
      >
        {t.remove}
      </button>
    </section>
  );
}
