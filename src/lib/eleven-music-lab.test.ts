import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Eleven Music Lab is server-authorized for Super Admin and keeps the API key server-side", async () => {
  const server = await source("src/lib/eleven-music-lab.functions.ts");
  const route = await source("src/routes/ai-music-lab-eleven.tsx");

  expect(server).toContain('requireFeatureAccess(context.supabase, "ai_music_lab")');
  expect(server).toContain('rpc("current_user_is_super_admin")');
  expect(server).toContain('process.env["ELEVENLABS_API_KEY"]');
  expect(route).not.toContain("ELEVENLABS_API_KEY");
});

test("Eleven Music Lab uses the official v2.5 plan and compose endpoints", async () => {
  const server = await source("src/lib/eleven-music-lab.functions.ts");

  expect(server).toContain('const ELEVEN_MODEL = "music_v2_5"');
  expect(server).toContain('`${ELEVEN_BASE_URL}/plan`');
  expect(server).toContain('`${ELEVEN_BASE_URL}?output_format=mp3_48000_192`');
  expect(server).toContain("executeDurableAuxiliaryAiRequest");
  expect(server).toContain('operation: "ai_music_lab_generation"');
});

test("Eleven Music temp audio remains private and short-lived", async () => {
  const server = await source("src/lib/eleven-music-lab.functions.ts");

  expect(server).toContain("eleven-temp/");
  expect(server).toContain("isSafeOwnedAudioKey");
  expect(server).toContain("createSignedR2GetUrl");
  expect(server).toContain("deleteUnusedElevenTemp");
});
