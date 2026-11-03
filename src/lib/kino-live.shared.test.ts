import { describe, expect, test } from "bun:test";
import {
  getKinoFrame,
  getKinoLiveState,
  getKinoPreviousBallPosition,
  getKinoVerifiedRevealFrame,
  hasKinoSecondChance,
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

  test("validates a 23-number provider sequence and its three unique green values", () => {
    const green = [41, 72, 80];
    const complete = parseKinoDraw({
      ...draw(102, [...numbers, ...green]),
      animation: null,
    });
    expect(complete?.numbers).toEqual(numbers);
    expect(complete?.secondChance).toEqual(green);
    expect(hasKinoSecondChance(complete)).toBe(true);
    const duplicate = parseKinoDraw({
      ...draw(103, [...numbers, 20, 72, 80]),
      animation: null,
    });
    expect(duplicate?.secondChance).toEqual([]);
    const explicit = parseKinoDraw({
      ...draw(104),
      winningNumbers: {
        list: numbers,
        bonus: [5],
        secondChanceNumbers: green,
      },
      animation: null,
    });
    expect(explicit?.secondChance).toEqual(green);
    expect(
      parseKinoDraw({
        ...draw(105),
        winningNumbers: {
          list: numbers,
          bonus: [5],
          secondChanceNumbers: [41, 41, 80],
        },
        animation: null,
      })?.secondChance,
    ).toEqual([]);
  });

  test("verified second-chance reveal shows 20 then bonus then 3 green numbers", () => {
    const draw23 = parseKinoDraw({
      ...draw(101, [...numbers, 41, 72, 80]),
      animation: null,
    })!;
    const beforeBonus = getKinoVerifiedRevealFrame(draw23, 12999);
    expect(beforeBonus.confirmed).toHaveLength(19);
    expect(beforeBonus.bonusShown).toBe(false);
    const bonus = getKinoVerifiedRevealFrame(draw23, 13000);
    expect(bonus.confirmed).toHaveLength(20);
    expect(bonus.bonusShown).toBe(true);
    expect(bonus.secondChance).toEqual([]);
    const firstGreen = getKinoVerifiedRevealFrame(draw23, 13000 + 1100 + 850);
    expect(firstGreen.secondChance).toEqual([41]);
    expect(firstGreen.finished).toBe(false);
    const lastGreen = getKinoVerifiedRevealFrame(draw23, KINO_VERIFIED_REVEAL_TOTAL_MS - 500);
    expect(lastGreen.secondChance).toEqual([41, 72, 80]);
    expect(lastGreen.finished).toBe(false);
    const complete = getKinoVerifiedRevealFrame(draw23, KINO_VERIFIED_REVEAL_TOTAL_MS);
    expect(complete.secondChance).toEqual([41, 72, 80]);
    expect(complete.finished).toBe(true);
  });

  test("missing animation is not invented for a completed draw", () => {
    const result = parseKinoDraw({ ...draw(), animation: null });
    expect(result?.animation).toBeNull();
    expect(result?.numbers).toEqual(numbers);
  });
});
