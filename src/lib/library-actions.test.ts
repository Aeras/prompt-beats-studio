import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { libraryActionError } from "./library-action-errors";
import { refreshFavorites, refreshPlaylists } from "./library-cache";
import { libraryRpc } from "./library-rpc.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("personal library action feedback", () => {
  test("only allowlisted messages are shown in either language", () => {
    for (const language of ["el", "en"])
      for (const action of ["favorite", "create", "add", "load"] as const) {
        const marker = "private-schema-credential-marker";
        expect(libraryActionError(new Error(marker), language, action)).not.toContain(marker);
        expect(libraryActionError({ message: marker }, language, action)).not.toContain(marker);
        expect(libraryActionError(null, language, action)).not.toBe("");
      }
    expect(libraryActionError(new Error("Track is unavailable"), "en", "add")).toContain(
      "no longer",
    );
    expect(libraryActionError(new Error("Feature not available."), "en", "add")).toContain(
      "account",
    );
    expect(libraryActionError(new Error("Unauthorized: token"), "en", "favorite")).toContain(
      "sign in",
    );
    expect(libraryActionError(new Error("Playlist not found"), "el", "add")).toContain("λίστα");
  });

  test("unfavorite removes the row and bookmark immediately, only in that account", async () => {
    const client = new QueryClient();
    for (const owner of ["owner", "other"]) {
      client.setQueryData(["library", "favorite-ids", owner], { trackIds: ["track", "keep"] });
      client.setQueryData(["library", "favorites", owner], {
        tracks: [{ id: "track" }, { id: "keep" }],
      });
    }
    await refreshFavorites(client, "owner", "track", false);
    expect(client.getQueryData(["library", "favorite-ids", "owner"])).toEqual({
      trackIds: ["keep"],
    });
    expect(client.getQueryData(["library", "favorites", "owner"])).toEqual({
      tracks: [{ id: "keep" }],
    });
    expect(client.getQueryState(["library", "favorites", "owner"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["library", "favorites", "other"])?.isInvalidated).toBe(false);
    expect(client.getQueryData(["library", "favorite-ids", "other"])).toEqual({
      trackIds: ["track", "keep"],
    });
    client.clear();
  });

  test("adding a favorite deduplicates IDs and refetches instead of inventing track data", async () => {
    const client = new QueryClient();
    client.setQueryData(["library", "favorite-ids", "owner"], { trackIds: ["track"] });
    client.setQueryData(["library", "favorites", "owner"], { tracks: [] });
    await Promise.all([
      refreshFavorites(client, "owner", "track", true),
      refreshFavorites(client, "owner", "track", true),
    ]);
    expect(client.getQueryData(["library", "favorite-ids", "owner"])).toEqual({
      trackIds: ["track"],
    });
    expect(client.getQueryData(["library", "favorites", "owner"])).toEqual({ tracks: [] });
    expect(client.getQueryState(["library", "favorites", "owner"])?.isInvalidated).toBe(true);
    client.clear();
  });

  test("creation and add refresh both playlist summary and the existing detail key", async () => {
    const client = new QueryClient();
    const keys = [
      ["library", "playlists", "owner"],
      ["library", "playlists", "other"],
      ["library", "playlist", "p"],
      ["library", "playlist", "other-p"],
    ];
    keys.forEach((key) => client.setQueryData(key, {}));
    await refreshPlaylists(client, "owner", "p");
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    client.clear();
  });

  test("RPC bridge preserves the exact caller client and does not swallow errors", async () => {
    const failure = { code: "42501", message: "synthetic-private-marker" };
    const client = {
      rpc(this: unknown, name: string, args: unknown) {
        expect(this).toBe(client);
        expect(name).toBe("add_playlist_track_atomic");
        expect(args).toEqual({ _playlist_id: "p", _track_id: "t" });
        return Promise.resolve({ data: null, error: failure });
      },
    };
    // Only the offline stub is asserted; the production adapter requires the
    // existing authenticated Supabase client and never constructs a new one.
    const result = await libraryRpc(
      client as unknown as SupabaseClient<Database>,
      "add_playlist_track_atomic",
      { _playlist_id: "p", _track_id: "t" },
    );
    expect(result.error).toBe(failure);
  });
});
