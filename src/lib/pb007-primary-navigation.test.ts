import { describe, expect, test } from "bun:test";

import { getPrimaryDomain, PRIMARY_DOMAIN_PATHS } from "./primary-navigation";

describe("PB-007 primary navigation domains", () => {
  test("maps the approved primary routes", () => {
    expect(getPrimaryDomain("/")).toBe("home");
    expect(getPrimaryDomain("/create")).toBe("create");
    expect(getPrimaryDomain("/discover")).toBe("discover");
    expect(getPrimaryDomain("/library")).toBe("library");
  });

  test("maps specialized creative routes to Create", () => {
    for (const pathname of [
      "/generate",
      "/audio-revision",
      "/lyrics-review",
      "/song-analyzer",
      "/inspiration-wall",
      "/story-map",
      "/song-universe",
    ]) {
      expect(getPrimaryDomain(pathname)).toBe("create");
    }
  });

  test("maps Trending to Discover", () => {
    expect(getPrimaryDomain("/trending")).toBe("discover");
  });

  test("does not force unrelated routes into a primary domain", () => {
    expect(getPrimaryDomain("/management")).toBeNull();
    expect(getPrimaryDomain("/profile/example")).toBeNull();
    expect(getPrimaryDomain("/auth")).toBeNull();
  });

  test("exposes canonical primary-domain paths", () => {
    expect(PRIMARY_DOMAIN_PATHS).toEqual({
      home: "/",
      create: "/create",
      discover: "/discover",
      library: "/library",
    });
  });
});
