import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { libraryRpc } from "./library-rpc.server";

const track = "a8000000-0000-4000-8000-000000000002";
const playlist = "a9000000-0000-4000-8000-000000000001";
const user = "a7000000-0000-4000-8000-000000000001";
type Result = { data: unknown; error: { code: string; message: string } | null };
type Handler = ((args: { data: unknown; context: unknown }) => Promise<unknown>) & {
  authenticated: boolean;
};

function fixture(rpcResult: Result, duplicate = false) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const result = {
        select: () => result,
        eq: () => result,
        maybeSingle: async () => ({
          data:
            table === "tracks"
              ? {
                  id: track,
                  user_id: user,
                  source_type: "upload",
                  moderation_status: "active",
                  is_published: false,
                }
              : table === "playlists"
                ? { id: playlist, user_id: user }
                : null,
          error: null,
        }),
        insert: async () => {
          if (!duplicate) throw new Error("Separate writes forbidden for atomic creation");
          return { error: { code: "23505", message: "duplicate" } };
        },
      };
      return result;
    },
    rpc(name: string, args: unknown) {
      expect(this).toBe(client);
      calls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  };
  const auth = Symbol("existing-authenticated-middleware");
  const exports: Partial<
    Record<"createPlaylist" | "addTrackToPlaylist" | "toggleFavorite", Handler>
  > = {};
  const compiled = ts.transpileModule(readFileSync("src/lib/playlists.functions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "zod") return { z };
      if (name === "@/lib/library-rpc.server") return { libraryRpc };
      if (name === "@/integrations/supabase/auth-middleware") return { requireSupabaseAuth: auth };
      if (name === "@/lib/feature-access.functions")
        return { requireFeatureAccess: async () => {} };
      if (name === "@/lib/storage-paths") return { isSafeOwnedCoverPath: () => false };
      if (name === "@/lib/server-error")
        return {
          throwSafeServerError: (_scope: string, _error: unknown, message: string) => {
            throw new Error(message);
          },
        };
      if (name === "@tanstack/react-start")
        return {
          createServerFn: () => {
            let validator = (input: unknown) => input;
            let middleware: unknown[] = [];
            const builder = {
              middleware(value: unknown[]) {
                middleware = value;
                return builder;
              },
              inputValidator(value: (input: unknown) => unknown) {
                validator = value;
                return builder;
              },
              handler(callback: (args: unknown) => Promise<unknown>) {
                return Object.assign(
                  async (args: { data: unknown; context: unknown }) =>
                    callback({ ...args, data: validator(args.data) }),
                  { authenticated: middleware.includes(auth) },
                );
              },
            };
            return builder;
          },
        };
      throw new Error(`Unexpected import in offline mutation: ${name}`);
    },
  });
  return { api: exports, calls, context: { supabase: client, userId: user } };
}

describe("actual library server mutations", () => {
  test("atomic creation uses caller JWT client, validates output and never performs separate inserts", async () => {
    const summary = {
      id: playlist,
      name: "Fixture",
      cover_url: null,
      is_public: false,
      created_at: "2026-10-25",
      updated_at: "2026-10-25",
    };
    const f = fixture({ data: summary, error: null });
    expect(f.api.createPlaylist!.authenticated).toBe(true);
    expect(
      await f.api.createPlaylist!({
        data: { name: "Fixture", trackId: track },
        context: f.context,
      }),
    ).toEqual({ playlist: summary });
    expect(f.calls).toEqual([
      {
        name: "create_playlist_with_track",
        args: { _name: "Fixture", _track_id: track, _cover_url: null },
      },
    ]);
    await expect(
      f.api.createPlaylist!({ data: { name: "", trackId: track }, context: f.context }),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });
  test("failed atomic creation surfaces a safe failure and does not compensate with partial deletes", async () => {
    const f = fixture({ data: null, error: { code: "42501", message: "synthetic-secret-schema" } });
    await expect(
      f.api.createPlaylist!({ data: { name: "Fixture", trackId: track }, context: f.context }),
    ).rejects.toThrow("The playlist could not be created.");
    expect(f.calls).toHaveLength(1);
  });
  test("existing-playlist duplicate result is idempotent; unknown RPC output is rejected", async () => {
    const f = fixture({ data: "exists", error: null });
    expect(f.api.addTrackToPlaylist!.authenticated).toBe(true);
    expect(
      await f.api.addTrackToPlaylist!({
        data: { playlistId: playlist, trackId: track },
        context: f.context,
      }),
    ).toEqual({ status: "exists" });
    const bad = fixture({ data: "unexpected", error: null });
    await expect(
      bad.api.addTrackToPlaylist!({
        data: { playlistId: playlist, trackId: track },
        context: bad.context,
      }),
    ).rejects.toThrow();
  });
  test("concurrent favorite duplicate SQLSTATE retains the successful favorite result", async () => {
    const f = fixture({ data: null, error: null }, true);
    expect(f.api.toggleFavorite!.authenticated).toBe(true);
    expect(await f.api.toggleFavorite!({ data: { trackId: track }, context: f.context })).toEqual({
      favorite: true,
    });
    expect(f.calls).toHaveLength(0);
  });
});
