import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("PB-007 routing and Home contract", () => {
  test("Discover owns the existing public discovery behavior", async () => {
    const discover = await source("src/routes/discover.tsx");
    expect(discover).toContain('createFileRoute("/discover")');
    expect(discover).toContain("listPublishedTracks");
    expect(discover).toContain("searchPublicCreators");
    expect(discover).toContain('category === "prompts"');
  });

  test("root is sparse Home and preserves legacy root search compatibility", async () => {
    const home = await source("src/routes/index.tsx");
    expect(home).toContain('createFileRoute("/")');
    expect(home).toContain('to: "/discover"');
    expect(home).toContain("replace: true");
    expect(home).toContain("getHomeRecentProject");
    expect(home).not.toContain("listPublishedTracks");
    expect(home).not.toContain("searchPublicCreators");
  });

  test("guest creation and Project continuation use approved semantic destinations", async () => {
    const home = await source("src/routes/index.tsx");
    expect(home).toContain('to="/auth"');
    expect(home).toContain('search={{ next: "create" }}');
    expect(home).toContain('to="/library"');
    expect(home).toContain('search={{ tab: "prompts" }}');
    expect(home).not.toContain('to="/generate"');
  });

  test("auth and onboarding use the allowlisted continuation helpers", async () => {
    const auth = await source("src/routes/auth.tsx");
    const onboarding = await source("src/routes/onboarding.tsx");
    expect(auth).toContain("validateAuthRouteSearch");
    expect(auth).toContain("postAuthDestination");
    expect(auth).toContain("authCallbackUrl");
    expect(onboarding).toContain("validateNextIntentSearch");
    expect(onboarding).toContain("postAuthDestination");
  });

  test("global public search targets Discover", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain('to: "/discover"');
    expect(shell).toContain("getPrimaryDomain");
  });
});
