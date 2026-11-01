import { describe, expect, test } from "bun:test";
import {
  FOOTBALL_LEAGUES,
  brierScore,
  strictlyPredatesKickoff,
} from "./football-research.shared";

describe("private football research foundations", () => {
  test("exactly six unique requested leagues", () => {
    expect(FOOTBALL_LEAGUES.length).toBe(6);
    expect(new Set(FOOTBALL_LEAGUES.map((league) => league.id)).size).toBe(6);
    expect(FOOTBALL_LEAGUES.some((league) => league.id === "GR-SL")).toBe(true);
  });

  test("Brier score benchmarks", () => {
    expect(brierScore(1, true)).toBe(0);
    expect(brierScore(0, true)).toBe(1);
    expect(brierScore(0.5, true)).toBe(0.25);
    expect(brierScore(0.7, false)).toBeCloseTo(0.49);
  });

  test("rejects invalid invented probability", () => {
    for (const value of [-1, 2, NaN, Infinity]) {
      expect(() => brierScore(value, true)).toThrow(RangeError);
    }
  });

  test("only genuinely prior predictions qualify for evaluation", () => {
    const kickoff = "2026-11-01T18:00:00Z";
    expect(strictlyPredatesKickoff("2026-11-01T17:59:59Z", kickoff)).toBe(true);
    expect(strictlyPredatesKickoff(kickoff, kickoff)).toBe(false);
    expect(strictlyPredatesKickoff("2026-11-01T18:01:00Z", kickoff)).toBe(false);
    expect(strictlyPredatesKickoff("invalid", kickoff)).toBe(false);
  });
});
