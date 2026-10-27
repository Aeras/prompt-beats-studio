import source from "../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json" with { type: "json" };
import { ATLAS_SOURCE_SHA, type AtlasCatalog, type AtlasOption } from "./song-atlas.shared";
// Source remains byte-exact in a server-only module. Never export review drafts as directives.
const CONTEXT_TYPES = new Set([
  "historical_scene",
  "umbrella",
  "thematic_approach",
  "ritual_function",
  "community_repertoire",
  "social_context",
  "regional_repertoire",
  "diaspora_context",
  "critical_style_label",
  "ensemble_format",
  "performance_format",
]);
export function safeAtlasSourceUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(u.hostname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
const dimension = (target: string): AtlasOption["dimension"] =>
  target === "vocals" ? "vocals" : target === "rhythm" ? "groove" : "creative_technique";
export function readAtlasCatalog(): AtlasCatalog {
  const cards = source.profiles.map((p) => ({
    id: p.id,
    name: p.name_ru,
    summary: p.summary_el,
    entityType: p.entity_type,
    contextOnly: CONTEXT_TYPES.has(p.entity_type),
    families: p.family_ids,
    knowledge: Object.entries(p.knowledge).map(([key, v]) => ({
      dimension: key,
      text: v.text_el,
      evidence: v.evidence_status,
    })),
    claims: p.historical_claims.map((c) => ({
      id: c.id,
      text: c.statement_el ?? c.statement_en ?? "",
      sourceIds: c.source_ids,
      review: c.review_state,
      scopeWarning: c.scope_warning,
    })),
    techniqueIds: p.creative_techniques.map((t) => t.id),
  }));
  const options: AtlasOption[] = source.profiles.flatMap((p) =>
    p.creative_techniques.map((t) => ({
      id: t.id,
      profileId: p.id,
      dimension: dimension(t.target),
      label: t.instruction_en,
      instruction: t.instruction_en,
      approved: false,
      exclusiveGroup: null,
      lyricsLanguage: null,
    })),
  );
  // Plumbing placeholders, not approved live directives or RC1 content mutations.
  for (const [profileId, modes] of Object.entries({
    "ru.chastushka": ["lively", "slow_legato"],
    "ru.battle_rap": ["a_cappella", "beat"],
    "ru.phonk": ["memphis_lineage", "modern_drift"],
  }))
    for (const mode of modes)
      options.push({
        id: profileId + ".mode." + mode,
        profileId,
        dimension: "groove",
        label: mode.replaceAll("_", " "),
        instruction: "",
        approved: false,
        exclusiveGroup: profileId + ".mode",
        lyricsLanguage: null,
      });
  for (const [dimension, values] of Object.entries({
    lyrics_language: ["Greek", "English", "Russian"],
    cultural_scope: ["Russia"],
    genre: ["Pop", "Rock", "Folk", "Rap"],
    era: ["1970s", "1990s", "Contemporary"],
    instruments: ["Piano", "Guitar"],
    mood: ["Joyful", "Reflective"],
    vocals: ["Solo", "Duet"],
    groove: ["Free rhythm", "Steady pulse"],
    narrative: ["No narrative requirement", "Explicit story requested"],
  }))
    for (const label of values)
      options.push({
        id: "dimension." + dimension + "." + label.toLowerCase().replaceAll(" ", "_"),
        profileId: null,
        dimension: dimension as AtlasOption["dimension"],
        label,
        instruction: "",
        approved: false,
        exclusiveGroup: ["lyrics_language", "cultural_scope", "era", "narrative"].includes(
          dimension,
        )
          ? dimension
          : null,
        lyricsLanguage: null,
      });
  return {
    sourceSha: ATLAS_SOURCE_SHA,
    researchOnly: true,
    cards,
    options,
    sources: source.sources.map((s) => ({
      id: s.id,
      title: s.metadata.title,
      url: safeAtlasSourceUrl("url" in s.metadata ? s.metadata.url : null),
    })),
    candidateCount: source.candidates.length,
  };
}
