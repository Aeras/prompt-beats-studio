import { describe, expect, test } from "bun:test";
import opapDraw1348454 from "./__fixtures__/kino-opap-1348454.json";
import {
  getKinoFrame,
  getKinoLiveState,
  getKinoPreviousBallPosition,
  getKinoVerifiedRevealFrame,
  hasKinoSecondChance,
  KINO_VERIFIED_BONUS_MS,
  KINO_VERIFIED_GREEN_STEP_MS,
  KINO_VERIFIED_REVEAL_STEP_MS,
  KINO_VERIFIED_REVEAL_TOTAL_MS,
  isCompleteKinoDraw,
  parseKinoDraw,
  parseKinoSnapshot,
} from "./kino-live.shared";

const T = 1793700000000;
const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
const steps = numbers.flatMap((n) => [
  { hopToNumber: Math.min(80, n + 30), duration: 100, winningNumber: false },
  { hopToNumber: n, duration: 900, winningNumber: true },
]);
const draw = (id = 100, list: unknown = numbers) => ({
  gameId: 1100,
  drawId: id,
  drawTime: T,
  status: "results",
  winningNumbers: { list, bonus: [5] },
  animation: { startTimestamp: T, endTimestamp: T + 20000, steps },
});

describe("KINO provider validation and animations", () => {
  test("accepts exactly twenty unique 1–80 results and provider steps", () => {
    const result = parseKinoDraw(draw());
    expect(result?.numbers).toEqual(numbers);
    expect(result?.bonus).toBe(5);
    expect(result?.animation?.steps).toHaveLength(40);
  });

  test("preserves partial, rejects duplicate and impossible results", () => {
    expect(parseKinoDraw(draw(100, [1, 2]))?.numbers).toEqual([1, 2]);
    expect(parseKinoDraw(draw(100, [...numbers.slice(0, 19), 19]))?.numbers).toEqual([]);
    expect(parseKinoDraw(draw(100, [...numbers.slice(0, 19), 81]))?.numbers).toEqual([]);
    expect(parseKinoDraw({ ...draw(), gameId: 999 })).toBeNull();
    expect(parseKinoDraw({ ...draw(), drawTime: "not a time" })).toBeNull();
  });

  test("rejects contradictory or malformed animation, preserves valid results", () => {
    const bad = draw();
    bad.animation.steps = [{ hopToNumber: 80, duration: 20000, winningNumber: true }];
    expect(parseKinoDraw(bad)?.animation).toBeNull();
    expect(parseKinoDraw(bad)?.numbers).toEqual(numbers);
  });

  test("replays only provider steps, with no guessing before or after", () => {
    const animation = parseKinoDraw(draw())!.animation!;
    expect(getKinoFrame(animation, T - 1)).toEqual({
      phase: "waiting",
      confirmed: [],
      activeNumber: null,
    });
    expect(getKinoFrame(animation, T + 101)).toEqual({
      phase: "running",
      confirmed: [],
      activeNumber: 1,
    });
    expect(getKinoFrame(animation, T + 1001)).toEqual({
      phase: "running",
      confirmed: [1],
      activeNumber: 32,
    });
    expect(getKinoFrame(animation, T + 20000)).toEqual({
      phase: "finished",
      confirmed: numbers,
      activeNumber: null,
    });
  });

  test("enforces strict active draw ordering and valid provider shape", () => {
    expect(parseKinoSnapshot({ last: draw(100), active: draw(101) }, T).active?.drawId).toBe(101);
    expect(() => parseKinoSnapshot({ last: draw(102), active: draw(101) }, T)).toThrow();
    expect(() => parseKinoSnapshot({ last: null, active: null }, T)).toThrow();
  });

  test("preserves validated partial results without fabricating animation or bonus", () => {
    const partial = parseKinoDraw({
      ...draw(101),
      status: "active",
      winningNumbers: { list: [8, 12, 29], bonus: [8] },
      animation: null,
    });
    expect(partial?.numbers).toEqual([8, 12, 29]);
    expect(partial?.bonus).toBeNull();
    expect(isCompleteKinoDraw(partial)).toBe(false);
    const state = getKinoLiveState(
      { last: parseKinoDraw(draw(100)), active: partial, fetchedAt: T },
      T,
    );
    expect(state.confirmed).toEqual([8, 12, 29]);
    expect(state.drawId).toBe(101);
    expect(state.running).toBe(true);
    expect(state.activeNumber).toBeNull();
  });

  test("does not promote a draw until twenty results, bonus and final status", () => {
    const oldDraw = parseKinoDraw(draw(100));
    const unfinished = parseKinoDraw({ ...draw(101), status: "active", animation: null });
    const noBonus = parseKinoDraw({
      ...draw(101),
      winningNumbers: { list: numbers, bonus: [] },
      animation: null,
    });
    const completed = parseKinoDraw({ ...draw(101), animation: null });
    expect(isCompleteKinoDraw(unfinished)).toBe(false);
    expect(isCompleteKinoDraw(noBonus)).toBe(false);
    expect(isCompleteKinoDraw(completed)).toBe(true);
    expect(
      getKinoLiveState({ last: unfinished, active: null, fetchedAt: T }, T).canPromoteLast,
    ).toBe(false);
    expect(getKinoLiveState({ last: noBonus, active: null, fetchedAt: T }, T).canPromoteLast).toBe(
      false,
    );
    expect(
      getKinoLiveState({ last: completed, active: null, fetchedAt: T }, T).canPromoteLast,
    ).toBe(true);
    expect(
      getKinoLiveState({ last: oldDraw, active: null, fetchedAt: T }, T + 10000).canPromoteLast,
    ).toBe(false);
    expect(
      getKinoLiveState({ last: oldDraw, active: null, fetchedAt: T }, T + 20000).canPromoteLast,
    ).toBe(true);
  });

  test("reveals only confirmed numbers one by one and bonus after all 20", () => {
    const verified = parseKinoDraw({ ...draw(101), animation: null });
    expect(verified).not.toBeNull();
    const first = getKinoVerifiedRevealFrame(verified!, 0);
    expect(first.confirmed).toEqual([]);
    expect(first.activeNumber).toBeGreaterThan(0);
    expect(first.phase).toBe("regular");
    expect(first.bonusShown).toBe(false);
    expect(first.finished).toBe(false);
    expect(getKinoVerifiedRevealFrame(verified!, KINO_VERIFIED_REVEAL_STEP_MS).confirmed).toEqual([
      1,
    ]);
    const beforeBonus = getKinoVerifiedRevealFrame(
      verified!,
      20 * KINO_VERIFIED_REVEAL_STEP_MS - 1,
    );
    expect(beforeBonus.confirmed).toHaveLength(19);
    expect(beforeBonus.bonusShown).toBe(false);
    const withBonus = getKinoVerifiedRevealFrame(verified!, 20 * KINO_VERIFIED_REVEAL_STEP_MS);
    expect(withBonus.confirmed).toEqual(numbers);
    expect(withBonus.bonusShown).toBe(true);
    expect(withBonus.finished).toBe(false);
    const done = getKinoVerifiedRevealFrame(verified!, KINO_VERIFIED_REVEAL_TOTAL_MS);
    expect(done.confirmed).toEqual(numbers);
    expect(done.activeNumber).toBeNull();
    expect(done.secondChance).toEqual([]);
    expect(done.bonusShown).toBe(true);
    expect(done.finished).toBe(true);
  });

  test("uses 12 above and 11 staggered half-column positions below", () => {
    expect(getKinoPreviousBallPosition(0)).toEqual({ row: 1, column: 1 });
    expect(getKinoPreviousBallPosition(11)).toEqual({ row: 1, column: 23 });
    expect(getKinoPreviousBallPosition(12)).toEqual({ row: 2, column: 2 });
    expect(getKinoPreviousBallPosition(22)).toEqual({ row: 2, column: 22 });
    expect(() => getKinoPreviousBallPosition(23)).toThrow();
  });

  test("rejects unverified second-chance aliases and 23-item regular lists", () => {
    const green = [41, 72, 80];
    const valid = parseKinoDraw({
      ...draw(104),
      winningNumbers: { list: numbers, bonus: [5], secondChance: green },
      animation: null,
    });
    expect(valid?.secondChance).toEqual(green);
    expect(hasKinoSecondChance(valid)).toBe(true);
    expect(
      parseKinoDraw({
        ...draw(105),
        winningNumbers: {
          list: numbers,
          bonus: [5],
          secondChanceNumbers: green,
        },
        animation: null,
      })?.secondChance,
    ).toEqual([]);
    expect(
      parseKinoDraw({
        ...draw(106, [...numbers, ...green]),
        animation: null,
      })?.numbers,
    ).toEqual([]);
    expect(
      parseKinoDraw({
        ...draw(107),
        winningNumbers: {
          list: numbers,
          bonus: [5],
          secondChance: [41, 41, 80],
        },
        animation: null,
      })?.secondChance,
    ).toEqual([]);
    expect(
      parseKinoDraw({
        ...draw(108),
        winningNumbers: {
          list: numbers,
          bonus: [5],
          secondChance: [5, 72, 80],
        },
        animation: null,
      })?.secondChance,
    ).toEqual([]);
  });

  test("real OPAP draw #1348454: 20 regular, red 11, green 36/70/59", () => {
    const snapshot = parseKinoSnapshot(opapDraw1348454, T);
    const last = snapshot.last!;
    expect(last.drawId).toBe(1348454);
    expect(last.drawTime).toBe(1793726400000);
    expect(last.status).toBe("results");
    expect(last.numbers).toEqual([
      61, 42, 4, 27, 68, 11, 9, 74, 8, 45, 25, 67, 63, 26, 33, 37, 13, 6, 32, 14,
    ]);
    expect(last.bonus).toBe(11);
    expect(last.secondChance).toEqual([36, 70, 59]);
    expect(isCompleteKinoDraw(last)).toBe(true);
    expect(hasKinoSecondChance(last)).toBe(true);
    expect(last.animation).toBeNull();
    expect(snapshot.active?.drawId).toBe(1348455);
    expect(snapshot.active?.status).toBe("active");
    expect(snapshot.active?.numbers).toEqual([]);
    expect(snapshot.active?.secondChance).toEqual([]);
    expect(getKinoLiveState(snapshot, T).canPromoteLast).toBe(true);
  });

  test("real OPAP draw #1348454 reveals 20, Bonus, then each green number", () => {
    const last = parseKinoSnapshot(opapDraw1348454, T).last!;
    const regularEnd = 20 * KINO_VERIFIED_REVEAL_STEP_MS;
    const beforeBonus = getKinoVerifiedRevealFrame(last, regularEnd - 1);
    expect(beforeBonus.confirmed).toHaveLength(19);
    expect(beforeBonus.bonusShown).toBe(false);
    expect(beforeBonus.secondChance).toEqual([]);
    const bonus = getKinoVerifiedRevealFrame(last, regularEnd);
    expect(bonus.confirmed).toEqual(last.numbers);
    expect(bonus.bonusShown).toBe(true);
    expect(bonus.secondChance).toEqual([]);
    const bonusEnd = regularEnd + KINO_VERIFIED_BONUS_MS;
    expect(getKinoVerifiedRevealFrame(last, bonusEnd).secondChance).toEqual([]);
    expect(
      getKinoVerifiedRevealFrame(last, bonusEnd + KINO_VERIFIED_GREEN_STEP_MS).secondChance,
    ).toEqual([36]);
    expect(
      getKinoVerifiedRevealFrame(last, bonusEnd + 2 * KINO_VERIFIED_GREEN_STEP_MS).secondChance,
    ).toEqual([36, 70]);
    expect(
      getKinoVerifiedRevealFrame(last, bonusEnd + 3 * KINO_VERIFIED_GREEN_STEP_MS).secondChance,
    ).toEqual([36, 70, 59]);
    expect(getKinoVerifiedRevealFrame(last, KINO_VERIFIED_REVEAL_TOTAL_MS - 1).finished).toBe(
      false,
    );
    const done = getKinoVerifiedRevealFrame(last, KINO_VERIFIED_REVEAL_TOTAL_MS);
    expect(done.confirmed).toEqual(last.numbers);
    expect(done.secondChance).toEqual([36, 70, 59]);
    expect(done.finished).toBe(true);
  });

  test("missing animation is not invented for a completed draw", () => {
    const result = parseKinoDraw({ ...draw(), animation: null });
    expect(result?.animation).toBeNull();
    expect(result?.numbers).toEqual(numbers);
  });
});
