import { describe, expect, test } from "bun:test";

import {
  assertGenerationRequestBudget,
  MAX_GENERATION_REQUEST_BYTES,
} from "./generator-input-limits";

describe("generation admission payload budget", () => {
  test("accepts ordinary Greek and multilingual generation context", () => {
    expect(() =>
      assertGenerationRequestBudget({
        theme: "Νυχτερινές διαδρομές",
        genre: "Melodic pop rock",
        lyrics: "Привет — canción",
      }),
    ).not.toThrow();
  });

  test("rejects aggregate UTF-8 payloads above the ceiling", () => {
    expect(() =>
      assertGenerationRequestBudget({ notes: "α".repeat(MAX_GENERATION_REQUEST_BYTES / 2) }),
    ).toThrow("Generation request is too large.");
  });

  test("accepts a payload exactly at the byte ceiling", () => {
    const overhead = new TextEncoder().encode(JSON.stringify({ notes: "" })).byteLength;
    expect(() =>
      assertGenerationRequestBudget({ notes: "a".repeat(MAX_GENERATION_REQUEST_BYTES - overhead) }),
    ).not.toThrow();
  });
});
