/** Vancouver kept UTC-7 after its final spring-forward on March 8, 2026.
 * Some shipped ICU/tzdb versions still apply the obsolete November fallback.
 * Preserve historical America/Vancouver rules before that final transition.
 * Source: https://news.gov.bc.ca/releases/2026AG0013-000209
 */
export const PERMANENT_PACIFIC_START = Date.UTC(2026, 2, 8, 10);

export function formatVancouverParts(
  date: Date,
  locale: string,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
): Intl.DateTimeFormatPart[] {
  const timeZone = date.getTime() >= PERMANENT_PACIFIC_START
    ? "Etc/GMT+7" // IANA's Etc sign convention: UTC minus seven hours.
    : "America/Vancouver";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatToParts(date);
}
