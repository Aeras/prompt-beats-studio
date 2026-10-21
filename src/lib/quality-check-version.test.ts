import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { durableQualityCheckInput } from "./quality-check-job-schema";
import { normalizeUnambiguousZeroBasedCorrections } from "./quality-check-core.server";

const song = {
  targetPlatform: "suno" as const,
  theme: "Real-life story",
  genre: "Pop",
  mood: "Warm",
  language: "Greek",
  result: {
    title: "Example",
    tags: "Pop",
    lyrics: "[Verse]\nΚάποιος στίχος",
    note: "Soft",
  },
};

describe("Quality Check V2.1 correction index normalization", () => {
  const lyrics =
    "[Verse 1]\n[Female lead]\nГазету развернула на весах.\n[Chorus 1]\nСогреет нас.\n[Chorus 2]\nСогреет нас.";

  test("repairs zero only when the exact lyric target and section are unambiguous", () => {
    const report = {
      corrections: [
        {
          field: "lyrics",
          sectionLabel: "Verse 1",
          occurrenceIndex: 0,
          originalText: "Газету развернула на весах.",
        },
      ],
    };
    const output = normalizeUnambiguousZeroBasedCorrections(report, lyrics) as typeof report;
    expect(output.corrections[0]?.occurrenceIndex).toBe(1);
  });

  test("recovers a repeated hook only when its section is explicit", () => {
    const report = {
      corrections: [
        {
          field: "lyrics",
          sectionLabel: "Chorus 1",
          occurrenceIndex: 0,
          originalText: "Согреет нас.",
        },
      ],
    };
    const output = normalizeUnambiguousZeroBasedCorrections(report, lyrics) as typeof report;
    expect(output.corrections[0]?.occurrenceIndex).toBe(1);
  });

  test("does not guess when the same text repeats inside one section", () => {
    const report = {
      corrections: [
        { field: "lyrics", sectionLabel: "Verse 1", occurrenceIndex: 0, originalText: "echo" },
      ],
    };
    const output = normalizeUnambiguousZeroBasedCorrections(
      report,
      "[Verse 1]\necho\necho",
    ) as typeof report;
    expect(output.corrections[0]?.occurrenceIndex).toBe(0);
  });

  test("does not coerce negative or non-integer values", () => {
    const report = {
      corrections: [
        {
          field: "lyrics",
          sectionLabel: "Verse 1",
          occurrenceIndex: -1,
          originalText: "Газету развернула на весах.",
        },
      ],
    };
    const output = normalizeUnambiguousZeroBasedCorrections(report, lyrics) as typeof report;
    expect(output.corrections[0]?.occurrenceIndex).toBe(-1);
  });
});

describe("V2.1 OpenAI long-running request safety", () => {
  test("extends only the durable Sol V2.1 request and identifies timeout errors", () => {
    const core = readFileSync("src/lib/quality-check-core.server.ts", "utf8");
    const provider = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    expect(core).toContain('data.qualityCheckVersion === "v2.1"');
    expect(core).toContain("requestTimeoutMs: 12 * 60 * 1000");
    expect(core).toContain('"provider_timeout"');
    expect(core).toContain('err.name === "TimeoutError"');
    expect(provider).toContain("if (call.requestTimeoutMs !== undefined)");
    expect(provider).toContain("Math.min(call.requestTimeoutMs, 12 * 60 * 1000)");
  });
});

describe("Gemini Argon provider failure diagnostics", () => {
  test("preserves provider HTTP status and classifies durable Quality Check failures", () => {
    const provider = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    const core = readFileSync("src/lib/quality-check-core.server.ts", "utf8");
    expect(provider).toContain("export class AiProviderHttpError extends Error");
    expect(provider).toContain('new AiProviderHttpError("gemini", response.status, providerCode)');
    expect(core).toContain("err instanceof providerLayer.AiProviderHttpError");
    expect(core).toContain('"provider_rate_limited"');
    expect(core).toContain('"provider_unavailable"');
    expect(core).toContain('"provider_rejected"');
  });
});

describe("Quality Check version isolation", () => {
  test("missing version remains V1 for every existing caller", () => {
    expect(durableQualityCheckInput.parse(song).qualityCheckVersion).toBe("v1");
    expect(
      durableQualityCheckInput.parse({ ...song, qualityCheckVersion: "v2" }).qualityCheckVersion,
    ).toBe("v2");
    expect(
      durableQualityCheckInput.parse({ ...song, qualityCheckVersion: "v2.1" }).qualityCheckVersion,
    ).toBe("v2.1");
    expect(durableQualityCheckInput.safeParse({ ...song, qualityCheckVersion: "v3" }).success).toBe(
      false,
    );
  });

  test("super-admin authorization is checked on admission and again in the worker", () => {
    const admission = readFileSync("src/lib/quality-check-jobs.functions.ts", "utf8");
    const worker = readFileSync("src/lib/quality-check-jobs.server.ts", "utf8");
    expect(admission).toContain('data.qualityCheckVersion !== "v1"');
    expect(admission).toContain('"current_user_is_super_admin"');
    expect(worker).toContain('payload.qualityCheckVersion !== "v1"');
    expect(worker).toContain('.from("user_roles")');
    expect(worker).toContain('.eq("role", "super_admin")');
  });

  test("the generator UI preserves all three selectable QC versions", () => {
    const ui = readFileSync("src/routes/generate.tsx", "utf8");
    expect(ui).toContain('option value="v2.1"');
    expect(ui).toContain('selected === "v2.1"');
    expect(ui).toContain("onQualityCheckVersionChange(selected)");
    expect(ui).not.toContain('e.target.value === "v2" ? "v2" : "v1"');
  });

  test("V1 and V2 prompts remain available alongside an independent V2.1 prompt", () => {
    const core = readFileSync("src/lib/quality-check-core.server.ts", "utf8");
    expect(core).toContain("const QUALITY_SYSTEM_PROMPT =");
    expect(core).toContain("const QUALITY_V2_SYSTEM_PROMPT =");
    expect(core).toContain("const QUALITY_V21_SYSTEM_PROMPT =");
    expect(core).toContain('data.qualityCheckVersion === "v2.1"');
    expect(core).toContain('data.qualityCheckVersion === "v2"');
    expect(core).toContain("QUALITY_V21_SYSTEM_PROMPT");
  });
});
