/** football-data.org v4 dateTo is exclusive. UTC arithmetic also handles DST/month/year boundaries. */
export function footballDataExclusiveEnd(day: string): string {
  const date = new Date(day + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new Error("Invalid football-data date");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
