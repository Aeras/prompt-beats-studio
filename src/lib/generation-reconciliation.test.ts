import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "bun:test";
import {
  classifyStoredSongFailure,
  generationOutput,
  parseSections,
} from "./generation-result.shared";
import { reconcileFailedGeneration } from "./generation-reconciliation.server";
const valid = JSON.stringify({ title: "Title", tags: "Pop", lyrics: "Lyrics", note: "Note" });
describe("deterministic stored-generation reconciliation (no provider calls)", () => {
  test("valid JSON and historical text sections remain recoverable", () => {
    for (const text of [
      valid,
      `Title: Title
1) Style Prompt
Pop
2) Lyrics
Lyrics
3) Producer
Note`,
    ]) {
      expect(generationOutput.safeParse(parseSections(text)).success).toBe(true);
      expect(classifyStoredSongFailure({ text, stopReason: "end_turn" })).toBeNull();
    }
  });
  test("invalid and truncated responses are classified, raw content is not changed", () => {
    const response = { text: "{incomplete", stopReason: "max_tokens" };
    expect(classifyStoredSongFailure(response)).toBe("incomplete_response");
    expect(response.text).toBe("{incomplete");
    expect(classifyStoredSongFailure({ text: "not JSON", stopReason: "end_turn" })).toBe(
      "invalid_response",
    );
  });
  test("valid content at a token limit and ambiguous provider outcomes stay protected", () => {
    expect(classifyStoredSongFailure({ text: valid, stopReason: "max_tokens" })).toBeNull();
    for (const stopReason of [null, "cancelled", "unknown", "error"])
      expect(classifyStoredSongFailure({ text: "invalid", stopReason })).toBeNull();
    expect(classifyStoredSongFailure({ lyrics: "legacy evidence" })).toBeNull();
  });
  test("same validator preserves language, format and size contracts", () => {
    expect(
      classifyStoredSongFailure({
        text: JSON.stringify({ title: "Песня", tags: "Поп", lyrics: "Стихи", note: "Заметка" }),
        stopReason: "end_turn",
      }),
    ).toBeNull();
    expect(
      classifyStoredSongFailure({
        text: JSON.stringify({ title: "a".repeat(201), tags: "pop", lyrics: "x", note: "x" }),
        stopReason: "end_turn",
      }),
    ).toBe("invalid_response");
  });
  test("legacy NULL model is not guessed by the reconciler; exact evidence goes to trusted SQL", async () => {
    const result = { text: "invalid", stopReason: "end_turn" };
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return {
          data: name === "read_ai_execution_internal" ? { id: "execution", result } : true,
          error: null,
        };
      },
    };
    expect(await reconcileFailedGeneration("job", "user", db)).toBe(true);
    expect(calls[1]?.args).toEqual({
      _execution_id: "execution",
      _user_id: "user",
      _job_id: "job",
      _expected_result: result,
      _reason: "invalid_response",
    });
  });
  test("valid stored work never receives a terminal attestation or provider dispatch", async () => {
    let calls = 0;
    const db = {
      rpc: async () => {
        calls++;
        return {
          data: { id: "execution", result: { text: valid, stopReason: "end_turn" } },
          error: null,
        };
      },
    };
    expect(await reconcileFailedGeneration("job", "user", db)).toBe(false);
    expect(calls).toBe(1);
  });
  test("unknown usage, stale evidence and unavailable DB cannot be declared settled", async () => {
    const db = {
      rpc: async (name: string) => ({
        data:
          name === "read_ai_execution_internal"
            ? { id: "execution", result: { text: "bad", stopReason: "end_turn" } }
            : false,
        error: null,
      }),
    };
    expect(await reconcileFailedGeneration("job", "user", db)).toBe(false);
    await expect(
      reconcileFailedGeneration("job", "user", {
        rpc: async () => ({ data: null, error: new Error("sensitive") }),
      }),
    ).rejects.toThrow("evidence unavailable");
  });
});

test("actual recovery sweep validates exhausted stored failures without provider calls", async () => {
  const rpcNames: string[] = [];
  const checked: string[] = [];
  const exports = {} as typeof import("./ai-execution.server");
  const code = ts.transpileModule(
    readFileSync(new URL("./ai-execution.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(code, {
    exports,
    AbortSignal,
    console,
    require: (name: string) => {
      if (name.includes("client.server"))
        return {
          supabaseAdmin: {
            rpc: (fn: string) => ({
              abortSignal: async () => {
                rpcNames.push(fn);
                return {
                  data:
                    fn === "claim_failed_generation_validation_internal"
                      ? [{ job_id: "old-failed-job", user_id: "owner" }]
                      : fn === "claim_ai_execution_recovery_internal"
                        ? []
                        : 0,
                  error: null,
                };
              },
            }),
          },
        };
      if (name.includes("generation-reconciliation.server"))
        return {
          reconcileFailedGeneration: async (job: string, user: string) => {
            checked.push(`${user}:${job}`);
            return true;
          },
        };
      if (name.includes("global-ai-usage.server")) return {};
      if (name.includes("ai-usage")) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  await exports.reconcileAiExecutions();
  expect(checked).toEqual(["owner:old-failed-job"]);
  expect(rpcNames).toEqual([
    "reap_unjournaled_ai_jobs_internal",
    "claim_ai_execution_recovery_internal",
    "claim_failed_generation_validation_internal",
  ]);
});
