import { describe, expect, test } from "bun:test";

import {
  authCallbackUrl,
  parseAuthNextIntent,
  postAuthDestination,
  validateAuthRouteSearch,
} from "./auth-continuation";

describe("PB-007 auth continuation", () => {
  test("accepts only next=create", () => {
    expect(parseAuthNextIntent("create")).toBe("create");
    expect(parseAuthNextIntent(undefined)).toBeUndefined();
    expect(parseAuthNextIntent("https://evil.example")).toBeUndefined();
    expect(parseAuthNextIntent("//evil.example")).toBeUndefined();
    expect(parseAuthNextIntent("/management")).toBeUndefined();
    expect(parseAuthNextIntent("%2Fmanagement")).toBeUndefined();
    expect(parseAuthNextIntent("unknown")).toBeUndefined();
  });

  test("preserves password-reset search without treating it as continuation", () => {
    expect(validateAuthRouteSearch({ reset: "1" })).toEqual({ reset: "1" });
    expect(validateAuthRouteSearch({ next: "create", reset: "1" })).toEqual({
      next: "create",
      reset: "1",
    });
  });

  test("maps the semantic intent to a fixed internal destination", () => {
    expect(postAuthDestination("create")).toBe("/create");
    expect(postAuthDestination(undefined)).toBe("/");
  });

  test("OAuth/email callback URL can carry only the semantic token", () => {
    expect(authCallbackUrl("https://promptbeats.app", "create")).toBe(
      "https://promptbeats.app/auth?next=create",
    );
    expect(authCallbackUrl("https://promptbeats.app", undefined)).toBe(
      "https://promptbeats.app",
    );
  });
});
