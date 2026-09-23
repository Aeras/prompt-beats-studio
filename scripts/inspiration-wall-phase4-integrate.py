from pathlib import Path

# 1) Shared structured handoff contract.
shared = Path("src/lib/inspiration-wall-song-setup.shared.ts")
shared.write_text(r'''import { z } from "zod";

import {
  inspirationWallCreativeDirectionSchema,
  type InspirationWallCreativeDirection,
} from "@/lib/inspiration-wall.shared";

export const INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY = "pb:inspiration-wall-song-setup";

export const inspirationWallSongSetupHandoffSchema = z
  .object({
    version: z.literal(1),
    wallId: z.string().uuid(),
    wallTitle: z.string().trim().min(1).max(120),
    connectedProjectId: z.string().uuid().nullable(),
    direction: inspirationWallCreativeDirectionSchema,
  })
  .strict();

export type InspirationWallSongSetupHandoff = z.infer<
  typeof inspirationWallSongSetupHandoffSchema
>;

const FIELD_LABELS: Record<
  keyof InspirationWallCreativeDirection,
  { en: string; el: string }
> = {
  coreTheme: { en: "Core Theme", el: "Κεντρικό Θέμα" },
  moodPalette: { en: "Emotional / Mood Palette", el: "Συναισθηματική Παλέτα" },
  visualLanguage: { en: "Visual Language", el: "Οπτική Γλώσσα" },
  narrativeAngle: { en: "Possible Narrative Angle", el: "Πιθανή Αφηγηματική Κατεύθυνση" },
  musicalCharacter: { en: "Musical Character", el: "Μουσικός Χαρακτήρας" },
  productionTexture: { en: "Production Texture", el: "Υφή Παραγωγής" },
  vocalPersonality: { en: "Vocal Personality", el: "Φωνητική Προσωπικότητα" },
  lyricalKeywords: { en: "Lyrical Keywords / Motifs", el: "Λυρικές Λέξεις / Μοτίβα" },
  thingsToAvoid: { en: "Things to Avoid", el: "Τι να Αποφευχθεί" },
  contradictions: { en: "Contradictions / Tensions", el: "Αντιφάσεις / Εντάσεις" },
  openQuestions: { en: "Open Questions / Uncertainties", el: "Ανοιχτά Ερωτήματα / Αβεβαιότητες" },
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as Array<keyof InspirationWallCreativeDirection>;

export function buildInspirationWallSongSetupDescription(
  direction: InspirationWallCreativeDirection,
  language: "en" | "el",
) {
  const lines: string[] = [];
  for (const key of FIELD_ORDER) {
    const value = direction[key];
    const text = Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean).join(", ")
      : typeof value === "string"
        ? value.trim()
        : "";
    if (!text) continue;
    lines.push(`${FIELD_LABELS[key][language]}: ${text}`);
  }
  return lines.join("\n");
}
''')

# 2) Direction panel: collect approved fields once, persist them, then hand off only that object.
panel = Path("src/components/promptbeats/InspirationWallDirectionPanel.tsx")
s = panel.read_text()
s = s.replace(
  'import { useEffect, useMemo, useState } from "react";\n',
  'import { useEffect, useMemo, useState } from "react";\nimport { useNavigate } from "@tanstack/react-router";\n',
  1,
)
s = s.replace(
  'import { BrainCircuit, Link2, Loader2, Music2, Sparkles, Unlink } from "lucide-react";\n',
  'import { ArrowRight, BrainCircuit, Link2, Loader2, Music2, Sparkles, Unlink } from "lucide-react";\n',
  1,
)
anchor = 'import { cn } from "@/lib/utils";\n'
extra = '''import { useFeatureAccess } from "@/hooks/useFeatureAccess";\nimport { INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY } from "@/lib/inspiration-wall-song-setup.shared";\n'''
if extra not in s:
    if anchor not in s:
        raise RuntimeError("DirectionPanel import anchor missing")
    s = s.replace(anchor, anchor + extra, 1)

helper_anchor = '''function textToValue(text: string, isArray: boolean) {
  if (!isArray) return text.trim();
  return text
    .split("\\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
'''
helper = helper_anchor + '''
function collectApprovedDirection(
  direction: InspirationWallCreativeDirection,
  kept: Record<FieldKey, boolean>,
) {
  const approved: InspirationWallCreativeDirection = {};
  for (const field of FIELD_META) {
    if (!kept[field.key]) continue;
    const value = direction[field.key];
    if (Array.isArray(value)) {
      const clean = value.map((item) => item.trim()).filter(Boolean);
      if (clean.length) (approved as Record<string, unknown>)[field.key] = clean;
    } else if (typeof value === "string" && value.trim()) {
      (approved as Record<string, unknown>)[field.key] = value.trim();
    }
  }
  return approved;
}
'''
if "function collectApprovedDirection" not in s:
    if helper_anchor not in s:
        raise RuntimeError("collect helper anchor missing")
    s = s.replace(helper_anchor, helper, 1)

component_anchor = '  const el = language === "el";\n'
component_insert = '''  const el = language === "el";
  const navigate = useNavigate();
  const songSetupFeature = useFeatureAccess("song_setup_assistant");
'''
if 'const songSetupFeature = useFeatureAccess("song_setup_assistant")' not in s:
    if component_anchor not in s:
        raise RuntimeError("component anchor missing")
    s = s.replace(component_anchor, component_insert, 1)

s = s.replace(
  '  const [saving, setSaving] = useState(false);\n',
  '  const [saving, setSaving] = useState(false);\n  const [handoffBusy, setHandoffBusy] = useState(false);\n',
  1,
)
old_save = '''  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const approved: InspirationWallCreativeDirection = {};
      for (const field of FIELD_META) {
        if (!kept[field.key]) continue;
        const value = direction[field.key];
        if (Array.isArray(value)) {
          (approved as Record<string, unknown>)[field.key] = value.filter(Boolean);
        } else if (typeof value === "string" && value.trim()) {
          (approved as Record<string, unknown>)[field.key] = value.trim();
        }
      }
      await updateInspirationWall({ data: { wallId: wall.id, creativeDirection: approved } });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : el ? "Η αποθήκευση απέτυχε." : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  };
'''
new_save = '''  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const approved = collectApprovedDirection(direction, kept);
      await updateInspirationWall({ data: { wallId: wall.id, creativeDirection: approved } });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : el ? "Η αποθήκευση απέτυχε." : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const useInSongSetup = async () => {
    if (!songSetupFeature.allowed || handoffBusy) return;
    setHandoffBusy(true);
    setError(null);
    try {
      const approved = collectApprovedDirection(direction, kept);
      if (Object.keys(approved).length === 0) {
        throw new Error(
          el
            ? "Κράτησε τουλάχιστον ένα πεδίο Creative Direction πριν συνεχίσεις."
            : "Keep at least one Creative Direction field before continuing.",
        );
      }
      await updateInspirationWall({ data: { wallId: wall.id, creativeDirection: approved } });
      if (typeof window === "undefined") return;
      window.sessionStorage.setItem(
        INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY,
        JSON.stringify({
          version: 1,
          wallId: wall.id,
          wallTitle: wall.title,
          connectedProjectId: wall.connected_project_id,
          direction: approved,
        }),
      );
      await navigate({ to: "/generate" });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Η μεταφορά στο Song Setup απέτυχε."
            : "Could not open Song Setup.",
      );
    } finally {
      setHandoffBusy(false);
    }
  };
'''
if old_save not in s:
    raise RuntimeError("save function anchor missing")
s = s.replace(old_save, new_save, 1)

old_buttons = '''        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Αποθήκευση Creative Direction" : "Save Creative Direction"}
          </button>
        </div>
'''
new_buttons = '''        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!songSetupFeature.isLoading && !songSetupFeature.allowed && (
            <p className="mr-auto text-[10px] text-muted-foreground">
              {el
                ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
                : "Song Setup Assistant is not available for this account."}
            </p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || handoffBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {el ? "Αποθήκευση Creative Direction" : "Save Creative Direction"}
          </button>
          <button
            type="button"
            onClick={() => void useInSongSetup()}
            disabled={handoffBusy || saving || songSetupFeature.isLoading || !songSetupFeature.allowed}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {handoffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {el ? "Χρήση στο Song Setup" : "Use in Song Setup"}
          </button>
        </div>
'''
if old_buttons not in s:
    raise RuntimeError("button anchor missing")
s = s.replace(old_buttons, new_buttons, 1)
panel.write_text(s)

# 3) Song Setup modal: accept a structured handoff as a reviewed prefill, never auto-run AI.
modal = Path("src/components/promptbeats/SongSetupAssistantModal.tsx")
m = modal.read_text()
m = m.replace('import { useState } from "react";\n', 'import { useEffect, useState } from "react";\n', 1)
old_sig = '''export function SongSetupAssistantModal({
  open,
  onOpenChange,
  targetPlatform,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlatform: AITargetPlatform;
  onApply: (draft: SongSetupDraft) => void;
}) {'''
new_sig = '''export function SongSetupAssistantModal({
  open,
  onOpenChange,
  targetPlatform,
  onApply,
  prefillDescription = null,
  prefillSourceLabel = null,
  prefillKey = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlatform: AITargetPlatform;
  onApply: (draft: SongSetupDraft) => void;
  prefillDescription?: string | null;
  prefillSourceLabel?: string | null;
  prefillKey?: string | null;
}) {'''
if old_sig not in m:
    raise RuntimeError("SongSetup modal signature anchor missing")
m = m.replace(old_sig, new_sig, 1)
state_anchor = '  const [error, setError] = useState<string | null>(null);\n'
state_insert = state_anchor + '''
  useEffect(() => {
    if (!open || !prefillKey || !prefillDescription) return;
    setDescription(prefillDescription.slice(0, 2500));
    setDraft(null);
    setError(null);
  }, [open, prefillDescription, prefillKey]);
'''
if 'if (!open || !prefillKey || !prefillDescription) return;' not in m:
    if state_anchor not in m:
        raise RuntimeError("SongSetup modal state anchor missing")
    m = m.replace(state_anchor, state_insert, 1)
desc_anchor = '''        <div className="space-y-3">
          <div>
'''
desc_insert = '''        <div className="space-y-3">
          {prefillSourceLabel && (
            <div className="rounded-xl border border-accent/20 bg-accent/[0.04] px-3 py-2 text-xs text-muted-foreground">
              {language === "el" ? "Πηγή" : "Source"}: <span className="font-medium text-foreground">{prefillSourceLabel}</span>
              <span className="ml-1">
                {language === "el"
                  ? "— μεταφέρθηκαν μόνο τα πεδία Creative Direction που επέλεξες να κρατήσεις."
                  : "— only the Creative Direction fields you chose to keep were transferred."}
              </span>
            </div>
          )}
          <div>
'''
if desc_anchor not in m:
    raise RuntimeError("SongSetup description anchor missing")
m = m.replace(desc_anchor, desc_insert, 1)
modal.write_text(m)

# 4) Generator consumes the one-time structured handoff and opens Song Setup for review.
generate = Path("src/routes/generate.tsx")
g = generate.read_text()
import_anchor = 'import type { SongSetupDraft } from "@/lib/song-setup-assistant.functions";\n'
import_extra = '''import type { SongSetupDraft } from "@/lib/song-setup-assistant.functions";
import {
  buildInspirationWallSongSetupDescription,
  INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY,
  inspirationWallSongSetupHandoffSchema,
  type InspirationWallSongSetupHandoff,
} from "@/lib/inspiration-wall-song-setup.shared";
'''
if 'INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY' not in g:
    if import_anchor not in g:
        raise RuntimeError("generate import anchor missing")
    g = g.replace(import_anchor, import_extra, 1)

state_anchor = '  const [songSetupAssistantOpen, setSongSetupAssistantOpen] = useState(false);\n'
state_insert = state_anchor + '''  const [inspirationWallHandoff, setInspirationWallHandoff] =
    useState<InspirationWallSongSetupHandoff | null>(null);
  const [songSetupPrefill, setSongSetupPrefill] = useState<{
    key: string;
    description: string;
    sourceLabel: string;
  } | null>(null);
'''
if 'const [inspirationWallHandoff' not in g:
    if state_anchor not in g:
        raise RuntimeError("generate state anchor missing")
    g = g.replace(state_anchor, state_insert, 1)

analyzer_effect_anchor = '''  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SONG_ANALYZER_HANDOFF_KEY);
'''
if analyzer_effect_anchor not in g:
    raise RuntimeError("analyzer effect anchor missing")
# Insert new effects immediately before Song Analyzer effect.
new_effects = '''  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);
    try {
      setInspirationWallHandoff(inspirationWallSongSetupHandoffSchema.parse(JSON.parse(raw)));
    } catch {
      setStatus(
        appLanguage === "el"
          ? "Δεν ήταν δυνατή η φόρτωση του Inspiration Wall στο Song Setup."
          : "Could not load the Inspiration Wall handoff into Song Setup.",
      );
    }
  }, [appLanguage]);

  useEffect(() => {
    if (!inspirationWallHandoff || songSetupFeature.isLoading) return;
    if (!songSetupFeature.allowed) {
      setStatus(
        appLanguage === "el"
          ? "Το Song Setup Assistant δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
          : "Song Setup Assistant is not available for this account.",
      );
      setInspirationWallHandoff(null);
      return;
    }
    const description = buildInspirationWallSongSetupDescription(
      inspirationWallHandoff.direction,
      appLanguage,
    );
    if (!description) {
      setStatus(
        appLanguage === "el"
          ? "Το Inspiration Wall δεν έχει εγκεκριμένο Creative Direction για μεταφορά."
          : "The Inspiration Wall has no approved Creative Direction to transfer.",
      );
      setInspirationWallHandoff(null);
      return;
    }
    setAdvanced(true);
    if (inspirationWallHandoff.connectedProjectId) {
      setSaveProjectId(inspirationWallHandoff.connectedProjectId);
    }
    setSongSetupPrefill({
      key: `${inspirationWallHandoff.wallId}:v1`,
      description,
      sourceLabel: inspirationWallHandoff.wallTitle,
    });
    setSongSetupAssistantOpen(true);
    setStatus(
      appLanguage === "el"
        ? "Το εγκεκριμένο Creative Direction φορτώθηκε στο Song Setup για έλεγχο."
        : "Approved Creative Direction loaded into Song Setup for review.",
    );
    setInspirationWallHandoff(null);
  }, [appLanguage, inspirationWallHandoff, songSetupFeature.allowed, songSetupFeature.isLoading]);

'''
if 'const raw = window.sessionStorage.getItem(INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY);' not in g:
    g = g.replace(analyzer_effect_anchor, new_effects + analyzer_effect_anchor, 1)

old_modal = '''        <SongSetupAssistantModal
          open={songSetupAssistantOpen}
          onOpenChange={setSongSetupAssistantOpen}
          targetPlatform={targetPlatform}
          onApply={applySongSetup}
        />'''
new_modal = '''        <SongSetupAssistantModal
          open={songSetupAssistantOpen}
          onOpenChange={(nextOpen) => {
            setSongSetupAssistantOpen(nextOpen);
            if (!nextOpen) setSongSetupPrefill(null);
          }}
          targetPlatform={targetPlatform}
          onApply={applySongSetup}
          prefillDescription={songSetupPrefill?.description ?? null}
          prefillSourceLabel={songSetupPrefill?.sourceLabel ?? null}
          prefillKey={songSetupPrefill?.key ?? null}
        />'''
if old_modal not in g:
    raise RuntimeError("generator modal anchor missing")
g = g.replace(old_modal, new_modal, 1)
generate.write_text(g)

# 5) Storage hardening: remove superseded/deleted private image objects best-effort.
functions = Path("src/lib/inspiration-wall.functions.ts")
f = functions.read_text()
key_helper = '''function assertOwnedImageKey(imageObjectKey: string | null | undefined, userId: string) {
  if (!imageObjectKey) return;
  if (!imageObjectKey.startsWith(`${userId}/`)) {
    throw new Error("Invalid Inspiration Wall image key.");
  }
}
'''
cleanup_helper = key_helper + '''
async function cleanupInspirationWallImages(supabase: any, keys: Array<string | null | undefined>) {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => Boolean(key)))];
  if (uniqueKeys.length === 0) return;
  const { error } = await supabase.storage.from("inspiration-wall-images").remove(uniqueKeys);
  if (error) console.warn("Inspiration Wall image cleanup failed:", error.message);
}
'''
if 'async function cleanupInspirationWallImages' not in f:
    if key_helper not in f:
        raise RuntimeError("image key helper anchor missing")
    f = f.replace(key_helper, cleanup_helper, 1)

old_delete_wall = '''    await requireWallAccess(supabase, data.wallId, context.userId);
    const { error } = await supabase
      .from("inspiration_walls")
      .delete()
      .eq("id", data.wallId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
'''
new_delete_wall = '''    await requireWallAccess(supabase, data.wallId, context.userId);
    const { data: imageCards, error: imageCardsError } = await supabase
      .from("inspiration_wall_cards")
      .select("image_object_key")
      .eq("wall_id", data.wallId);
    if (imageCardsError) throw new Error(imageCardsError.message);
    const { error } = await supabase
      .from("inspiration_walls")
      .delete()
      .eq("id", data.wallId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    await cleanupInspirationWallImages(
      supabase,
      (imageCards ?? []).map((card: { image_object_key: string | null }) => card.image_object_key),
    );
    return { ok: true };
'''
if old_delete_wall not in f:
    raise RuntimeError("delete wall anchor missing")
f = f.replace(old_delete_wall, new_delete_wall, 1)

f = f.replace('.select("id, wall_id")\n      .eq("id", data.cardId)', '.select("id, wall_id, image_object_key")\n      .eq("id", data.cardId)', 2)

update_return = '''    if (error) throw new Error(error.message);
    return { card: card as InspirationWallCardRecord };
  });

export const deleteInspirationWallCard'''
update_return_new = '''    if (error) throw new Error(error.message);
    if (
      data.imageObjectKey !== undefined &&
      existing.image_object_key &&
      existing.image_object_key !== data.imageObjectKey
    ) {
      await cleanupInspirationWallImages(supabase, [existing.image_object_key]);
    }
    return { card: card as InspirationWallCardRecord };
  });

export const deleteInspirationWallCard'''
if update_return not in f:
    raise RuntimeError("update card return anchor missing")
f = f.replace(update_return, update_return_new, 1)

delete_card_return = '''    const { error } = await supabase.from("inspiration_wall_cards").delete().eq("id", data.cardId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const linkInspirationWallTrack'''
delete_card_return_new = '''    const { error } = await supabase.from("inspiration_wall_cards").delete().eq("id", data.cardId);
    if (error) throw new Error(error.message);
    await cleanupInspirationWallImages(supabase, [existing.image_object_key]);
    return { ok: true };
  });

export const linkInspirationWallTrack'''
if delete_card_return not in f:
    raise RuntimeError("delete card return anchor missing")
f = f.replace(delete_card_return, delete_card_return_new, 1)
functions.write_text(f)

# 6) Phase 4 regression tests.
test = Path("src/lib/inspiration-wall-phase4.test.ts")
test.write_text(r'''import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  buildInspirationWallSongSetupDescription,
  inspirationWallSongSetupHandoffSchema,
} from "./inspiration-wall-song-setup.shared";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Inspiration Wall Phase 4", () => {
  test("handoff stays structured and rejects unrelated raw Wall payloads", () => {
    const valid = {
      version: 1 as const,
      wallId: "00000000-0000-4000-8000-000000000001",
      wallTitle: "Night Drive",
      connectedProjectId: null,
      direction: { coreTheme: "A late-night return home", thingsToAvoid: ["nostalgia clichés"] },
    };
    expect(inspirationWallSongSetupHandoffSchema.parse(valid)).toEqual(valid);
    expect(() => inspirationWallSongSetupHandoffSchema.parse({ ...valid, cards: [{ body: "raw" }] })).toThrow();
  });

  test("Song Setup description contains only approved structured fields", () => {
    const description = buildInspirationWallSongSetupDescription(
      { coreTheme: "Night drive", moodPalette: ["tense", "hopeful"] },
      "en",
    );
    expect(description).toContain("Core Theme: Night drive");
    expect(description).toContain("Emotional / Mood Palette: tense, hopeful");
    expect(description).not.toContain("Visual Language:");
    expect(description).not.toContain("Things to Avoid:");
  });

  test("handoff field labels support English and Greek", () => {
    const direction = { vocalPersonality: "restrained" };
    expect(buildInspirationWallSongSetupDescription(direction, "en")).toContain("Vocal Personality");
    expect(buildInspirationWallSongSetupDescription(direction, "el")).toContain("Φωνητική Προσωπικότητα");
  });

  test("Wall primary action persists current approvals and never generates directly", async () => {
    const panel = await source("src/components/promptbeats/InspirationWallDirectionPanel.tsx");
    expect(panel).toContain("Use in Song Setup");
    expect(panel).toContain("Χρήση στο Song Setup");
    expect(panel).toContain("collectApprovedDirection(direction, kept)");
    expect(panel).toContain("INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY");
    expect(panel).toContain('navigate({ to: "/generate" })');
    expect(panel).not.toContain("startGenerationJob");
  });

  test("Generator consumes one-time handoff and opens Song Setup for review", async () => {
    const generator = await source("src/routes/generate.tsx");
    const modal = await source("src/components/promptbeats/SongSetupAssistantModal.tsx");
    expect(generator).toContain("inspirationWallSongSetupHandoffSchema.parse");
    expect(generator).toContain("buildInspirationWallSongSetupDescription");
    expect(generator).toContain("setSongSetupAssistantOpen(true)");
    expect(generator).toContain("prefillDescription={songSetupPrefill?.description ?? null}");
    expect(modal).toContain("only the Creative Direction fields you chose to keep were transferred");
    expect(modal).toContain("if (!open || !prefillKey || !prefillDescription) return;");
  });

  test("private Wall images are cleaned up on replacement, card deletion and Wall deletion", async () => {
    const server = await source("src/lib/inspiration-wall.functions.ts");
    expect(server).toContain("cleanupInspirationWallImages");
    expect(server).toContain('.from("inspiration-wall-images").remove(uniqueKeys)');
    expect(server).toContain("existing.image_object_key !== data.imageObjectKey");
    expect(server).toContain("imageCards");
    expect(server).toContain("await cleanupInspirationWallImages(supabase, [existing.image_object_key])");
  });
});
''')
