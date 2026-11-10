import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

import { generationOutput, parseSections } from "./generation-result.shared";
import { SONG_SCHEMA, toOpenAiJsonSchema } from "./ai-provider.server";
import {
  buildCreativeDirectionHistoryPrompt,
  creativeDirectionHistoryConfigSchema,
  creativeDirectionHistoryConfigForSelection,
  creativeDirectionSchema,
  parseCreativeDirectionModelResponse,
} from "./creative-direction-history.shared";

const direction = {
  coreIdea: "A traveler learning to leave a familiar city",
  narrator: "First person, reflective",
  emotionalApproach: "Hope held beside grief",
  hookIdentity: "A rising phrase about the open road",
  sonicIdentity: "Warm folk guitar with restrained percussion",
};

function entry(index: number) {
  return { ...direction, coreIdea: `Direction ${index}` };
}

test("OFF keeps the four-field output contract and adds no history prompt", () => {
  const raw = JSON.stringify({
    title: "Song",
    tags: "Folk",
    lyrics: "[Verse]\nWords",
    note: "Warm arrangement",
  });
  const result = parseSections(raw);
  expect(Object.keys(result)).toEqual(["title", "tags", "lyrics", "note"]);
  expect(Object.keys(generationOutput.parse(result))).toEqual(["title", "tags", "lyrics", "note"]);
  expect(buildCreativeDirectionHistoryPrompt([])).toContain("<past_creative_directions_json>\n[]");
});

test("enabled request accepts only isolated project/universe or session scopes", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const universeId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "33333333-3333-4333-8333-333333333333";
  expect(
    creativeDirectionHistoryConfigSchema.parse({
      version: 1,
      scopes: [
        { type: "project", id: projectId },
        { type: "song_universe", id: universeId },
      ],
    }).scopes,
  ).toHaveLength(2);
  expect(() =>
    creativeDirectionHistoryConfigSchema.parse({
      version: 1,
      scopes: [
        { type: "song_universe", id: universeId },
        { type: "session", id: sessionId },
      ],
    }),
  ).toThrow();
  expect(() =>
    creativeDirectionHistoryConfigSchema.parse({
      version: 1,
      scopes: [
        { type: "project", id: projectId },
        { type: "project", id: universeId },
      ],
    }),
  ).toThrow();
});

test("scope selection carries project and universe together and falls back only to its own session", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const universeId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "33333333-3333-4333-8333-333333333333";
  const scopes = (
    patch: Partial<Parameters<typeof creativeDirectionHistoryConfigForSelection>[0]>,
  ) =>
    creativeDirectionHistoryConfigForSelection({
      enabled: true,
      projectId: null,
      universeId: null,
      sessionId,
      ...patch,
    })?.scopes;

  expect(scopes({ enabled: false })).toBeUndefined();
  expect(scopes({ projectId })).toEqual([{ type: "project", id: projectId }]);
  expect(scopes({ universeId })).toEqual([{ type: "song_universe", id: universeId }]);
  expect(scopes({ projectId, universeId })).toEqual([
    { type: "project", id: projectId },
    { type: "song_universe", id: universeId },
  ]);
  expect(scopes({})).toEqual([{ type: "session", id: sessionId }]);
});

test("history context is bounded to 15 concise directions and gives the brief priority", () => {
  const history = Array.from({ length: 18 }, (_, index) => entry(index + 1));
  const prompt = buildCreativeDirectionHistoryPrompt(history);
  expect(prompt.match(/"coreIdea":"Direction \d+"/gu)).toHaveLength(15);
  expect(prompt).toContain("Direction 1");
  expect(prompt).not.toContain("Direction 16");
  expect(prompt).toContain("The current brief, songwriting quality");
  expect(prompt).toContain("Do not impose absolute bans or quotas");
});

test("model metadata is extracted privately while the user song remains four fields", () => {
  const parsed = parseCreativeDirectionModelResponse(
    JSON.stringify({
      ...{
        title: "Song",
        tags: "Indie folk",
        lyrics: "[Verse]\nWords about leaving town",
        note: "Warm guitar",
      },
      creativeDirection: direction,
    }),
  );
  expect(parsed).not.toBeNull();
  expect(Object.keys(parsed!.result)).toEqual(["title", "tags", "lyrics", "note"]);
  expect(parsed!.creativeDirection).toEqual(direction);
});

test("creative direction accepts the expanded limits and rejects overflow", () => {
  const maxFieldDirection = {
    coreIdea: "a".repeat(200),
    narrator: "b".repeat(200),
    emotionalApproach: "c".repeat(200),
    hookIdentity: "d".repeat(200),
    sonicIdentity: "e".repeat(200),
  };
  expect(creativeDirectionSchema.parse(maxFieldDirection)).toEqual(maxFieldDirection);
  expect(() =>
    creativeDirectionSchema.parse({ ...direction, coreIdea: "x".repeat(201) }),
  ).toThrow();
  expect(() =>
    creativeDirectionSchema.parse({ ...maxFieldDirection, sonicIdentity: "e".repeat(201) }),
  ).toThrow();
});

test("multiline, lyric-copy, and missing metadata are rejected", () => {
  const song = {
    title: "Song",
    tags: "Folk",
    lyrics: `[Verse]\n${"This exact lyric line must never be saved as direction metadata. "}`,
    note: "Folk",
  };
  expect(
    parseCreativeDirectionModelResponse(
      JSON.stringify({
        ...song,
        creativeDirection: {
          ...direction,
          coreIdea: "This exact lyric line must never be saved as direction metadata.",
        },
      }),
    ),
  ).toBeNull();
  expect(parseCreativeDirectionModelResponse(JSON.stringify(song))).toBeNull();
  expect(
    creativeDirectionSchema.safeParse({ ...direction, narrator: "first line\nsecond line" })
      .success,
  ).toBe(false);
});

test("server wiring reads history only for opt-in and keeps the legacy completion branch", () => {
  const worker = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
  const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
  const request = readFileSync("src/lib/generation-jobs.functions.ts", "utf8");
  expect(worker).toContain("if (input.creativeDirectionHistory)");
  expect(worker).toContain('"read_generator_creative_direction_history"');
  expect(worker).toContain('"complete_generation_with_creative_direction_history"');
  expect(worker).toContain('.is("cancel_requested_at", null)');
  expect(ai).toContain(
    "data.creativeDirectionHistory ? privateResponse?.result : parseSections(raw)",
  );
  expect(ai).toContain("schema: data.creativeDirectionHistory");
  expect(ai).toContain("creativeDirectionSongSchema(schemas.song)");
  expect(request).toContain('"current_user_is_super_admin"');
  expect(request).toContain('"song_universe_projects"');
  const route = readFileSync("src/routes/generate.tsx", "utf8");
  expect(route).toContain("advanced && !revisionMode && moderation.isSuperAdmin");
  expect(route).toContain('id="generator-creative-direction-history"');
  expect(route).toContain("disabled={busy || Boolean(jobId)}");
  expect(route).toContain("setCreativeDirectionProjectId(storyMapHandoff.projectId)");
  expect(route).toContain("setCreativeDirectionProjectId(songUniverseHandoff.projectId)");
  expect(route).toContain("setCreativeDirectionUniverseId(songUniverseHandoff.universeId)");
  expect(route).toContain(
    "setCreativeDirectionProjectId(inspirationWallHandoff.connectedProjectId)",
  );
  expect(route).toContain('id="generator-creative-direction-project-scope"');
});

test("multiline fields with \r or \n in any direction field are strictly rejected", () => {
  for (const field of [
    "coreIdea",
    "narrator",
    "emotionalApproach",
    "hookIdentity",
    "sonicIdentity",
  ] as const) {
    expect(
      creativeDirectionSchema.safeParse({ ...direction, [field]: "line 1\nline 2" }).success,
    ).toBe(false);
    expect(
      creativeDirectionSchema.safeParse({ ...direction, [field]: "line 1\rline 2" }).success,
    ).toBe(false);
  }
});

test("provider schema omits unsupported keywords and produces valid OpenAI/xAI strict schemas", () => {
  const aiCode = readFileSync("src/lib/ai.functions.ts", "utf8");
  expect(aiCode).not.toContain('coreIdea: { type: "STRING", minLength');
  expect(aiCode).not.toContain("maxLength: 140");
  expect(aiCode).toContain('coreIdea: { type: "STRING" }');

  // Construct creativeDirectionSongSchema as defined in ai.functions.ts
  const schema = {
    ...SONG_SCHEMA,
    properties: {
      ...(SONG_SCHEMA["properties"] as Record<string, unknown>),
      creativeDirection: {
        type: "OBJECT",
        properties: {
          coreIdea: { type: "STRING" },
          narrator: { type: "STRING" },
          emotionalApproach: { type: "STRING" },
          hookIdentity: { type: "STRING" },
          sonicIdentity: { type: "STRING" },
        },
        required: ["coreIdea", "narrator", "emotionalApproach", "hookIdentity", "sonicIdentity"],
      },
    },
    required: [...(SONG_SCHEMA["required"] as string[]), "creativeDirection"],
  };

  const converted = toOpenAiJsonSchema(schema) as any;
  expect(converted.type).toBe("object");
  expect(converted.additionalProperties).toBe(false);
  expect(converted.required).toContain("creativeDirection");
  const dirProps = converted.properties.creativeDirection;
  expect(dirProps.type).toBe("object");
  expect(dirProps.additionalProperties).toBe(false);
  for (const key of [
    "coreIdea",
    "narrator",
    "emotionalApproach",
    "hookIdentity",
    "sonicIdentity",
  ]) {
    expect(dirProps.properties[key].type).toBe("string");
    expect(dirProps.properties[key].minLength).toBeUndefined();
    expect(dirProps.properties[key].maxLength).toBeUndefined();
  }
});

test("system prompt contains explicit single-line and length guidance", () => {
  const aiCode = readFileSync("src/lib/ai.functions.ts", "utf8");
  expect(aiCode).toContain(
    "Each string field in creativeDirection must be a single line without carriage returns or newlines",
  );
  expect(aiCode).toContain("must not exceed 200 characters");
  expect(aiCode).toContain("combined creativeDirection text must remain under 1,000 characters");
});

test("worker error handler preserves creative direction errors without masking as provider failures", () => {
  const worker = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
  expect(worker).toContain('"The generation could not be finalized with its creative direction."');
  expect(worker).toContain('"The AI did not return valid internal creative direction metadata."');
  expect(worker).toContain('"Creative direction history could not be retrieved safely."');
  expect(worker).toContain(
    '"Creative direction history is no longer authorized for this generation."',
  );
});
