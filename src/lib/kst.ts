// Day boundaries for push targeting are Korean calendar days, not UTC days.
// A collection created 2026-07-13 08:00 KST is 2026-07-12 23:00 UTC, so a UTC
// day boundary would file it under the wrong day and D1/D3 would target the
// wrong cohort. KST is UTC+9 year-round with no DST, so a fixed offset is exact.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Korean calendar day of `instant`, as "YYYY-MM-DD". */
export function kstDateKey(instant: Date = new Date()): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant midnight-KST-on-`dateKey` occurs, e.g. "2026-07-13" -> 2026-07-12T15:00:00Z. */
export function kstDayStart(dateKey: string): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) - KST_OFFSET_MS);
}

/** Korean calendar day `days` before `instant`, as "YYYY-MM-DD". */
export function kstDateKeyDaysAgo(days: number, instant: Date = new Date()): string {
  return kstDateKey(new Date(instant.getTime() - days * 24 * 60 * 60 * 1000));
}
