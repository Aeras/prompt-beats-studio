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
  animation: KinoAnimation | null;
};
export type KinoSnapshot = {
  last: KinoDraw | null;
  active: KinoDraw | null;
  fetchedAt: number;
};
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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
  const numbers =
    Array.isArray(list) &&
    list.length === 20 &&
    list.every(validNumber) &&
    new Set(list).size === 20
      ? (list as number[])
      : [];
  const bonus = winning?.bonus;
  const bonusValue =
    Array.isArray(bonus) &&
    bonus.length === 1 &&
    validNumber(bonus[0]) &&
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
      (numbers.length === 0 || confirmed.every((n) => numbers.includes(n)))
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
