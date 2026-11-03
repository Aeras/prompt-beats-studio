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
    list.length <= 20 &&
    list.every(validNumber) &&
    new Set(list).size === list.length;
  const numbers = validList ? (list as number[]) : [];

  // Verified OPAP contract: only winningNumbers.secondChance supplies the
  // three distinct green values. Side bets and speculative aliases are ignored.
  const green = winning?.secondChance;
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

/** Timed replay of provider-confirmed numbers; cursor hops never invent winnings. */
export const KINO_VERIFIED_REVEAL_STEP_MS = 2500; // full cycle per confirmed number
export const KINO_STAGE_ENTER_MS = 350;
export const KINO_STAGE_HOLD_MS = 1000;
export const KINO_STAGE_EXIT_MS = 350;
export const KINO_STAGE_BANNER_MS = KINO_STAGE_ENTER_MS + KINO_STAGE_HOLD_MS + KINO_STAGE_EXIT_MS;
export const KINO_VERIFIED_BONUS_MS = KINO_STAGE_BANNER_MS + 1700 + 700;
export const KINO_VERIFIED_GREEN_STEP_MS = 1100;
export const KINO_VERIFIED_FINAL_HOLD_MS = 700;
export const KINO_VERIFIED_REVEAL_TOTAL_MS =
  20 * KINO_VERIFIED_REVEAL_STEP_MS +
  KINO_VERIFIED_BONUS_MS +
  KINO_STAGE_BANNER_MS +
  3 * KINO_VERIFIED_GREEN_STEP_MS +
  KINO_VERIFIED_FINAL_HOLD_MS;

export function hasKinoSecondChance(draw: KinoDraw | null | undefined): draw is KinoDraw {
  return Boolean(draw && isCompleteKinoDraw(draw) && draw.secondChance.length === 3);
}

type KinoRevealPhase =
  | "regular"
  | "bonus-intro"
  | "bonus-search"
  | "bonus-reveal"
  | "second-chance-intro"
  | "second-chance"
  | "complete";

function kinoBannerMotion(elapsed: number) {
  const opacity = Math.max(
    0,
    Math.min(
      1,
      elapsed / KINO_STAGE_ENTER_MS,
      (KINO_STAGE_BANNER_MS - elapsed) / KINO_STAGE_EXIT_MS,
    ),
  );
  const entrance = Math.max(0, Math.min(1, elapsed / KINO_STAGE_ENTER_MS));
  return { opacity, scale: 0.72 + 0.28 * (1 - (1 - entrance) ** 3) };
}

/**
 * Decorative, stable pseudo-random cursor positions from the entire 1–80 grid.
 * Excludes all already confirmed numbers and the next winner until its final
 * settling hop. The four intermediate cells are unique for each winner.
 * Never influences the actual provider-confirmed draw results.
 */
function getKinoRegularSearchPath(draw: KinoDraw, count: number, target: number): number[] {
  const excluded = new Set(draw.numbers.slice(0, count));
  excluded.add(target);
  const candidates = Array.from({ length: 80 }, (_, index) => index + 1).filter(
    (number) => !excluded.has(number),
  );
  let seed = (Math.imul(draw.drawId, 0x9e3779b1) ^ Math.imul(count + 1, 0x85ebca6b) ^ target) >>> 0;
  const path: number[] = [];
  for (let hop = 0; hop < 4; hop++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const index = (seed >>> 0) % candidates.length;
    const candidate = candidates[index];
    if (candidate === undefined) throw new RangeError("KINO cursor candidate pool exhausted");
    path.push(candidate);
    candidates.splice(index, 1);
  }
  return path;
}

export function getKinoVerifiedRevealFrame(draw: KinoDraw, elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  const regularEnd = 20 * KINO_VERIFIED_REVEAL_STEP_MS;
  const bonusIntroEnd = regularEnd + KINO_STAGE_BANNER_MS;
  const bonusSearchEnd = bonusIntroEnd + 1700;
  const bonusEnd = regularEnd + KINO_VERIFIED_BONUS_MS;
  const secondChanceIntroEnd =
    bonusEnd + (draw.secondChance.length === 3 ? KINO_STAGE_BANNER_MS : 0);
  const greenEnd = secondChanceIntroEnd + draw.secondChance.length * KINO_VERIFIED_GREEN_STEP_MS;
  const finishedAt = greenEnd + KINO_VERIFIED_FINAL_HOLD_MS;
  const count = Math.min(20, Math.floor(elapsed / KINO_VERIFIED_REVEAL_STEP_MS));
  const bonusShown = elapsed >= bonusSearchEnd;
  let phase: KinoRevealPhase = "complete";
  let activeNumber: number | null = null;
  let banner: { kind: "bonus" | "second-chance"; opacity: number; scale: number } | null = null;

  if (elapsed < regularEnd) {
    phase = "regular";
    const stepElapsed = elapsed % KINO_VERIFIED_REVEAL_STEP_MS;
    const target = draw.numbers[count];
    if (target !== undefined) {
      // Explore the full grid, never re-lighting a settled yellow winner.
      // The last fifth of the step lands on the next verified winner.
      const hop = Math.min(4, Math.floor(stepElapsed / (KINO_VERIFIED_REVEAL_STEP_MS / 5)));
      activeNumber =
        hop === 4 ? target : (getKinoRegularSearchPath(draw, count, target)[hop] ?? null);
    }
  } else if (elapsed < bonusIntroEnd) {
    phase = "bonus-intro";
    banner = { kind: "bonus", ...kinoBannerMotion(elapsed - regularEnd) };
  } else if (elapsed < bonusSearchEnd) {
    phase = "bonus-search";
    const scan = Math.floor((elapsed - bonusIntroEnd) / 180);
    const candidate = draw.numbers[(scan * 7 + draw.drawId) % 20];
    activeNumber = candidate ?? null;
  } else if (elapsed < bonusEnd) {
    phase = "bonus-reveal";
    activeNumber = draw.bonus;
  } else if (draw.secondChance.length === 3 && elapsed < secondChanceIntroEnd) {
    phase = "second-chance-intro";
    banner = { kind: "second-chance", ...kinoBannerMotion(elapsed - bonusEnd) };
  } else if (draw.secondChance.length === 3 && elapsed < greenEnd) {
    phase = "second-chance";
    const index = Math.min(
      2,
      Math.floor((elapsed - secondChanceIntroEnd) / KINO_VERIFIED_GREEN_STEP_MS),
    );
    activeNumber = draw.secondChance[index] ?? null;
  }

  const greenElapsed = Math.max(0, elapsed - secondChanceIntroEnd);
  const greenCount =
    draw.secondChance.length === 3
      ? Math.min(3, Math.floor(greenElapsed / KINO_VERIFIED_GREEN_STEP_MS))
      : 0;

  return {
    confirmed: draw.numbers.slice(0, count),
    activeNumber,
    bonusShown,
    secondChance: draw.secondChance.slice(0, greenCount),
    phase,
    banner,
    finished: elapsed >= finishedAt,
  };
}

/**
 * Official next draw time is the sole clock authority. The ten-second
 * transition is a UI countdown AFTER the official draw boundary and does
 * not imply the provider has published the next draw results.
 */
export const KINO_TRANSITION_MS = 10500;
export function getKinoTransitionDigit(nextDrawTime: number | null, at: number): number | null {
  if (nextDrawTime === null || at < nextDrawTime || at >= nextDrawTime + KINO_TRANSITION_MS) {
    return null;
  }
  return Math.max(0, 10 - Math.floor((at - nextDrawTime) / 1000));
}

/** Hold every confirmed ball until the NEXT provider-owned draw boundary. */
export function shouldTransferKinoHeldResult(nextDrawTime: number | null, at: number): boolean {
  return nextDrawTime !== null && at >= nextDrawTime;
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
