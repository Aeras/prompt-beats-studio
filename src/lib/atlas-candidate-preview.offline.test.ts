import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  atlasCompletionSummary,
  readOfflineAtlasCandidates,
  readOfflineAtlasPilots,
  validateAtlasCompletionArchive,
} from "./atlas-completion-package.offline";
import {
  materializeOfflineAtlasCandidate,
  offlineSetupToPromptInput,
  parseOfflineCandidateSetup,
  prepareOfflineAtlasPilot,
  previewOfflineAtlasCandidate,
  renderOfflineCandidatePrompts,
} from "./atlas-candidate-preview.offline";
import { parseAdvancedSetup, serializeAdvancedSetup } from "./advanced-generator-setup";
import { renderAtlasCandidatePreviewHtml } from "./atlas-candidate-view.offline";

const authority = { mode: "offline", permission: "local-review", actorId: "reviewer" } as const;
const fixture = () => prepareOfflineAtlasPilot("ATLAS-OFFLINE-01");
const serialize = (s: ReturnType<typeof parseOfflineCandidateSetup>) =>
  serializeAdvancedSetup(s, new Date("2026-10-31T11:00:00Z"));
describe("immutable offline completion package", () => {
  test("all candidate pairs remain preliminary or explicitly unknown", () => {
    expect(atlasCompletionSummary()).toEqual({
      techniques: 123,
      candidates: 107,
      held: 16,
      candidatePairs: 5671,
      preliminaryPairs: 57,
      unknownPairs: 5614,
      priorityUnknownPairs: 975,
      verifiedCompatible: 0,
      verifiedConflicts: 0,
    });
    const bytes = readFileSync(
      new URL("../../research/atlas-v4-completion-20261031.zip", import.meta.url),
    );
    bytes[100] ^= 1;
    expect(() => validateAtlasCompletionArchive(bytes)).toThrow();
  });
  for (const n of Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"))) {
    test(`real setup → scoped preview → V5 A/B rendering ${n}`, () => {
      const f = prepareOfflineAtlasPilot(`ATLAS-OFFLINE-${n}`);
      const originalA = JSON.parse(f.suppliedA),
        originalB = JSON.parse(f.suppliedB);
      expect(parseAdvancedSetup(f.suppliedA).ok).toBe(true);
      expect(parseAdvancedSetup(f.suppliedB).ok).toBe(true);
      expect(() => offlineSetupToPromptInput(originalA.setup)).toThrow("invalid_bpm");
      expect(f.corrections).toHaveLength(1);
      expect(JSON.parse(f.text).setup.customBpm).toBe(originalA.setup.customBpm);
      expect(
        Object.keys(originalA.setup).filter(
          (k) => JSON.stringify(originalA.setup[k]) !== JSON.stringify(originalB.setup[k]),
        ),
      ).toEqual(["additionalInstructions"]);
      const source = readOfflineAtlasPilots().find((p) => p.caseId === f.request.pilotId)!;
      expect(originalB.setup.additionalInstructions).toContain(source.instructionEN);
      const p = previewOfflineAtlasCandidate(f.text, f.request, authority);
      expect(p.diff).toHaveLength(1);
      expect(p.diff[0]!.field).toBe("additionalInstructions");
      expect(p.after.additionalInstructions.startsWith(p.before.additionalInstructions)).toBe(true);
      for (const k of Object.keys(p.before) as Array<keyof typeof p.before>)
        if (k !== "additionalInstructions") expect(p.after[k]).toEqual(p.before[k]);
      expect(parseAdvancedSetup(serialize(p.after)).ok).toBe(true);
      const prompts = renderOfflineCandidatePrompts(p);
      expect(prompts.candidateV5Beta1).toContain(source.instructionEN);
      expect(prompts.candidateV5Beta2).toContain(source.instructionEN);
      expect(prompts.controlV5Beta1).not.toBe(prompts.candidateV5Beta1);
      expect(prompts.controlV5Beta2).not.toBe(prompts.candidateV5Beta2);
      const c = {
        actorId: authority.actorId,
        previewSha256: p.previewSha256,
        acceptUnverified: true,
        manualCompatibility: "reviewed_no_conflict",
      };
      const result = materializeOfflineAtlasCandidate(f.text, p, c, authority);
      expect(result.executable).toBe(false);
      expect(parseAdvancedSetup(JSON.stringify(result)).ok).toBe(false);
      expect(previewOfflineAtlasCandidate(f.text, f.request, authority)).toEqual(p);
    });
  }
});
describe("offline fail closed boundaries", () => {
  test("explicit consent, local permission, exact one candidate and source identity", () => {
    const f = fixture();
    for (const patch of [
      { optIn: false },
      { acceptUnverified: false },
      { techniqueIds: [] },
      { techniqueIds: [f.request.techniqueIds[0], f.request.techniqueIds[0]] },
      { techniqueIds: ["unknown"] },
      { profileId: "unknown" },
      { extra: true },
      { scope: { ...f.request.scope, occurrence: 99 } },
    ])
      expect(() =>
        previewOfflineAtlasCandidate(f.text, { ...f.request, ...patch }, authority),
      ).toThrow();
    for (const a of [
      { ...authority, permission: "denied" },
      { ...authority, mode: "production" },
      {},
    ])
      expect(() => previewOfflineAtlasCandidate(f.text, f.request, a)).toThrow();
    for (const held of readOfflineAtlasCandidates().filter(
      (t) => t.generatorMappingStep3.mappingStatus !== "manual_import_candidate_unverified",
    ))
      expect(() =>
        previewOfflineAtlasCandidate(
          f.text,
          {
            ...f.request,
            techniqueIds: [held.techniqueId],
            profileId: held.profileId,
            pilotId: undefined,
          },
          authority,
        ),
      ).toThrow("non_candidate");
  });
  test("stale, altered and foreign confirmation cannot materialize", () => {
    const f = fixture(),
      p = previewOfflineAtlasCandidate(f.text, f.request, authority);
    const c = {
      actorId: authority.actorId,
      previewSha256: p.previewSha256,
      acceptUnverified: true,
      manualCompatibility: "reviewed_no_conflict",
    };
    const edited = { ...p.before, theme: "Later manual edit" };
    expect(() => materializeOfflineAtlasCandidate(serialize(edited), p, c, authority)).toThrow();
    expect(() =>
      materializeOfflineAtlasCandidate(f.text, { ...p, after: edited }, c, authority),
    ).toThrow();
    expect(() =>
      materializeOfflineAtlasCandidate(f.text, p, { ...c, actorId: "someone-else" }, authority),
    ).toThrow();
    expect(() =>
      materializeOfflineAtlasCandidate(
        f.text,
        p,
        { ...c, manualCompatibility: "conflict" },
        authority,
      ),
    ).toThrow();
  });
  test("malformed Blueprint, overflow, duplicate insertion and mismatched pilot reject", () => {
    const f = fixture(),
      s = parseOfflineCandidateSetup(f.text);
    expect(() =>
      previewOfflineAtlasCandidate(
        f.text,
        { ...f.request, pilotId: "ATLAS-OFFLINE-02" },
        authority,
      ),
    ).toThrow();
    const malformed = JSON.parse(f.text);
    malformed.setup.songBlueprint[0].occurrence = 9;
    expect(() => parseOfflineCandidateSetup(JSON.stringify(malformed))).toThrow();
    malformed.setup.songBlueprint[0].occurrence = 1;
    malformed.setup.songBlueprint[0].extra = true;
    expect(() => parseOfflineCandidateSetup(JSON.stringify(malformed))).toThrow();
    s.additionalInstructions = "x".repeat(1990);
    expect(() => previewOfflineAtlasCandidate(serialize(s), f.request, authority)).toThrow();
    const p = previewOfflineAtlasCandidate(f.text, f.request, authority);
    expect(() => previewOfflineAtlasCandidate(serialize(p.after), f.request, authority)).toThrow(
      "duplicate",
    );
  });
  test("production and instrument mapping never silently reroute or truncate", () => {
    const f = fixture();
    for (const field of ["productionStyle", "customInstruments"] as const) {
      const candidates = readOfflineAtlasCandidates().filter(
        (t) =>
          t.generatorMappingStep3.mappingStatus === "manual_import_candidate_unverified" &&
          t.generatorMappingStep3.inputField === field &&
          !["ru.wedding_folk", "ru.khorovod"].includes(t.profileId),
      );
      let successes = 0;
      for (const t of candidates) {
        const s = parseOfflineCandidateSetup(f.text);
        s[field] = "";
        const request = {
          ...f.request,
          profileId: t.profileId,
          techniqueIds: [t.techniqueId],
          pilotId: undefined,
        };
        try {
          const p = previewOfflineAtlasCandidate(serialize(s), request, authority);
          expect(p.diff[0]!.field).toBe(field);
          expect(p.after.additionalInstructions).toBe(s.additionalInstructions);
          successes++;
        } catch (error) {
          expect(String(error)).toMatch(/limit|long|length|characters|input|exceed/i);
        }
      }
      // The actual authoring bounds remain authoritative even if no source instruction fits.
      expect(candidates.length).toBeGreaterThan(0);
      if (field === "productionStyle") expect(successes).toBeGreaterThan(0);
    }
  });
  test("static preview escapes synthetic injection and disables connections", () => {
    const f = fixture(),
      s = parseOfflineCandidateSetup(f.text);
    s.additionalInstructions = '<script>fetch("https://example.test")</script>';
    const html = renderAtlasCandidatePreviewHtml(
      previewOfflineAtlasCandidate(serialize(s), f.request, authority),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("connect-src 'none'");
  });
});
