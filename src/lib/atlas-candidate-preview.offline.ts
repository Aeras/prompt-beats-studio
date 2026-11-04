/** Offline opt-in review workbench. No server function, job, model or provider dispatch. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  advancedSetupSchema,
  parseAdvancedSetup,
  serializeAdvancedSetup,
  ADVANCED_SETUP_MAX_BYTES,
  mergeAdvancedSetupValues as merge,
} from "./advanced-generator-setup";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { songBlueprintSectionSchema, activeSongBlueprint } from "./song-blueprint.shared";
import {
  assertGenerationInputLimits,
  assertGenerationRequestBudget,
} from "./generator-input-limits";
import { CUSTOM_LANGUAGE_VALUE, resolveSongLanguage } from "@/catalog/song-languages";
import { buildAdvancedGeneratorPromptV5Beta1 } from "./advanced-generator-prompt-v5-beta-1";
import { buildRegistryPrompt } from "./prompt-registry.server";
import {
  ATLAS_STEP4C_SHA,
  readOfflineAtlasCandidates,
  readOfflineAtlasPilots,
} from "./atlas-completion-package.offline";

const fixedDate = new Date("2026-10-31T11:00:00.000Z");
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_.:-]+$/)
  .max(160);
const authoritySchema = z.strictObject({
  mode: z.literal("offline"),
  permission: z.literal("local-review"),
  actorId: id,
});
export type AtlasOfflineAuthority = z.infer<typeof authoritySchema>;
export const atlasCandidateRequestSchema = z.strictObject({
  techniqueIds: z.array(id).length(1),
  profileId: id,
  optIn: z.literal(true),
  acceptUnverified: z.literal(true),
  scope: z.strictObject({
    structureIndex: z.number().int().min(0).max(39),
    sectionType: z.string().min(1).max(120),
    occurrence: z.number().int().positive(),
    sectionId: id.optional(),
  }),
  intent: z.enum([
    "general",
    "traditional-phrasing",
    "group-refrain",
    "fictional-wedding-dialogue",
  ]),
  voices: z.enum(["solo", "group", "two-groups"]),
  pilotId: id.optional(),
});
export type AtlasCandidateRequest = z.infer<typeof atlasCandidateRequestSchema>;
const strictSetup = advancedSetupSchema.extend({
  songBlueprint: z.array(songBlueprintSectionSchema.strict()).max(40),
});

export function parseOfflineCandidateSetup(text: string): AdvancedGeneratorSetup {
  if (Buffer.byteLength(text, "utf8") > ADVANCED_SETUP_MAX_BYTES)
    throw new Error("setup_too_large");
  const raw: unknown = JSON.parse(text);
  const envelope = z
    .strictObject({
      format: z.literal("promptbeats-advanced-generator"),
      schemaVersion: z.literal(1),
      exportedAt: z.string().max(64),
      setup: strictSetup,
    })
    .parse(raw);
  const before = envelope.setup;
  if (before.songStructure.length !== before.songBlueprint.length)
    throw new Error("ambiguous_blueprint");
  const occurrences = new Map<string, number>(),
    ids = new Set<string>();
  before.songBlueprint.forEach((section, index) => {
    const label = before.songStructure[index]!;
    const occurrence = (occurrences.get(label.trim().toLowerCase()) ?? 0) + 1;
    occurrences.set(label.trim().toLowerCase(), occurrence);
    if (
      section.structureIndex !== index ||
      section.sectionType !== label ||
      section.occurrence !== occurrence ||
      (section.sectionId && ids.has(section.sectionId))
    )
      throw new Error("ambiguous_blueprint");
    if (section.sectionId) ids.add(section.sectionId);
  });
  const parsed = parseAdvancedSetup(text);
  if (!parsed.ok || !isDeepStrictEqual(parsed.setup, before))
    throw new Error("setup_would_be_silently_normalized");
  return structuredClone(before);
}

/** Mirrors Advanced mode composition using the same value merge, language, bounds and Blueprint helpers.
 * Deliberately rejects anything that the UI would block or the dispatch path would truncate. */
export function offlineSetupToPromptInput(setup: AdvancedGeneratorSetup) {
  const s = strictSetup.parse(setup);
  const genre = merge(
    s.selectedMusicStyles.filter((v) => v !== CUSTOM_LANGUAGE_VALUE),
    s.customMusicStyle,
  ).join(", ");
  const instruments = merge(s.selectedInstruments, s.customInstruments).join(", ");
  const mood = merge(
    s.selectedMoods.filter((v) => v !== CUSTOM_LANGUAGE_VALUE),
    s.customMood,
  ).join(", ");
  const bpm = s.bpmMode === "Auto" ? "" : s.bpmMode === "Custom" ? s.customBpm.trim() : s.bpmMode;
  if (bpm && (!/^\d{1,3}$/.test(bpm) || +bpm < 40 || +bpm > 260))
    throw new Error("invalid_bpm_mode_or_value");
  const direction = [
    instruments ? `Preferred instruments: ${instruments}.` : "",
    bpm ? `Target tempo: ${bpm} BPM.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const effectiveGenre = direction
    ? `${genre} — Additional musical direction: ${direction}`
    : genre;
  const language =
    s.language === CUSTOM_LANGUAGE_VALUE
      ? s.customLanguage.trim()
      : resolveSongLanguage(s.language, s.languageVariant);
  const structure = s.songStructure.join(" → ");
  if (
    !s.theme.trim() ||
    !mood ||
    !language ||
    structure.length > 600 ||
    s.productionStyle.trim().length > 2000 ||
    s.additionalInstructions.trim().length > 2000
  )
    throw new Error("incomplete_or_truncated_prompt_input");
  assertGenerationInputLimits(
    {
      theme: s.theme.trim(),
      genre: effectiveGenre,
      mood,
      advanced: true,
      baseMusicStyle: genre,
      instruments,
      operation: "generate",
    },
    false,
  );
  const input = {
    theme: s.theme.trim(),
    genre: effectiveGenre,
    mood,
    language,
    targetPlatform: s.targetPlatform,
    structure,
    production: s.productionStyle.trim(),
    instructions: s.additionalInstructions.trim(),
    songBlueprint: activeSongBlueprint(s.songBlueprint),
  };
  assertGenerationRequestBudget(input);
  return input;
}
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function previewOfflineAtlasCandidate(
  rawSetup: string,
  rawRequest: unknown,
  rawAuthority: unknown,
) {
  const authority = authoritySchema.parse(rawAuthority);
  const request = atlasCandidateRequestSchema.parse(rawRequest);
  const before = parseOfflineCandidateSetup(rawSetup);
  offlineSetupToPromptInput(before);
  const candidate = readOfflineAtlasCandidates().find(
    (t) => t.techniqueId === request.techniqueIds[0],
  );
  if (!candidate || candidate.profileId !== request.profileId)
    throw new Error("unknown_or_mismatched_candidate");
  const mapping = candidate.generatorMappingStep3;
  if (
    mapping.mappingStatus !== "manual_import_candidate_unverified" ||
    !mapping.inputField ||
    !mapping.candidateInstructionEN
  )
    throw new Error("non_candidate_cannot_inject");
  const section = before.songBlueprint[request.scope.structureIndex];
  if (
    !section ||
    !isDeepStrictEqual(
      {
        structureIndex: section.structureIndex,
        sectionType: section.sectionType,
        occurrence: section.occurrence,
        ...(section.sectionId ? { sectionId: section.sectionId } : {}),
      },
      request.scope,
    )
  )
    throw new Error("scope_mismatch");
  if (request.intent === "fictional-wedding-dialogue" && request.voices !== "two-groups")
    throw new Error("conflicting_voice_options");
  if (request.intent === "group-refrain" && request.voices === "solo")
    throw new Error("conflicting_voice_options");
  if (
    candidate.techniqueId === "ru.protyazhnaya.option.2" &&
    request.intent !== "traditional-phrasing"
  )
    throw new Error("traditional_intent_not_requested");
  if (
    request.profileId === "ru.wedding_folk" &&
    (request.intent !== "fictional-wedding-dialogue" || request.voices !== "two-groups")
  )
    throw new Error("wedding_intent_not_requested");
  if (
    request.profileId === "ru.khorovod" &&
    (request.intent !== "group-refrain" || request.voices === "solo")
  )
    throw new Error("group_intent_not_requested");
  let instruction = mapping.candidateInstructionEN;
  if (request.pilotId) {
    const p = readOfflineAtlasPilots().find((p) => p.caseId === request.pilotId);
    if (!p || p.techniqueId !== candidate.techniqueId || p.targetInputField !== mapping.inputField)
      throw new Error("pilot_pair_mismatch");
    instruction = p.instructionEN;
  }
  const targetField = mapping.inputField;
  const prior = before[targetField];
  if (prior.includes(instruction)) throw new Error("duplicate_candidate_text"); // rejection only; never infers ownership or removes manual text
  const insertion = `[${section.sectionType} #${section.occurrence}] ${instruction}`;
  const after = structuredClone(before);
  after[targetField] = prior + (prior && !prior.endsWith("\n") ? "\n" : "") + insertion;
  strictSetup.parse(after);
  offlineSetupToPromptInput(after);
  const body = {
    format: "promptbeats-atlas-offline-preview" as const,
    schemaVersion: 1 as const,
    executable: false as const,
    providerCalls: 0 as const,
    sourceSha256: ATLAS_STEP4C_SHA,
    actorId: authority.actorId,
    request,
    before,
    after,
    diff: [{ field: targetField, before: prior, after: after[targetField] }],
    warnings: [
      "Unverified editorial candidate; no musical compatibility or audible benefit established.",
      "Generic supplied controls are not evidence of genre suitability.",
      "Manual constraints win; review the complete preview before offline materialization.",
      "Return one finished song in the existing four-field output contract, not alternative outputs.",
    ],
  };
  return { ...body, previewSha256: fingerprint(body) };
}
export type AtlasOfflinePreview = ReturnType<typeof previewOfflineAtlasCandidate>;

/** A local content-bound confirmation, not a live authorization/CAS receipt. */
export function materializeOfflineAtlasCandidate(
  rawSetup: string,
  preview: AtlasOfflinePreview,
  confirmation: unknown,
  authority: AtlasOfflineAuthority,
) {
  const c = z
    .strictObject({
      actorId: id,
      previewSha256: z.string().regex(/^[a-f0-9]{64}$/),
      acceptUnverified: z.literal(true),
      manualCompatibility: z.literal("reviewed_no_conflict"),
    })
    .parse(confirmation);
  const fresh = previewOfflineAtlasCandidate(rawSetup, preview.request, authority);
  if (
    c.actorId !== authority.actorId ||
    c.previewSha256 !== fresh.previewSha256 ||
    !isDeepStrictEqual(preview, fresh)
  )
    throw new Error("stale_or_foreign_preview");
  return {
    format: "promptbeats-atlas-offline-result",
    schemaVersion: 1,
    executable: false,
    preview: fresh,
  };
}

export function renderOfflineCandidatePrompts(preview: AtlasOfflinePreview) {
  const template = readFileSync(
    new URL("../../docs/prompts/PromptBeats_V5_BETA_2_Master_Prompt_CANDIDATE.md", import.meta.url),
    "utf8",
  );
  return {
    controlV5Beta1: buildAdvancedGeneratorPromptV5Beta1(offlineSetupToPromptInput(preview.before)),
    candidateV5Beta1: buildAdvancedGeneratorPromptV5Beta1(offlineSetupToPromptInput(preview.after)),
    controlV5Beta2: buildRegistryPrompt(template, offlineSetupToPromptInput(preview.before)),
    candidateV5Beta2: buildRegistryPrompt(template, offlineSetupToPromptInput(preview.after)),
  };
}
export function correctedSuppliedPilotControl(supplied: string) {
  const raw = JSON.parse(supplied) as { setup: AdvancedGeneratorSetup };
  const corrections: Array<{ field: string; before: string; after: string; reason: string }> = [];
  if (raw.setup.bpmMode === "custom") {
    corrections.push({
      field: "bpmMode",
      before: "custom",
      after: "Custom",
      reason:
        "Actual Generator recognizes Custom, not lowercase custom. Tempo unchanged; only derived offline control is corrected.",
    });
    raw.setup.bpmMode = "Custom";
  }
  const text = serializeAdvancedSetup(strictSetup.parse(raw.setup), fixedDate);
  parseOfflineCandidateSetup(text);
  return { text, corrections, musicalSuitability: "not_assessed_generic_control" as const };
}

/** Reproducible contract fixtures, not owner-approved genre or vocal choices. */
export function prepareOfflineAtlasPilot(caseId: string) {
  const p = readOfflineAtlasPilots().find((p) => p.caseId === caseId);
  if (!p) throw new Error("unknown_pilot");
  const control = correctedSuppliedPilotControl(p.suppliedA);
  const setup = parseOfflineCandidateSetup(control.text);
  const section = setup.songBlueprint.find((s) => s.sectionType === "Verse");
  if (!section) throw new Error("pilot_scope_missing");
  const candidate = readOfflineAtlasCandidates().find((t) => t.techniqueId === p.techniqueId)!;
  const wedding = candidate.profileId === "ru.wedding_folk",
    group = candidate.profileId === "ru.khorovod";
  const request: AtlasCandidateRequest = {
    profileId: candidate.profileId,
    techniqueIds: [p.techniqueId],
    optIn: true,
    acceptUnverified: true,
    scope: {
      structureIndex: section.structureIndex,
      sectionType: section.sectionType,
      occurrence: section.occurrence,
      ...(section.sectionId ? { sectionId: section.sectionId } : {}),
    },
    intent: wedding
      ? "fictional-wedding-dialogue"
      : group
        ? "group-refrain"
        : p.techniqueId === "ru.protyazhnaya.option.2"
          ? "traditional-phrasing"
          : "general",
    voices: wedding ? "two-groups" : group ? "group" : "solo",
    pilotId: caseId,
  };
  return {
    ...control,
    request,
    suppliedA: p.suppliedA,
    suppliedB: p.suppliedB,
    manualIntentReviewRequired: true,
    sourceFixtureExecutedOnProvider: false,
  };
}
