import { describe, expect, test } from "bun:test";

import {
  parseExplicitObjectSelection,
  preserveExplicitObjectSearch,
} from "@/lib/pb007-followup-deep-link";

describe("PB-007 follow-up exact object deep links", () => {
  test("distinguishes absent search from an explicit malformed value", () => {
    expect(parseExplicitObjectSelection(undefined)).toEqual({ mode: "absent" });
    expect(parseExplicitObjectSelection("not-a-uuid")).toEqual({ mode: "invalid" });
    expect(parseExplicitObjectSelection("")).toEqual({ mode: "invalid" });
  });

  test("accepts and normalizes an explicit UUID without erasing its identity", () => {
    expect(parseExplicitObjectSelection("A0B1C2D3-E4F5-6789-ABCD-EF0123456789")).toEqual({
      mode: "valid",
      id: "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
    });
  });

  test("validateSearch preservation keeps malformed strings visible to route logic", () => {
    expect(preserveExplicitObjectSearch("bad-id")).toBe("bad-id");
    expect(preserveExplicitObjectSearch(undefined)).toBeUndefined();
    expect(preserveExplicitObjectSearch(42)).toBeUndefined();
  });
});
