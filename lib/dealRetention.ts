import { formatVancouverParts } from "./vancouverTime";

/** Physical deletion starts at midnight after seven complete days following
 * the inclusive expiry date. This is separate from client-side deal validity.
 * Missing/invalid legacy expiry or an unresolvable boundary is retained.
 */
export function dealDeletionTime(expiresOn: unknown): number | null {
  if (typeof expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return null;
  const [year, month, day] = expiresOn.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // setUTCFullYear avoids Date.UTC's special handling of years 00..99.
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  calendar.setUTCDate(day + 8);
  if (calendar.getUTCFullYear() > 9999) return null;
  const target = {
    year: String(calendar.getUTCFullYear()), month: String(calendar.getUTCMonth() + 1).padStart(2, "0"),
    day: String(calendar.getUTCDate()).padStart(2, "0"), hour: "00", minute: "00", second: "00",
  };
  // Resolve the calendar boundary, rather than adding 7*24 elapsed hours.
  // Shared Vancouver formatting preserves historical DST and permanent UTC-7.
  for (const offset of [7, 8]) {
    const instant = calendar.getTime() + offset * 60 * 60 * 1000;
    const parts = Object.fromEntries(formatVancouverParts(new Date(instant), "en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).map(part => [part.type, part.value]));
    if (Object.entries(target).every(([key, value]) => parts[key] === value)) return instant;
  }
  return null;
}

export function isDealDeletionDue(expiresOn: unknown, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  const cutoff = dealDeletionTime(expiresOn);
  return cutoff !== null && now >= cutoff;
}
