import { describe, expect, it } from "bun:test";
import { resolveHomeCreatorState } from "./home-creator-state";
import type { HomeResumeResult } from "./home-resume.shared";

const item = { type: "project" as const, id: "p1", title: "Project", recency: "2026-10-16T12:00:00Z" };
const result = (items: HomeResumeResult["items"], failedSources: HomeResumeResult["failedSources"] = []): HomeResumeResult => ({ items, failedSources });

describe("PB-007 II Home creator state", () => {
  it("keeps auth and query loading distinct", () => {
    expect(resolveHomeCreatorState({ authLoading: true, resumeLoading: true }).kind).toBe("auth-loading");
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: true }).kind).toBe("resume-loading");
  });

  it("recognizes successful continuation and verified empty", () => {
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false, data: result([item]) })).toEqual({ kind: "available", items: [item] });
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false, data: result([]) })).toEqual({ kind: "verified-empty" });
  });

  it("retains valid items on partial source failures", () => {
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false, data: result([item], ["story_map"]) })).toEqual({
      kind: "degraded", items: [item], failedSources: ["story_map"],
    });
  });

  it("does not mistake failed sources or query errors for no work", () => {
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false, data: result([], ["project"]) })).toEqual({
      kind: "unavailable", failedSources: ["project"],
    });
    const error = new Error("network");
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false, queryError: error })).toEqual({
      kind: "unavailable", queryError: error,
    });
    expect(resolveHomeCreatorState({ authLoading: false, resumeLoading: false }).kind).toBe("unavailable");
  });
});
