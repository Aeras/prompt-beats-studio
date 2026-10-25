import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import ts from "typescript";
import { z } from "zod";
import {
  analyzerV2Compatibility,
  analyzerV2ProvenanceSchema,
  boundedEssentiaInput,
  essentiaOnlyEvidence,
  analyzerAudioMimeSchema,
} from "./song-analyzer-v2.shared";
import { stage0DspEvidenceSchema, type Stage0DspEvidence } from "./song-analyzer-dsp.shared";
import { runSingleCallAnalyzerV2 } from "./song-analyzer-v2.server";
import { analyzerV2GeneratorPatch } from "./song-analyzer-handoff.shared";

function selectedSource(path: string, names: string[]) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  return names
    .map((name) => {
      for (const node of source.statements) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
        if (ts.isVariableStatement(node)) {
          const declaration = node.declarationList.declarations.find(
            (item) => item.name.getText(source) === name,
          );
          if (declaration) return `const ${declaration.getText(source)};`;
        }
      }
      throw new Error(`Missing real declaration: ${name}`);
    })
    .join("\n");
}
function isolated<T>(source: string, bindings: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, Error, ...bindings });
  return exports as T;
}
const canonical = isolated<{ schema: z.ZodType<Song>; responseSchema: Record<string, unknown> }>(
  `${selectedSource("src/lib/song-analyzer.functions.ts", ["confidenceSchema", "bpmSchema", "uncertainObservationSchema", "songAnalysisResultSchema", "ANALYZER_RESPONSE_SCHEMA"])}\nexports.schema=songAnalysisResultSchema;exports.responseSchema=ANALYZER_RESPONSE_SCHEMA;`,
  { z, analyzerV2ProvenanceSchema },
);
type Song = {
  generatorReady: {
    musicStyle: string;
    mood: string;
    instruments: string[];
    bpm: {
      approximate: number | null;
      rangeMin: number | null;
      rangeMax: number | null;
      confidence: "medium";
      notes: string;
    };
    songStructure: string[];
    productionStyle: string;
    additionalInstructions: string;
  };
  detailedAnalysis: Record<string, unknown>;
};
const song: Song = {
  generatorReady: {
    musicStyle: "Piano pop",
    mood: "Warm",
    instruments: ["Piano"],
    bpm: {
      approximate: 90,
      rangeMin: null,
      rangeMax: null,
      confidence: "medium",
      notes: "Possible half time",
    },
    songStructure: ["Verse", "Chorus"],
    productionStyle: "Soft piano",
    additionalInstructions: "Quiet intro",
  },
  detailedAnalysis: {
    genreAndStyle: "Piano pop",
    moodAndEmotionalArc: "Warm",
    tempoAndGroove: "Relaxed",
    instrumentation: [{ observation: "Piano", confidence: "high" }],
    arrangement: "Piano throughout",
    songStructure: "Verse then chorus",
    vocals: "Soft singing",
    productionAndMix: [{ observation: "Dry voice", confidence: "medium" }],
    dynamicsAndEnergy: "Restrained",
    notableCharacteristics: ["Piano"],
    confidenceAndUncertaintyNotes: ["Tempo is ambiguous"],
  },
};
const evidence: Stage0DspEvidence = stage0DspEvidenceSchema.parse({
  version: "stage0-dsp-v1",
  available: true,
  engine: {
    name: "essentia",
    engineVersion: "0.1.3",
    methodVersion: "promptbeats-essentia-stage0-v2",
    algorithms: ["RhythmExtractor2013", "KeyExtractor"],
  },
  processing: {
    decodeMs: 1,
    dspMs: 2,
    totalMs: 3,
    sourceSampleRate: 44100,
    analysisSampleRate: 44100,
    durationSeconds: 180,
    channels: 2,
  },
  tempo: {
    primaryBpm: 90,
    halfTimeCandidate: 45,
    doubleTimeCandidate: 180,
    confidence: 0.5,
    stable: true,
    stabilityScore: 0.8,
    ambiguous: true,
    notes: "Legacy comparison BPM: 140.",
  },
  rhythm: {
    beatStrength: 0.5,
    onsetDensity: 2,
    meterCandidate: "4/4",
    meterConfidence: 0.8,
    beatTimestamps: [0, 1, 2],
    notes: "Legacy meter",
  },
  energy: {
    meanRms: 0.5,
    stdRms: 0.1,
    dynamicRangeDb: 8,
    loudnessDb: -10,
    dynamicComplexity: 3,
    energySegments: [{ startSec: 0, endSec: 30, meanRms: 0.5, relativeEnergy: 0.5 }],
    majorChanges: [],
  },
  tonal: {
    keyCandidate: "C major",
    scaleCandidate: "major",
    keyConfidence: 0.5,
    chromaSummary: Array(12).fill(0.3),
    notes: "legacy chroma",
  },
  spectral: {
    spectralCentroidHz: 1000,
    brightness: 0.3,
    lowFrequencyEnergy: 0.5,
    highFrequencyEnergy: 0.2,
  },
  sectionChangeCandidates: [{ timeSec: 10, strength: 0.2 }],
  limitations: ["Legacy diagnostics"],
});
const audio = Buffer.from("ID3OFFLINE_AUDIO_FIXTURE").toString("base64");
const models = [
  { id: "gpt-audio-1.5", provider: "openai" as const },
  { id: "gemini-3.8-flash", provider: "gemini" as const },
  { id: "openai/gpt-audio", provider: "openrouter" as const },
];
function envelope(provider: string, text = JSON.stringify(song), finish?: string) {
  return provider === "gemini"
    ? {
        usageMetadata: {
          promptTokenCount: 500,
          candidatesTokenCount: 900,
          thoughtsTokenCount: 100,
          totalTokenCount: 1500,
        },
        candidates: [{ finishReason: finish ?? "STOP", content: { parts: [{ text }] } }],
      }
    : {
        usage: { prompt_tokens: 500, completion_tokens: 1000, total_tokens: 1500 },
        choices: [{ finish_reason: finish ?? "stop", message: { content: text } }],
      };
}
function invocation(model = models[0]!) {
  let calls = 0;
  let started = 0;
  const usage: Array<{ success: boolean; usage: unknown }> = [];
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  const args = {
    model: {
      ...model,
      label: model.id,
      acceptedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
    },
    apiKey: "OFFLINE_FAKE_KEY",
    audioBase64: audio,
    mimeType: "audio/mpeg",
    stage0Evidence: evidence,
    schema: canonical.responseSchema,
    validator: canonical.schema,
    markProviderStarted: async () => {
      started++;
    },
    recordUsage: async (value: unknown, success: boolean) => {
      usage.push({ usage: value, success });
    },
    fetcher: (async (url, init) => {
      calls++;
      expect(started).toBe(1);
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(envelope(model.provider)));
    }) as typeof fetch,
  };
  return { args, usage, requests, calls: () => calls, started: () => started };
}

describe("Analyzer V2 single dispatch and complete canonical report", () => {
  for (const model of models)
    test(`${model.provider} listens to actual audio + bounded Essentia, exactly once`, async () => {
      const f = invocation(model);
      const response = await runSingleCallAnalyzerV2(f.args);
      expect(response.result).toEqual(song);
      expect(canonical.schema.safeParse(response.result).success).toBe(true);
      expect(f.calls()).toBe(1);
      expect(f.usage).toHaveLength(1);
      expect(f.usage[0]?.success).toBe(true);
      const body = f.requests[0]!.body;
      const encoded = JSON.stringify(body);
      expect(encoded).toContain(audio);
      expect(encoded).toContain("RhythmExtractor2013");
      expect(encoded).toContain("generatorReady");
      expect(encoded).toContain("detailedAnalysis");
      expect(encoded).not.toContain("Legacy comparison BPM");
      expect(encoded).not.toContain('beatTimestamps\\":[0,1,2]');
      if (model.provider !== "gemini") {
        expect(f.requests[0]!.url).not.toContain("googleapis");
        expect(body["response_format"]).toBe(undefined); // GPT Audio has no native structured-output support.
        expect(body["messages"][1].content[1].type).toBe("input_audio");
        expect(body["messages"][1].content[1].input_audio.format).toBe("mp3");
      } else {
        expect(body["generationConfig"].responseSchema).toEqual(canonical.responseSchema);
        expect(body["contents"][0].parts[0].inlineData.data).toBe(audio);
        expect(body["tools"]).toBe(undefined);
      }
      if (model.provider === "openrouter") expect(body["provider"].allow_fallbacks).toBe(false);
    });

  test("Essentia projection strips legacy measurements, huge arrays, memory and stems", () => {
    const projected = essentiaOnlyEvidence(evidence);
    expect(projected.rhythm?.beatTimestamps).toEqual([]);
    expect(projected.rhythm?.meterCandidate).toBe(null);
    expect(projected.energy?.meanRms).toBe(null);
    expect(projected.energy?.loudnessDb).toBe(-10);
    expect(projected.sectionChangeCandidates).toEqual([]);
    expect(projected.spectral?.brightness).toBe(null);
    expect(JSON.stringify(boundedEssentiaInput(evidence)).length < 5000).toBe(true);
    expect(() =>
      essentiaOnlyEvidence({ ...evidence, engine: { ...evidence.engine!, name: "legacy" } }),
    ).toThrow("requires successful Essentia");
  });

  test("unreviewed models (including NVIDIA/OpenRouter unknowns) cannot silently fall back", async () => {
    expect(
      analyzerV2Compatibility({ id: "nvidia/unreviewed-omni", provider: "openrouter" }).compatible,
    ).toBe(false);
    const f = invocation();
    await expect(
      runSingleCallAnalyzerV2({ ...f.args, model: { ...f.args.model, id: "gpt-unknown" } }),
    ).rejects.toThrow("MODEL_INCOMPATIBLE");
    expect(f.calls()).toBe(0);
    expect(f.started()).toBe(0);
  });

  test("MP3/WAV aliases preserve format; incompatible MIME fails before provider-start", async () => {
    for (const mimeType of ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]) {
      const f = invocation();
      await runSingleCallAnalyzerV2({ ...f.args, mimeType });
      expect(f.calls()).toBe(1);
      expect(f.requests[0]!.body["messages"][1].content[1].input_audio.format).toBe(
        mimeType.includes("wav") ? "wav" : "mp3",
      );
    }
    const f = invocation();
    await expect(runSingleCallAnalyzerV2({ ...f.args, mimeType: "audio/flac" })).rejects.toThrow(
      "UNSUPPORTED_AUDIO_FORMAT",
    );
    expect(f.calls()).toBe(0);
  });

  test("all failures record exactly one outcome and never retry or invoke another provider", async () => {
    for (const model of models)
      for (const failure of [
        "empty",
        "json",
        "schema",
        "truncated",
        "refusal",
        "timeout",
        "http",
      ]) {
        const f = invocation(model);
        let calls = 0;
        const fetcher: typeof fetch = async () => {
          calls++;
          if (failure === "timeout")
            throw new DOMException("private audio/key should not leak", "TimeoutError");
          if (failure === "http") return new Response("private provider detail", { status: 401 });
          return new Response(
            JSON.stringify(
              envelope(
                model.provider,
                failure === "empty"
                  ? ""
                  : failure === "json"
                    ? "bad PRIVATE_RESPONSE"
                    : failure === "schema"
                      ? "{}"
                      : JSON.stringify(song),
                failure === "truncated"
                  ? model.provider === "gemini"
                    ? "MAX_TOKENS"
                    : "length"
                  : failure === "refusal"
                    ? model.provider === "gemini"
                      ? "SAFETY"
                      : "content_filter"
                    : undefined,
              ),
            ),
          );
        };
        let message = "";
        try {
          await runSingleCallAnalyzerV2({ ...f.args, fetcher });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toContain("Analyzer V2:");
        expect(message).not.toContain("PRIVATE_RESPONSE");
        expect(message).not.toContain("private");
        expect(calls).toBe(1);
        expect(f.usage).toHaveLength(1);
        expect(f.usage[0]?.success).toBe(false);
      }
  });
});

describe("Analyzer handoff preserves user Theme and Language", () => {
  test("fresh and filled Generator states keep Theme/Language and unrelated choices", () => {
    const payload = {
      ...song.generatorReady,
      analyzerVersion: "v2",
      theme: "MUST_NOT_IMPORT",
      language: "Russian",
      generationModel: "MUST_NOT_IMPORT",
    };
    for (const state of [
      { theme: "", language: "Greek", targetPlatform: "udio" },
      { theme: "My own core idea", language: "Japanese", targetPlatform: "suno" },
    ]) {
      const updated = { ...state, ...analyzerV2GeneratorPatch(payload) };
      expect(updated.theme).toBe(state.theme);
      expect(updated.language).toBe(state.language);
      expect(updated.targetPlatform).toBe(state.targetPlatform);
      expect(updated.customGenre).toBe(song.generatorReady.musicStyle);
      expect(updated.songBlueprint).toHaveLength(2);
    }
    const patch = analyzerV2GeneratorPatch({
      analyzerVersion: "v2",
      instruments: [],
      productionStyle: "",
      additionalInstructions: "",
      bpm: { approximate: 90, confidence: "low" },
    });
    expect(Object.keys(patch)).toEqual([]);
  });
  test("the existing V1 handoff still does not assign Theme or Language", () => {
    const source = readFileSync("src/routes/generate.tsx", "utf8");
    const block = source.slice(
      source.indexOf("const raw = window.sessionStorage.getItem(SONG_ANALYZER_HANDOFF_KEY)"),
      source.indexOf("const data = revisionBase.data"),
    );
    expect(block).toContain("analyzerV2GeneratorPatch");
    expect(block).toContain("setCustomGenre(handoff.musicStyle");
    expect(block).not.toContain("setTheme(");
    expect(block).not.toContain("setLanguage(");
  });
});

function endpointFixture(allowed = true) {
  const records = new Map<
    string,
    { status: string; result?: unknown; error?: string; executionToken?: string }
  >();
  const events: string[] = [];
  let providerCalls = 0;
  let usageRows = 0;
  let executionRows = 0;
  const durableSource = selectedSource("src/lib/ai-auxiliary-idempotency.server.ts", [
    "executeDurableAuxiliaryAiRequest",
  ]);
  const durable = isolated<{
    execute: typeof import("./ai-auxiliary-idempotency.server").executeDurableAuxiliaryAiRequest;
  }>(`${durableSource}\nexports.execute=executeDurableAuxiliaryAiRequest;`, {
    auxiliaryRequestKeySchema: z.string().guid(),
    withAiDispatchAdmission: async (execute: () => Promise<unknown>) => execute(),
    auxiliaryModelContext: { run: (_scope: unknown, execute: () => unknown) => execute() },
    startAuxiliaryModel: async (model: string) => {
      expect(model).toBeTruthy();
      events.push("started");
    },
    completeAuxiliaryAiRequest: async (args: { requestKey: string; result: unknown }) => {
      records.set(args.requestKey, { status: "completed", result: args.result });
    },
    failAuxiliaryAiRequest: async (args: { requestKey: string; errorMessage: string }) => {
      records.set(args.requestKey, { status: "failed", error: args.errorMessage });
    },
  });
  type Handler = (args: {
    data: Record<string, unknown>;
    context: { userId: string; supabase: unknown };
  }) => Promise<any>;
  const endpoint = isolated<{ handler: Handler }>(
    `${selectedSource("src/lib/song-analyzer-v2.functions.ts", ["analyzeSongV2Input", "v2RequestKey", "analyzeSongV2"])}\nexports.handler=analyzeSongV2;`,
    {
      z,
      Buffer,
      crypto,
      beginExecution: async () => {
        executionRows++;
      },
      checkpointExecution: async () => {},
      observeExecution: async () => {},
      createHash,
      stage0DspEvidenceSchema,
      analyzerAudioMimeSchema,
      auxiliaryRequestKeySchema: z.string().guid(),
      analyzerV2ProvenanceSchema,
      essentiaOnlyEvidence,
      createServerFn: () => ({
        middleware: () => ({
          inputValidator: (validator: (input: unknown) => unknown) => ({
            handler: (handler: Handler) => (args: Parameters<Handler>[0]) =>
              handler({ ...args, data: validator(args.data) as Record<string, unknown> }),
          }),
        }),
      }),
      requireSupabaseAuth: {},
      requireAnalyzerAccess: async () => {
        events.push("authorized");
        if (!allowed) throw new Error("Feature not available");
      },
      executeDurableAuxiliaryAiRequest: durable.execute,
      analyzerV2AdminEnabled: async () => false,
      resolveSongAnalyzerModel: async (id: string) => ({
        id,
        label: "GPT Audio 1.5",
        provider: "openai",
        acceptedMimeTypes: ["audio/mpeg"],
      }),
      process: { env: { OPENAI_API_KEY: "OFFLINE_FAKE_KEY" } },
      SONG_ANALYZER_MAX_FILE_BYTES: 15 * 1024 * 1024,
      ANALYZER_RESPONSE_SCHEMA: canonical.responseSchema,
      songAnalysisResultSchema: canonical.schema,
      runSingleCallAnalyzerV2: (args: Parameters<typeof runSingleCallAnalyzerV2>[0]) =>
        runSingleCallAnalyzerV2({
          ...args,
          fetcher: async () => {
            providerCalls++;
            expect(events.at(-1)).toBe("started");
            return new Response(JSON.stringify(envelope("openai")));
          },
        }),
      recordAiUsage: async () => {
        usageRows++;
      },
    },
  );
  const context = {
    userId: "test-user",
    supabase: {
      rpc: async (_name: string, args: { _request_key: string }) => {
        const existing = records.get(args._request_key);
        if (existing) return { data: existing, error: null };
        const claim = { status: "claimed", executionToken: "00000000-0000-4000-8000-000000000009" };
        records.set(args._request_key, { status: "processing" });
        return { data: claim, error: null };
      },
    },
  };
  const data = {
    version: "v2",
    requestKey: "00000000-0000-4000-8000-000000000003",
    audioBase64: audio,
    mimeType: "audio/mpeg",
    model: "gpt-audio-1.5",
    stage0Evidence: evidence,
  };
  return {
    call: async (value = data) => endpoint.handler({ data: value, context }),
    records,
    events,
    calls: () => providerCalls,
    usage: () => usageRows,
    executions: () => executionRows,
    data,
  };
}

describe("real V2 endpoint and durable executor with isolated database doubles", () => {
  test("authorization precedes claims/dispatch and denied users cannot reach a provider", async () => {
    const f = endpointFixture(false);
    await expect(f.call()).rejects.toThrow("Feature not available");
    expect(f.calls()).toBe(0);
    expect(f.records.size).toBe(0);
  });
  test("replay returns the same complete result/provenance with one usage row and no second call", async () => {
    const f = endpointFixture();
    const first = await f.call();
    const second = await f.call();
    expect(second).toEqual(first);
    expect(f.calls()).toBe(1);
    expect(f.usage()).toBe(1);
    expect(f.executions()).toBe(1);
    expect(first.provenance.version).toBe("v2");
    expect(first.provenance.providerCalls).toBe(1);
    expect(first.result.generatorReady.analyzerVersion).toBe("v2");
    expect(first.result.detailedAnalysis.analyzerProvenance.model).toBe("gpt-audio-1.5");
    const saved = isolated<{ schema: z.ZodType<Song> }>(
      `${selectedSource("src/lib/song-analyzer.functions.ts", ["savedSongAnalysisResultSchema"])}\nexports.schema=savedSongAnalysisResultSchema;`,
      { songAnalysisResultSchema: canonical.schema, z, analyzerV2ProvenanceSchema },
    );
    expect(saved.schema.parse(first.result).detailedAnalysis["analyzerProvenance"]).toEqual(
      first.provenance,
    );
    await expect(
      f.call({ ...f.data, audioBase64: Buffer.from("another-file").toString("base64") }),
    ).rejects.toThrow("REQUEST_KEY_MISMATCH");
    expect(f.calls()).toBe(1);
  });
  test("duplicate processing request cannot dispatch twice", async () => {
    const f = endpointFixture();
    const result = await Promise.allSettled([f.call(), f.call()]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(f.executions()).toBe(1);
    expect(f.calls()).toBe(1);
    expect(f.usage()).toBe(1);
  });
  test("empty, oversize and invalid base64 stop before a provider", async () => {
    for (const encoded of [
      "",
      "not:base64",
      Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64"),
    ]) {
      const f = endpointFixture();
      await expect(f.call({ ...f.data, audioBase64: encoded })).rejects.toThrow();
      expect(f.calls()).toBe(0);
    }
  });
  test("new endpoint rejects a V1 discriminant before authorization or dispatch", async () => {
    const f = endpointFixture();
    await expect(f.call({ ...f.data, version: "v1" })).rejects.toThrow();
    expect(f.calls()).toBe(0);
    expect(f.events).toEqual([]);
  });
});

function backgroundFixture(
  options: {
    version?: "v1" | "v2";
    storage?: Map<string, string>;
    wait?: Promise<void>;
    fail?: boolean;
  } = {},
) {
  const storage = options.storage ?? new Map<string, string>();
  const window = {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };
  const auxiliary = isolated<{
    getAuxiliaryRequestKey: (scope: string) => string;
    completeAuxiliaryRequest: (scope: string) => void;
  }>(readFileSync("src/lib/auxiliary-request-key.ts", "utf8"), { window, crypto });
  const ast = ts.createSourceFile(
    "background.ts",
    readFileSync("src/lib/song-analyzer-background.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const source = ast.statements
    .filter((node) => !ts.isImportDeclaration(node))
    .map((node) => node.getText(ast))
    .join("\n");
  const events: string[] = [];
  type Snapshot = {
    status: string;
    analysisArgs: { version?: string } | null;
    result: unknown;
    provenance: unknown;
    error: string | null;
  };
  const background = isolated<{
    startAnalyzerBackground: (args: {
      file: File;
      model: string;
      version?: "v1" | "v2";
    }) => Promise<Snapshot>;
    clearAnalyzerBackground: () => boolean;
    resetV2AnalyzerRequest: () => boolean;
    getAnalyzerBackgroundSnapshot: () => Snapshot;
  }>(source, {
    ...auxiliary,
    window,
    crypto,
    analyzerAudioMimeSchema,
    essentiaOnlyEvidence,
    FileReader: class {
      result: string | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.result = `data:audio/mpeg;base64,${audio}`;
        queueMicrotask(() => this.onload?.());
      }
    },
    analyzeStage0Dsp: async () => {
      events.push("legacy");
      return { ...evidence, engine: { ...evidence.engine!, name: "legacy" } };
    },
    analyzeStage0Essentia: async (_file: File, _legacy: unknown, version?: string) => {
      events.push(`essentia:${version ?? "v1"}`);
      return evidence;
    },
    analyzeSong: async () => {
      events.push("v1");
      return { result: song, stage0Evidence: evidence, stageAEvidence: {}, model: "gpt-audio-1.5" };
    },
    guardSongAnalyzerStageA: async () => {
      events.push("guard");
      return { initialResult: song, stageAEvidence: {} };
    },
    finalizeSongAnalysis: async () => {
      events.push("final");
      return { result: song, finalModelLabel: "V1 Final Judge" };
    },
    analyzeSongV2: async () => {
      events.push("v2");
      await options.wait;
      if (options.fail) throw new Error("V2 transport interrupted");
      return {
        result: song,
        model: "gpt-audio-1.5",
        stage0Evidence: evidence,
        provenance: { version: "v2", model: "gpt-audio-1.5" },
      };
    },
  });
  const args = {
    file: new File(["offline"], "same.mp3", { type: "audio/mpeg" }),
    model: "gpt-audio-1.5",
    version: options.version ?? "v2",
  };
  return {
    ...background,
    args,
    events,
    storage,
    key: () => auxiliary.getAuxiliaryRequestKey("song_analyzer:v2"),
  };
}

describe("actual background routing and browser request lifecycle", () => {
  test("V1 retains the exact legacy→Essentia→analysis→guard→final path", async () => {
    const f = backgroundFixture({ version: "v1" });
    const result = await f.startAnalyzerBackground(f.args);
    expect(result.status).toBe("completed");
    expect(f.events).toEqual(["legacy", "essentia:v1", "v1", "guard", "final"]);
    expect(result.provenance).toBe(null);
  });
  test("V2 branches before V1, cannot change/clear while active and clears old results explicitly", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = backgroundFixture({ wait });
    const first = f.startAnalyzerBackground(f.args);
    expect(f.clearAnalyzerBackground()).toBe(false);
    expect(f.resetV2AnalyzerRequest()).toBe(false);
    expect(f.startAnalyzerBackground({ ...f.args, version: "v1" })).toBe(first);
    release();
    const result = await first;
    expect(f.events).toEqual(["legacy", "essentia:v2", "v2"]);
    expect(result.analysisArgs?.version).toBe("v2");
    expect(f.clearAnalyzerBackground()).toBe(true);
    expect(f.getAnalyzerBackgroundSnapshot().result).toBe(null);
    const route = readFileSync("src/routes/song-analyzer.tsx", "utf8");
    expect(route).toContain("disabled={busy || saving}");
    expect(route).toContain('version === "v1" &&');
  });
  test("V2 failure retains the logical key; only explicit new-action reset releases it", async () => {
    const f = backgroundFixture({ fail: true });
    const key = f.key();
    const result = await f.startAnalyzerBackground(f.args);
    expect(result.status).toBe("failed");
    expect(f.key()).toBe(key);
    expect(f.resetV2AnalyzerRequest()).toBe(true);
    expect(f.key()).not.toBe(key);
  });
  test("refresh of a running V2 snapshot preserves version and offers replay, not a frozen spinner", () => {
    const storage = new Map<string, string>([
      [
        "pb:song-analyzer-background-result-v2",
        JSON.stringify({
          status: "running",
          analysisArgs: { version: "v2", model: "gpt-audio-1.5" },
          fileName: "same.mp3",
        }),
      ],
    ]);
    const f = backgroundFixture({ storage });
    expect(f.getAnalyzerBackgroundSnapshot().status).toBe("failed");
    expect(f.getAnalyzerBackgroundSnapshot().analysisArgs?.version).toBe("v2");
    expect(f.getAnalyzerBackgroundSnapshot().error).toContain("same request");
    expect(f.events).toEqual([]);
  });
});

describe("actual Essentia wrapper keeps V1 and V2 evidence separate", () => {
  test("V2 measurements do not depend on legacy energy/chroma; V1 comparison remains", async () => {
    const wrapper = isolated<{
      analyzeStage0Essentia: (
        file: File,
        legacy: Stage0DspEvidence,
        version?: "v1" | "v2",
      ) => Promise<Stage0DspEvidence>;
    }>(selectedSource("src/lib/song-analyzer-essentia.ts", ["round", "analyzeStage0Essentia"]), {
      performance,
      ESSENTIA_SAMPLE_RATE: 44100,
      decodeForEssentia: async () => ({
        samples: new Float32Array(10),
        sourceSampleRate: 44100,
        durationSeconds: 180,
        channels: 2,
        decodeMs: 1,
      }),
      runWorker: async () => ({
        ok: true,
        result: {
          engineVersion: "0.1.3",
          algorithmNames: ["KeyExtractor"],
          processingMs: 1,
          tempo: {
            primaryBpm: 90,
            confidence: 0.5,
            stable: true,
            stabilityScore: 0.8,
            ambiguous: true,
            estimates: [90],
            notes: "Essentia primary",
          },
          rhythm: {
            beatStrength: 0.5,
            onsetDensity: 2,
            beatTimestamps: [0, 1],
            onsetTimestamps: [0.2],
          },
          tonal: {
            keyCandidate: "C major",
            scaleCandidate: "major",
            keyConfidence: 0.5,
            notes: "Essentia key",
          },
          energy: { loudnessDb: -10, dynamicComplexity: 3 },
          spectral: { spectralCentroidHz: 1000 },
        },
      }),
    });
    const file = new File(["offline"], "same.mp3");
    const v1 = await wrapper.analyzeStage0Essentia(file, evidence);
    expect(v1.tempo?.notes).toContain("Legacy comparison BPM");
    expect(v1.energy?.meanRms).toBe(0.5);
    const v2 = await wrapper.analyzeStage0Essentia(file, { ...evidence, energy: null }, "v2");
    expect(v2.energy?.loudnessDb).toBe(-10);
    expect(v2.energy?.meanRms).toBe(null);
    expect(v2.sectionChangeCandidates).toEqual([]);
    expect(v2.rhythm?.beatTimestamps).toEqual([]);
    expect(JSON.stringify(v2)).not.toContain("Legacy comparison BPM");
    expect(stage0DspEvidenceSchema.safeParse(v2).success).toBe(true);
  });
});

describe("V2 bounded handoff and diagnostic failures", () => {
  test("empty/uncertain fields and ambiguous structures do not erase prior selections", () => {
    expect(
      analyzerV2GeneratorPatch({
        analyzerVersion: "v2",
        musicStyle: "Unknown",
        mood: "Uncertain",
        songStructure: ["Verse", "Unknown section"],
        productionStyle: "Insufficient evidence",
        instruments: ["Unknown"],
      }),
    ).toEqual({});
    const patch = analyzerV2GeneratorPatch({
      analyzerVersion: "v2",
      productionStyle: "p".repeat(4000),
      additionalInstructions: "i".repeat(4000),
    });
    expect(patch.production?.length).toBe(2000);
    expect(patch.instructions?.length).toBe(2000);
  });
  test("credit, input-token, output-token and transport failures remain distinguishable", async () => {
    for (const [status, code, expected] of [
      [429, "insufficient_quota", "PROVIDER_CREDIT_REQUIRED"],
      [400, "context_length_exceeded", "INPUT_TOKEN_LIMIT"],
      [400, "invalid_audio", "AUDIO_REJECTED"],
      [429, "rate_limit_exceeded", "PROVIDER_RATE_LIMIT"],
    ] as const) {
      const f = invocation();
      await expect(
        runSingleCallAnalyzerV2({
          ...f.args,
          fetcher: async () =>
            new Response(JSON.stringify({ error: { code, message: "PRIVATE_USER_CONTENT" } }), {
              status,
            }),
        }),
      ).rejects.toThrow(expected);
      expect(f.usage).toHaveLength(1);
    }
    const f = invocation(models[1]!);
    await expect(
      runSingleCallAnalyzerV2({ ...f.args, audioBase64: "A".repeat(20_000_000) }),
    ).rejects.toThrow("INLINE_AUDIO_REQUEST_TOO_LARGE");
    expect(f.started()).toBe(0);
    expect(f.calls()).toBe(0);
  });
});
