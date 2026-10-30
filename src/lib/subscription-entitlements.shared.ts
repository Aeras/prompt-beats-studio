export const SUBSCRIPTION_PLANS = ["free", "plus", "pro"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type ManualSubscriptionPlan = Exclude<SubscriptionPlan, "free">;

export type SubscriptionManualGrant = {
  id: string;
  plan: ManualSubscriptionPlan;
  startsAt: string;
  expiresAt: string | null;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  active: boolean;
};

export type SubscriptionEntitlementDetail = {
  effectivePlan: SubscriptionPlan;
  stripe: {
    plan: SubscriptionPlan;
    status: string;
    currentPeriodEnd: string | null;
  };
  manualGrants: SubscriptionManualGrant[];
};

export const MANUAL_GRANT_DURATION_PRESETS = [
  "7_days",
  "1_month",
  "2_months",
  "3_months",
  "6_months",
  "12_months",
  "never",
  "custom",
] as const;
export type ManualGrantDurationPreset = (typeof MANUAL_GRANT_DURATION_PRESETS)[number];

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(date: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour === 24 ? 0 : values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}

function localPartsAsUtcMilliseconds(parts: LocalParts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
}

function zonedLocalPartsToDate(parts: LocalParts, timeZone: string): Date {
  // Resolve the timezone offset iteratively. Two passes cover DST offset changes
  // around the requested wall-clock; the final equality check rejects nonexistent
  // local times instead of silently shifting the administrator's requested time.
  const desired = localPartsAsUtcMilliseconds(parts);
  let candidate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = partsInTimeZone(candidate, timeZone);
    const delta = desired - localPartsAsUtcMilliseconds(rendered);
    if (delta === 0) break;
    candidate = new Date(candidate.getTime() + delta);
  }
  const resolved = partsInTimeZone(candidate, timeZone);
  if (
    resolved.year !== parts.year ||
    resolved.month !== parts.month ||
    resolved.day !== parts.day ||
    resolved.hour !== parts.hour ||
    resolved.minute !== parts.minute ||
    resolved.second !== parts.second
  ) {
    throw new Error("The selected local time does not exist in this timezone.");
  }
  return candidate;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds calendar months in an IANA timezone, preserving the local wall-clock and
 * clamping end-of-month days. The returned instant is UTC/ISO-ready.
 */
export function addCalendarMonthsInTimeZone(now: Date, months: number, timeZone: string): Date {
  if (!Number.isInteger(months) || months < 1 || months > 12)
    throw new Error("Invalid month duration.");
  const current = partsInTimeZone(now, timeZone);
  const monthIndex = current.month - 1 + months;
  const targetYear = current.year + Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  return zonedLocalPartsToDate(
    {
      ...current,
      year: targetYear,
      month: targetMonth,
      day: Math.min(current.day, daysInMonth(targetYear, targetMonth)),
    },
    timeZone,
  );
}

export function manualGrantExpiryFromPreset(
  now: Date,
  preset: ManualGrantDurationPreset,
  timeZone: string,
): Date | null {
  if (preset === "never") return null;
  if (preset === "7_days") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (preset === "custom") throw new Error("Custom expiry requires an explicit date/time.");
  const months = Number(preset.split("_")[0]);
  return addCalendarMonthsInTimeZone(now, months, timeZone);
}
