import { describe, expect, it, mock } from "bun:test";
import {
  validateDefaultDestination,
  resolveDefaultEntryForUser,
} from "./pb012-starting-screen.functions";
import { START_SCREEN_VALUES, START_SCREEN_FEATURES } from "./pb012-starting-screen.shared";

const userId = "8c34c798-2d83-47e5-95c9-f3fbc8e29f1b";
const exact = "df71810a-a0c7-4b2e-8dc6-4df1f24755a9";
const envelope = { version: 1, destination: { type: "project", id: exact } };

function client({
  allowed = true,
  row = { id: exact },
  error = null,
}: { allowed?: boolean; row?: unknown; error?: unknown } = {}) {
  const maybeSingle = mock(async () => ({ data: row, error }));
  const eq = mock(() => ({ eq, maybeSingle }));
  const select = mock(() => ({ eq }));
  const from = mock(() => ({ select }));
  const rpc = mock(async () => ({ data: allowed, error }));
  return { auth: { getUser: mock() }, rpc, from, maybeSingle, eq };
}
describe("PB-012 server destination validation", () => {
  it("resolves ungated fixed destinations", async () => {
    const c = client();
    expect(await validateDefaultDestination(c as any, userId, "projects", null)).toEqual({
      status: "valid",
      destination: { type: "projects" },
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("requires current feature access", async () => {
    const c = client({ allowed: false });
    expect(await validateDefaultDestination(c as any, userId, "generator", null)).toEqual({
      status: "feature_unavailable",
    });
  });
  it("validates exact objects through caller-owned lookup", async () => {
    const c = client();
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({
      status: "valid",
      destination: { type: "project", id: exact },
    });
    expect(c.from).toHaveBeenCalledWith("prompt_projects");
    expect(c.eq).toHaveBeenCalledWith("user_id", userId);
  });
  it("collapses missing objects to invalid", async () => {
    const c = client({ row: null });
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({
      status: "invalid",
    });
  });
  it("preserves uncertainty on database failure", async () => {
    const c = client({ error: { code: "PGRST500" } });
    expect(await validateDefaultDestination(c as any, userId, "last_work", envelope)).toEqual({
      status: "temporary_failure",
    });
  });
  it("validates all approved fixed destinations and gates each restricted tool", async () => {
    for (const preference of START_SCREEN_VALUES) {
      if (preference === "last_work") continue;
      const allowed = client();
      expect(await validateDefaultDestination(allowed, userId, preference, null)).toEqual({
        status: "valid",
        destination: { type: preference },
      });
      if (START_SCREEN_FEATURES[preference]) {
        const denied = client({ allowed: false });
        expect(await validateDefaultDestination(denied, userId, preference, null)).toEqual({
          status: "feature_unavailable",
        });
      }
    }
  });
  it("checks exact object ownership for every resumable workspace", async () => {
    for (const [type, table, owner, target] of [
      ["project", "prompt_projects", "user_id", "project"],
      ["song_universe", "song_universes", "owner_id", "song_universe_exact"],
      ["story_map", "story_maps", "user_id", "story_map_exact"],
      ["inspiration_wall", "inspiration_walls", "owner_id", "inspiration_wall_exact"],
    ] as const) {
      const c = client({ row: { id: exact, status: "active" } });
      expect(
        await validateDefaultDestination(c, userId, "last_work", {
          version: 1,
          destination: { type, id: exact },
        }),
      ).toEqual({ status: "valid", destination: { type: target, id: exact } });
      expect(c.from).toHaveBeenCalledWith(table);
      expect(c.eq).toHaveBeenCalledWith(owner, userId);
      expect(c.eq).toHaveBeenCalledWith("id", exact);
    }
    const archived = client({ row: { id: exact, status: "archived" } });
    expect(
      await validateDefaultDestination(archived, userId, "last_work", {
        version: 1,
        destination: { type: "song_universe", id: exact },
      }),
    ).toEqual({ status: "invalid" });
  });
  it("malformed Last Work does not query an object or choose another one", async () => {
    const c = client();
    expect(
      await validateDefaultDestination(c, userId, "last_work", {
        version: 1,
        destination: { type: "project", id: "bad" },
      }),
    ).toEqual({ status: "invalid" });
    expect(c.from).not.toHaveBeenCalled();
  });
  it("restore reads fresh Auth metadata, not claims or a client destination", async () => {
    const c = client();
    c.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: { default_start_screen: "discover" } } },
      error: null,
    });
    expect(await resolveDefaultEntryForUser(c, userId, "verified-token")).toEqual({
      status: "valid",
      destination: { type: "discover" },
    });
    expect(c.auth.getUser).toHaveBeenCalledWith("verified-token");
    c.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: userId,
          user_metadata: {
            default_start_screen: "last_work",
            last_resumable_destination: envelope,
          },
        },
      },
      error: null,
    });
    c.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await resolveDefaultEntryForUser(c, userId, "verified-token")).toEqual({
      status: "valid",
      destination: { type: "home" },
    });
  });
  it("revoked auth, mismatched identity, feature denial and network errors restore Home", async () => {
    const c = client({ allowed: false });
    c.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: { default_start_screen: "generator" } } },
      error: null,
    });
    expect(await resolveDefaultEntryForUser(c, userId, "token")).toEqual({
      status: "valid",
      destination: { type: "home" },
    });
    expect(await resolveDefaultEntryForUser(c, "another-user", "token")).toEqual({
      status: "valid",
      destination: { type: "home" },
    });
    c.auth.getUser.mockRejectedValue(new Error("offline"));
    expect(await resolveDefaultEntryForUser(c, userId, "token")).toEqual({
      status: "valid",
      destination: { type: "home" },
    });
  });
});
