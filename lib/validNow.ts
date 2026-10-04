/**
 * DishDeals temporal validity engine.
 * Computes deal validity status and elapsed minutes left based on injected Date
 * in the America/Vancouver timezone.
 *
 * Approved Semantics:
 * - Device/client computes with injected Date, never current-time queries.
 * - Expiry is inclusive Vancouver calendar date; after it the deal is 'expired'.
 * - Missing expiry is 'unknown' per plan edge case 2.
 * - Empty or missing weekdays means every day (mon..sun).
 * - Missing both hours means all day (00:00 to 24:00).
 * - One missing boundary means beginning ("00:00") or end ("24:00") of local day.
 * - Start-inclusive, end-exclusive [start, end).
 * - Equal nonmissing start and end (e.g. "12:00" and "12:00") is ambiguous 'unknown'.
 * - Overnight tail (e.g. 21:00 to 02:00) belongs to the previous weekday and
 *   cannot extend beyond inclusive expiry.
 * - Invalid calendar, invalid time format, or malformed input yields 'unknown'.
 * - Minutes left counts actual elapsed real minutes until window end,
 *   taking daylight saving transitions (PST/PDT) into account.
 * - Ambiguous local boundaries:
 *   - Spring-forward gap (02:00-02:59): Non-existent local times yield 'unknown'.
 *   - Fall-back repeated hour (01:00-01:59): Windows resolve to the first matching
 *     UTC instant after the window start, capturing the end boundary as soon as
 *     the clock reaches it.
 */

export type ValidWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DealValidityInput = {
  validDays?: string[] | null;
  validStart?: string | null; // "HH:MM"
  validEnd?: string | null; // "HH:MM"
  expiresOn?: string | null; // "YYYY-MM-DD"
  [key: string]: unknown;
};

export type ValidNowStatus = "valid" | "later_today" | "not_today" | "expired" | "unknown";

export type ValidNowResult = {
  status: ValidNowStatus;
  minutesLeft?: number;
};

const VALID_WEEKDAYS = new Set<ValidWeekday>([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

const TIMEZONE = "America/Vancouver";

type VancouverParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: ValidWeekday;
  isoDate: string;
};

function getVancouverParts(date: Date): VancouverParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);
  const weekday = map.weekday.toLowerCase() as ValidWeekday;
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    isoDate,
  };
}

function getAdjacentVancouverDay(
  year: number,
  month: number,
  day: number,
  deltaDays: number
): { year: number; month: number; day: number; weekday: ValidWeekday; isoDate: string } {
  // Using 12:00 UTC (~04:00/05:00 AM Vancouver) avoids crossing DST midnights
  const anchor = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  const parts = getVancouverParts(anchor);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    isoDate: parts.isoDate,
  };
}

function isValidCalendarDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const [y, m, d] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() + 1 === m &&
    check.getUTCDate() === d
  );
}

function parseTime(timeStr: string): { hour: number; minute: number } | null {
  if (timeStr === "24:00") {
    return { hour: 24, minute: 0 };
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
  if (!match) return null;
  return {
    hour: parseInt(match[1], 10),
    minute: parseInt(match[2], 10),
  };
}

/**
 * Finds matching UTC candidate instants for a given Vancouver local time.
 * Pacific Time only alternates between UTC-7 (PDT) and UTC-8 (PST).
 */
function getVancouverInstants(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date[] {
  if (hour === 24) {
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    return getVancouverInstants(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      0,
      minute
    );
  }

  const candidatePdt = Date.UTC(year, month - 1, day, hour + 7, minute);
  const candidatePst = Date.UTC(year, month - 1, day, hour + 8, minute);

  const matches: number[] = [];
  for (const c of [candidatePdt, candidatePst]) {
    const p = getVancouverParts(new Date(c));
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    ) {
      if (!matches.includes(c)) matches.push(c);
    }
  }

  // Sort chronologically
  matches.sort((a, b) => a - b);
  return matches.map((m) => new Date(m));
}

function resolveBoundaryInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  afterInstant?: Date
): Date | null {
  const matches = getVancouverInstants(year, month, day, hour, minute);
  if (matches.length === 0) {
    // Gap hour during spring forward DST
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  // Repeated hour during autumn fall back DST
  if (afterInstant) {
    const futureMatch = matches.find((m) => m.getTime() > afterInstant.getTime());
    if (futureMatch) return futureMatch;
  }
  return matches[0];
}

/**
 * Computes whether a deal is valid at the specified instant in America/Vancouver.
 */
export function validNow(deal: unknown, now: Date): ValidNowResult {
  // Validate 'now' parameter
  if (!(now instanceof Date) || isNaN(now.getTime())) {
    return { status: "unknown" };
  }

  // Validate 'deal' object
  if (deal == null || typeof deal !== "object" || Array.isArray(deal)) {
    return { status: "unknown" };
  }

  const d = deal as DealValidityInput;

  // Validate expiry: missing expiry is 'unknown' per plan edge case 2
  if (d.expiresOn == null || d.expiresOn === "") {
    return { status: "unknown" };
  }
  if (typeof d.expiresOn !== "string" || !isValidCalendarDate(d.expiresOn)) {
    return { status: "unknown" };
  }

  const nowParts = getVancouverParts(now);
  const expiresIso = d.expiresOn;

  // Inclusive expiry: after the calendar date has passed, status is 'expired'
  if (nowParts.isoDate > expiresIso) {
    return { status: "expired" };
  }

  // Validate validDays
  let activeDays: Set<ValidWeekday>;
  if (d.validDays == null || (Array.isArray(d.validDays) && d.validDays.length === 0)) {
    // Empty weekdays means every day
    activeDays = new Set(VALID_WEEKDAYS);
  } else if (Array.isArray(d.validDays)) {
    for (const day of d.validDays) {
      if (typeof day !== "string" || !VALID_WEEKDAYS.has(day as ValidWeekday)) {
        return { status: "unknown" };
      }
    }
    activeDays = new Set(d.validDays as ValidWeekday[]);
  } else {
    return { status: "unknown" };
  }

  // Validate and parse hours
  let startH: number;
  let startM: number;
  let endH: number;
  let endM: number;

  const rawStart = d.validStart;
  const rawEnd = d.validEnd;

  if (rawStart == null && rawEnd == null) {
    // Both hours missing means all day
    startH = 0;
    startM = 0;
    endH = 24;
    endM = 0;
  } else if (rawStart != null && rawEnd == null) {
    if (typeof rawStart !== "string") return { status: "unknown" };
    const parsedStart = parseTime(rawStart);
    if (!parsedStart || parsedStart.hour === 24) return { status: "unknown" };
    startH = parsedStart.hour;
    startM = parsedStart.minute;
    endH = 24;
    endM = 0;
  } else if (rawStart == null && rawEnd != null) {
    if (typeof rawEnd !== "string") return { status: "unknown" };
    const parsedEnd = parseTime(rawEnd);
    if (!parsedEnd) return { status: "unknown" };
    startH = 0;
    startM = 0;
    endH = parsedEnd.hour;
    endM = parsedEnd.minute;
  } else {
    // Both hours provided
    if (typeof rawStart !== "string" || typeof rawEnd !== "string") {
      return { status: "unknown" };
    }
    // Equal nonmissing start and end is ambiguous 'unknown'
    if (rawStart === rawEnd) {
      return { status: "unknown" };
    }
    const parsedStart = parseTime(rawStart);
    const parsedEnd = parseTime(rawEnd);
    if (!parsedStart || !parsedEnd) return { status: "unknown" };
    if (parsedStart.hour === 24) return { status: "unknown" };
    startH = parsedStart.hour;
    startM = parsedStart.minute;
    endH = parsedEnd.hour;
    endM = parsedEnd.minute;
  }

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;
  const isOvernight = endTotalMinutes < startTotalMinutes;

  // Check Window 1: Overnight tail from yesterday
  if (isOvernight) {
    const yesterday = getAdjacentVancouverDay(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      -1
    );

    if (activeDays.has(yesterday.weekday)) {
      // Overnight tail cannot extend beyond inclusive expiry
      // Since nowParts.isoDate <= expiresIso, today is within expiry
      const window1Start = resolveBoundaryInstant(
        yesterday.year,
        yesterday.month,
        yesterday.day,
        startH,
        startM
      );
      if (!window1Start) return { status: "unknown" };

      const window1End = resolveBoundaryInstant(
        nowParts.year,
        nowParts.month,
        nowParts.day,
        endH,
        endM,
        window1Start
      );
      if (!window1End) return { status: "unknown" };

      // Start-inclusive, end-exclusive
      if (now.getTime() >= window1Start.getTime() && now.getTime() < window1End.getTime()) {
        const minutesLeft = Math.floor((window1End.getTime() - now.getTime()) / 60000);
        return { status: "valid", minutesLeft };
      }
    }
  }

  // Check Window 2: Window starting today
  if (!activeDays.has(nowParts.weekday)) {
    return { status: "not_today" };
  }

  const window2Start = resolveBoundaryInstant(
    nowParts.year,
    nowParts.month,
    nowParts.day,
    startH,
    startM
  );
  if (!window2Start) return { status: "unknown" };

  let window2End: Date | null;
  if (!isOvernight) {
    window2End = resolveBoundaryInstant(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      endH,
      endM,
      window2Start
    );
  } else {
    // Overnight deal starting today
    const tomorrow = getAdjacentVancouverDay(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      1
    );
    // Overnight tail cannot extend beyond inclusive expiry
    if (tomorrow.isoDate > expiresIso) {
      // Clamped at midnight at the end of today
      window2End = resolveBoundaryInstant(
        nowParts.year,
        nowParts.month,
        nowParts.day,
        24,
        0,
        window2Start
      );
    } else {
      window2End = resolveBoundaryInstant(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
        endH,
        endM,
        window2Start
      );
    }
  }

  if (!window2End) return { status: "unknown" };

  if (now.getTime() < window2Start.getTime()) {
    return { status: "later_today" };
  }

  if (now.getTime() >= window2Start.getTime() && now.getTime() < window2End.getTime()) {
    const minutesLeft = Math.floor((window2End.getTime() - now.getTime()) / 60000);
    return { status: "valid", minutesLeft };
  }

  // now >= window2End
  return { status: "not_today" };
}
