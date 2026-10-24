// Preserve the persisted Zod 3 datetime contract during the Zod 4 migration:
// seconds may be omitted, and explicit offsets may omit the colon. Keep the
// original calendar/time validation; do not normalize or rewrite stored values.
// Derived from Zod 3.25.76 datetimeRegex (MIT, colinhacks/zod).
const calendarDate = String.raw`((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))`;
const clockTime = String.raw`([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?`;

export const compatibleUtcDateTimePattern = new RegExp(`^${calendarDate}T${clockTime}Z$`);
export const compatibleOffsetDateTimePattern = new RegExp(
  `^${calendarDate}T${clockTime}(Z|([+-]\\d{2}:?\\d{2}))$`,
);
