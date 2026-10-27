import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { atlasCopy } from "@/i18n/song-atlas";
import { ATLAS_HANDOFF_KEY, atlasHandoffSchema, type AtlasHandoff } from "@/lib/song-atlas.shared";
import {
  createAtlasInstructionLayer,
  replaceAtlasInstructionLayer,
  type AtlasInstructionLayer,
} from "@/lib/atlas-instructions.shared";
import type { Dispatch, SetStateAction } from "react";
import { validateSongAtlasHandoff } from "@/lib/song-atlas.functions";
export function AtlasGeneratorBridge({
  layer,
  onLayerChange,
  onApplied,
}: {
  layer: AtlasInstructionLayer | null;
  onLayerChange: Dispatch<SetStateAction<AtlasInstructionLayer | null>>;
  onApplied?: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { language } = useI18n();
  const t = atlasCopy[language];
  const access = useFeatureAccess("cultural_song_atlas");
  const [pending, setPending] = useState<AtlasHandoff | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef({ version: 0 });
  useEffect(() => {
    setPending(null);
    setError("");
    setBusy(false);
    const lifecycle = requestVersion.current;
    lifecycle.version++;
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
    return () => {
      lifecycle.version++;
    };
  }, [userId, t.unavailable]);
  if (!pending && !layer && !error) return null;
  const apply = async () => {
    if (!pending) return;
    const version = ++requestVersion.current.version;
    setBusy(true);
    try {
      const verified = await validateSongAtlasHandoff({ data: pending });
      if (version !== requestVersion.current.version) return;
      const next = createAtlasInstructionLayer(verified);
      onLayerChange((current) => replaceAtlasInstructionLayer(current, next));
      onApplied?.();
    } catch {
      if (version === requestVersion.current.version) setError(t.blocked);
    } finally {
      if (version === requestVersion.current.version) setBusy(false);
    }
  };
  return (
    <section className="my-4 space-y-2 rounded-xl border border-purple-400/30 p-3">
      <h3>{t.title} · Beta</h3>
      <p>{t.existing}</p>
      <p className="text-sm">{t.separateInstructions}</p>
      {layer && (
        <label className="block">
          {t.atlasInstructions}
          <textarea
            className="block w-full rounded-lg bg-background p-2"
            readOnly
            value={layer.text}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {(pending || layer) && (
        <>
          <label className="block">
            {t.techniques}
            <textarea
              className="block w-full rounded-lg bg-background p-2"
              readOnly
              value={layer?.creativeTechniques ?? ""}
            />
          </label>
          <button
            type="button"
            disabled={!pending || busy || !access.allowed}
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
          requestVersion.current.version++;
          try {
            if (user) sessionStorage.removeItem(ATLAS_HANDOFF_KEY + ":" + userId);
          } catch {
            /* Removal never mutates manual instructions even if storage is unavailable. */
          }
          setPending(null);
          setError("");
          onLayerChange(null);
        }}
      >
        {t.remove}
      </button>
    </section>
  );
}
