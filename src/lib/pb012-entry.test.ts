import { describe, expect, test, mock } from "bun:test";
import { isPb012DefaultDocumentEntry, resolvePb012EntryRoute } from "./pb012-entry";
import { type DestinationValidation } from "./pb012-starting-screen.functions";
import { START_SCREEN_VALUES } from "./pb012-starting-screen.shared";

describe("PB-012 entry precedence", () => {
  test("only a new plain Home document is a default app entry", () => {
    expect(isPb012DefaultDocumentEntry("/", "", "navigate")).toBe(true);
    for (const path of [
      "/auth",
      "/onboarding",
      "/generate",
      "/library",
      "/track/id",
      "/review/token",
      "/story-map",
    ])
      expect(isPb012DefaultDocumentEntry(path, "", "navigate")).toBe(false);
    for (const query of ["?next=create", "?q=hello", "?project=bad", "?map=bad"])
      expect(isPb012DefaultDocumentEntry("/", query, "navigate")).toBe(false);
    for (const type of ["reload", "back_forward", undefined])
      expect(isPb012DefaultDocumentEntry("/", "", type)).toBe(false);
    expect(isPb012DefaultDocumentEntry("/", "", "navigate", "#type=recovery")).toBe(false);
  });

  test("explicit PB-007 next=create wins without even resolving preferences", async () => {
    const resolve = mock(async (): Promise<DestinationValidation> => ({
      status: "valid",
      destination: { type: "discover" },
    }));
    expect(await resolvePb012EntryRoute("create", resolve)).toEqual({ to: "/create" });
    expect(resolve).not.toHaveBeenCalled();
  });

  test("login/onboarding and reopened documents use fresh server resolution", async () => {
    for (const type of START_SCREEN_VALUES.filter((value) => value !== "last_work")) {
      const route = await resolvePb012EntryRoute(undefined, async () => ({
        status: "valid",
        destination: { type },
      }));
      expect(route.to.startsWith("/")).toBe(true);
      expect(route.to).not.toContain("://");
      if (type === "generator") expect(route).toEqual({ to: "/generate" });
    }
    let type: "projects" | "discover" = "projects";
    const resolve = async (): Promise<DestinationValidation> => ({
      status: "valid",
      destination: { type },
    });
    expect((await resolvePb012EntryRoute(undefined, resolve)).to).toBe("/library");
    type = "discover";
    expect((await resolvePb012EntryRoute(undefined, resolve)).to).toBe("/discover");
  });

  test("invalid, denied, temporary and thrown failures safely return Home", async () => {
    for (const status of ["invalid", "feature_unavailable", "temporary_failure"] as const)
      expect(await resolvePb012EntryRoute(undefined, async () => ({ status }))).toEqual({
        to: "/",
      });
    expect(
      await resolvePb012EntryRoute(undefined, async () => {
        throw new Error("offline");
      }),
    ).toEqual({ to: "/" });
  });
});
