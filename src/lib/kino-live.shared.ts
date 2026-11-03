/** Public-data-only KINO contract. All timestamps are Unix milliseconds. */
export type KinoStep = {
  hopToNumber: number;
  duration: number;
  winningNumber: boolean;
};
export type KinoAnimation = {
  startTimestamp: number;
  endTimestamp: number;
  steps: KinoStep[];
};
export type KinoDraw = {
  drawId: number;
  drawTime: number;
  status: string;
  numbers: number[];
  bonus: number | null;
  secondChance: number[];
  animation: KinoAnimation | null;
};
export type KinoSnapshot = {
  last: KinoDraw | null;
  active: KinoDraw | null;
  fetchedAt: number;
};
type KinoProviderObject = Record<string, unknown> & {
  drawId?: unknown;
  drawTime?: unknown;
  gameId?: unknown;
  winningNumbers?: unknown;
  list?: unknown;
  bonus?: unknown;
  secondChance?: unknown;
  secondChanceNumbers?: unknown;
  animation?: unknown;
  startTimestamp?: unknown;
  endTimestamp?: unknown;
  steps?: unknown;
  hopToNumber?: unknown;
  winningNumber?: unknown;
  duration?: unknown;
  status?: unknown;
  last?: unknown;
  active?: unknown;
};
const object = (value: unknown): KinoProviderObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as KinoProviderObject)
    : null;
const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 80;
const validTimestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 1_500_000_000_000 &&
  value < 4_100_000_000_000;

export function parseKinoDraw(raw: unknown): KinoDraw | null {
  const data = object(raw);
  if (
    !data ||
    !Number.isSafeInteger(data.drawId) ||
    (data.drawId as number) <= 0 ||
    !validTimestamp(data.drawTime)
  ) {
    return null;
  }
  if (data.gameId !== undefined && data.gameId !== 1100) return null;
  const winning = object(data.winningNumbers);
  const list = winning?.list;
  // Keep provider-confirmed partial results instead of discarding them until all 20 arrive.
  const validList =
    Array.isArray(list) &&
    list.length > 0 &&
    list.length <= 23 &&
    list.every(validNumber) &&
    new Set(list).size === list.length;
  const numbers = validList ? (list as number[]).slice(0, 20) : [];

  // The three green values must come from an explicit provider field or
  // from a 23-number ordered list. Never infer them from other side bets.
  const explicitSecondChance =
    winning?.secondChanceNumbers ?? winning?.secondChance ?? data.secondChanceNumbers;
  const green = validList && list.length === 23 ? (list as number[]).slice(20) : explicitSecondChance;
  const secondChance =
    numbers.length === 20 &&
    Array.isArray(green) &&
    green.length === 3 &&
    green.every(validNumber) &&
    new Set(green).size === 3 &&
    green.every((n: number) => !numbers.includes(n))
      ? (green as number[])
      : [];
  const bonus = winning?.bonus;
  const bonusValue =
    Array.isArray(bonus) &&
    bonus.length === 1 &&
    validNumber(bonus[0]) &&
    numbers.length === 20 &&
    numbers.includes(bonus[0])
      ? bonus[0]
      : null;
  const anim = object(data.animation);
  let animation: KinoAnimation | null = null;
  if (
    anim &&
    validTimestamp(anim.startTimestamp) &&
    validTimestamp(anim.endTimestamp) &&
    anim.endTimestamp > anim.startTimestamp &&
    anim.endTimestamp - anim.startTimestamp <= 120_000 &&
    Array.isArray(anim.steps) &&
    anim.steps.length > 0 &&
    anim.steps.length <= 250
  ) {
    const steps: KinoStep[] = [];
    let totalDuration = 0;
    for (const item of anim.steps) {
      const step = object(item);
      if (
        !step ||
        !validNumber(step.hopToNumber) ||
        typeof step.winningNumber !== "boolean" ||
        typeof step.duration !== "number" ||
        !Number.isInteger(step.duration) ||
        step.duration < 10 ||
        step.duration > 10_000
      ) {
        steps.length = 0;
        break;
      }
      steps.push({
        hopToNumber: step.hopToNumber,
        winningNumber: step.winningNumber,
        duration: step.duration,
      });
      totalDuration += step.duration;
    }
    const declaredDuration = anim.endTimestamp - anim.startTimestamp;
    const confirmed = steps.filter((step) => step.winningNumber).map((step) => step.hopToNumber);
    if (
      steps.length === anim.steps.length &&
      Math.abs(totalDuration - declaredDuration) <= 5000 &&
      confirmed.length === 20 &&
      new Set(confirmed).size === 20 &&
      (numbers.length < 20
        ? numbers.every((n) => confirmed.includes(n))
        : confirmed.every((n) => numbers.includes(n)))
    ) {
      animation = { startTimestamp: anim.startTimestamp, endTimestamp: anim.endTimestamp, steps };
    }
  }
  return {
    drawId: data.drawId as number,
    drawTime: data.drawTime as number,
    status: typeof data.status === "string" ? data.status.slice(0, 32) : "unknown",
    numbers,
    bonus: bonusValue,
    secondChance,
    animation,
  };
}

export function parseKinoSnapshot(raw: unknown, fetchedAt: number): KinoSnapshot {
  const data = object(raw);
  if (!data) throw new Error("Invalid KINO provider response");
  const last = parseKinoDraw(data.last);
  const active = parseKinoDraw(data.active);
  if (!last && !active) throw new Error("No valid KINO draw metadata");
  if (last && active && last.drawId >= active.drawId) {
    throw new Error("Inconsistent KINO draw order");
  }
  return { last, active, fetchedAt };
}

export type KinoFrame = {
  activeNumber: number | null;
  confirmed: number[];
  phase: "waiting" | "running" | "finished";
};
/** Pure, deterministic replay of provider-owned timing, never a fabricated draw. */
export function getKinoFrame(animation: KinoAnimation, at: number): KinoFrame {
  if (at < animation.startTimestamp) return { activeNumber: null, confirmed: [], phase: "waiting" };
  const confirmed: number[] = [];
  let elapsed = at - animation.startTimestamp;
  for (const step of animation.steps) {
    if (elapsed < step.duration)
      return { activeNumber: step.hopToNumber, confirmed, phase: "running" };
    elapsed -= step.duration;
    if (step.winningNumber && !confirmed.includes(step.hopToNumber))
      confirmed.push(step.hopToNumber);
  }
  return { activeNumber: null, confirmed, phase: "finished" };
}

/** Completed means twenty verified numbers, the provider bonus and final status. */
export function isCompleteKinoDraw(draw: KinoDraw | null | undefined): draw is KinoDraw {
  return Boolean(
    draw &&
    draw.numbers.length === 20 &&
    draw.bonus !== null &&
    (draw.status === "results" || draw.status === "completed"),
  );
}

/** Isolated view model: use official animation or published partial results only. */
export function getKinoLiveState(snapshot: KinoSnapshot, at: number) {
  const partial = snapshot.active?.numbers.length ? snapshot.active : null;
  // A newer active result must never be hidden by an older draw's animation.
  const animated = (partial ? [snapshot.active] : [snapshot.active, snapshot.last]).find(
    (draw) =>
      draw?.animation && at >= draw.animation.startTimestamp && at < draw.animation.endTimestamp,
  );
  const frame = animated?.animation ? getKinoFrame(animated.animation, at) : null;
  const confirmed = frame?.confirmed ?? partial?.numbers ?? [];
  const current = animated ?? partial ?? snapshot.active;
  return {
    drawId: current?.drawId ?? null,
    activeNumber: frame?.activeNumber ?? null,
    confirmed,
    running: frame?.phase === "running" || Boolean(partial),
    canPromoteLast:
      isCompleteKinoDraw(snapshot.last) &&
      !(snapshot.last.animation && at < snapshot.last.animation.endTimestamp),
  };
}

/** A delayed display of verified results, never a claim about the OPAP broadcast. */
export const KINO_VERIFIED_REVEAL_STEP_MS = 650;
export const KINO_VERIFIED_BONUS_MS = 1100;
export const KINO_VERIFIED_GREEN_STEP_MS = 850;
export const KINO_VERIFIED_FINAL_HOLD_MS = 900;
export const KINO_VERIFIED_REVEAL_TOTAL_MS =
  20 * KINO_VERIFIED_REVEAL_STEP_MS +
  KINO_VERIFIED_BONUS_MS +
  3 * KINO_VERIFIED_GREEN_STEP_MS +
  KINO_VERIFIED_FINAL_HOLD_MS;

export function hasKinoSecondChance(draw: KinoDraw | null | undefined): draw is KinoDraw {
  return Boolean(draw && isCompleteKinoDraw(draw) && draw.secondChance.length === 3);
}

export function getKinoVerifiedRevealFrame(draw: KinoDraw, elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  const regularEnd = 20 * KINO_VERIFIED_REVEAL_STEP_MS;
  const bonusEnd = regularEnd + KINO_VERIFIED_BONUS_MS;
  const count = Math.min(20, Math.floor(elapsed / KINO_VERIFIED_REVEAL_STEP_MS));
  const bonusShown = elapsed >= regularEnd;
  // Visual-only cursor: these transient hops are NOT additional draw results.
  const cycle = Math.floor((elapsed % KINO_VERIFIED_REVEAL_STEP_MS) / 130);
  const target = draw.numbers[count];
  const activeNumber =
    count < 20 && typeof target === "number"
      ? cycle >= 4
        ? target
        : ((target + draw.drawId + cycle * 17) % 80) + 1
      : null;
  const greenCount = Math.min(
    draw.secondChance.length,
    Math.max(0, Math.floor((elapsed - bonusEnd) / KINO_VERIFIED_GREEN_STEP_MS)),
  );
  return {
    confirmed: draw.numbers.slice(0, count),
    activeNumber,
    bonusShown,
    secondChance: draw.secondChance.slice(0, greenCount),
    phase:
      elapsed < regularEnd
        ? "regular"
        : elapsed < bonusEnd
          ? "bonus"
          : greenCount < 3 && draw.secondChance.length === 3
            ? "second-chance"
            : "complete",
    finished:
      bonusShown &&
      greenCount === draw.secondChance.length &&
      elapsed >=
        (draw.secondChance.length === 3
          ? KINO_VERIFIED_REVEAL_TOTAL_MS
          : bonusEnd + KINO_VERIFIED_FINAL_HOLD_MS),
  };
}

/** Exactly 23 positions on a 24-half-column grid: 12 above, 11 staggered below. */
export function getKinoPreviousBallPosition(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= 23) {
    throw new RangeError("KINO previous position must be 0–22");
  }
  return {
    row: index < 12 ? 1 : 2,
    column: index < 12 ? index * 2 + 1 : (index - 12) * 2 + 2,
  };
}
