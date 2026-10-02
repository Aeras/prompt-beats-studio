import { describe, expect, test } from "bun:test";

import {
  creatorPublicState,
  isPublicAccountEligible,
  isPublicTrackEligible,
  sanitizePublicTrackText,
} from "./public-eligibility.shared";

describe("PB-008 shared public eligibility", () => {
  test("account eligibility fails closed for banned, suspended, or invalid public identity", () => {
    expect(
      isPublicAccountEligible({ moderationStatus: "active", isBanned: false, handle: "creator" }),
    ).toBe(true);
    expect(
      isPublicAccountEligible({
        moderationStatus: "suspended",
        isBanned: false,
        handle: "creator",
      }),
    ).toBe(false);
    expect(
      isPublicAccountEligible({ moderationStatus: "active", isBanned: true, handle: "creator" }),
    ).toBe(false);
    expect(
      isPublicAccountEligible({ moderationStatus: "active", isBanned: false, handle: "" }),
    ).toBe(false);
    expect(
      isPublicAccountEligible({ moderationStatus: null, isBanned: false, handle: "creator" }),
    ).toBe(false);
    expect(
      isPublicAccountEligible({ moderationStatus: "active", isBanned: null, handle: "creator" }),
    ).toBe(false);
  });

  test("Track eligibility requires publication, active moderation and eligible creator", () => {
    expect(
      isPublicTrackEligible({
        isPublished: true,
        moderationStatus: "active",
        creatorEligible: true,
      }),
    ).toBe(true);
    expect(
      isPublicTrackEligible({
        isPublished: false,
        moderationStatus: "active",
        creatorEligible: true,
      }),
    ).toBe(false);
    expect(
      isPublicTrackEligible({
        isPublished: true,
        moderationStatus: "locked",
        creatorEligible: true,
      }),
    ).toBe(false);
    expect(
      isPublicTrackEligible({
        isPublished: true,
        moderationStatus: "active",
        creatorEligible: false,
      }),
    ).toBe(false);
  });

  test("creator indexability is exactly the Executive one-eligible-Track threshold", () => {
    expect(creatorPublicState(false, 10)).toBe("unavailable");
    expect(creatorPublicState(true, 0)).toBe("thin");
    expect(creatorPublicState(true, 1)).toBe("indexable");
  });

  test("public prompt and lyrics are independently sanitized without owner bypass", () => {
    expect(
      sanitizePublicTrackText({
        prompt: "secret prompt",
        lyrics: "public lyrics",
        prompt_is_public: false,
        lyrics_is_public: true,
      }),
    ).toMatchObject({ prompt: "", lyrics: "public lyrics" });
    expect(
      sanitizePublicTrackText({
        prompt: "public prompt",
        lyrics: "secret lyrics",
        prompt_is_public: true,
        lyrics_is_public: false,
      }),
    ).toMatchObject({ prompt: "public prompt", lyrics: "" });
    expect(
      sanitizePublicTrackText({
        prompt: "secret prompt",
        lyrics: "secret lyrics",
        prompt_is_public: false,
        lyrics_is_public: false,
      }),
    ).toMatchObject({ prompt: "", lyrics: "" });
  });
});
