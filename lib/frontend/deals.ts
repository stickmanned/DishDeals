import { z } from "zod";

export type DealView = {
  id: string;
  restaurant: string;
  dealText: string;
  description: string;
  priceCad?: number;
  /** Presentation-only comparison price; never inferred from live discounts. */
  originalPrice?: number;
  currency?: string;
  address?: string;
  validDays: string[];
  validStart?: string;
  validEnd?: string;
  startsOn?: string;
  expiresOn?: string;
  conditions: string[];
  lat?: number;
  lng?: number;
  sourceUrl?: string;
  createdAt: number;
  imageUrl?: string;
  imageAlt?: string;
  authorName?: string;
  stillOnCount?: number;
  expiredCount?: number;
  isDemo: boolean;
};

export type DealFilters = {
  search: string;
  priceLimit: number | null;
  onlyNow: boolean;
};

export type DealValidity = {
  status: "valid" | "later_today" | "not_today" | "expired" | "unknown";
  label: string;
  minutesLeft?: number;
};

const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayMap: Record<string, string> = {
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat",
  Sunday: "sun",
};
const timezone = "America/Vancouver";
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateIsValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function localParts(value: Date) {
  const parts = localFormatter.formatToParts(value);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minute = Number(get("hour")) * 60 + Number(get("minute"));
  return { date, minute };
}

function shiftDate(date: string, amount: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + amount);
  return shifted.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return days[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function clockMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function wallTimestamp(date: string, minute: number) {
  const hour = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return Date.parse(`${date}T${hour}:${minutes}:00Z`);
}

/**
 * Resolve wall-clock endpoints with Intl, including both offsets around DST.
 * A skipped spring-forward time has no instant, so its precise countdown is
 * intentionally omitted. A repeated autumn time uses the next occurrence.
 */
function localEndInstant(
  date: string,
  minute: number,
  now: number,
): number | undefined {
  const target = wallTimestamp(date, minute);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = target + hours * 3_600_000;
    const local = localParts(new Date(probe));
    offsets.add(wallTimestamp(local.date, local.minute) - probe);
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((candidate) => {
      const local = localParts(new Date(candidate));
      return local.date === date && local.minute === minute;
    })
    .sort((a, b) => a - b);
  return candidates.find((candidate) => candidate > now) ?? candidates.at(-1);
}

const unknown: DealValidity = { status: "unknown", label: "Validity unknown" };

/** Browser-only validity: all calendar dates and hours use America/Vancouver. */
export function validity(deal: DealView, now: Date): DealValidity {
  if (!Number.isFinite(now.getTime())) return { ...unknown };
  if (
    deal.validDays.some((day) => !days.includes(day)) ||
    (deal.validStart !== undefined && !clockPattern.test(deal.validStart)) ||
    (deal.validEnd !== undefined && !clockPattern.test(deal.validEnd)) ||
    (deal.startsOn !== undefined && !dateIsValid(deal.startsOn)) ||
    (deal.expiresOn !== undefined && !dateIsValid(deal.expiresOn)) ||
    (deal.startsOn && deal.expiresOn && deal.startsOn > deal.expiresOn)
  ) {
    return { ...unknown };
  }

  const current = localParts(now);
  if (deal.expiresOn && current.date > deal.expiresOn) {
    return { status: "expired", label: "Expired" };
  }
  if (deal.startsOn && current.date < deal.startsOn) {
    return { status: "not_today", label: "Starts later" };
  }

  // Missing days means every day only when hours or expiry establish a schedule.
  // A start date by itself does not prove that an open-ended offer is still on.
  if (
    !deal.validDays.length &&
    !deal.validStart &&
    !deal.validEnd &&
    !deal.expiresOn
  ) {
    return { ...unknown };
  }
  const allowed = (date: string) =>
    !deal.validDays.length || deal.validDays.includes(weekday(date));
  const todayAllowed = allowed(current.date);
  const start = deal.validStart ? clockMinute(deal.validStart) : 0;
  const end = deal.validEnd ? clockMinute(deal.validEnd) : 1440;
  if (start === end) return { ...unknown };

  let endDate = current.date;
  let endMinute = end;
  let active = false;
  if (end < start) {
    const previousDate = shiftDate(current.date, -1);
    const previousAllowed =
      allowed(previousDate) &&
      (!deal.startsOn || previousDate >= deal.startsOn);
    if (current.minute < end && previousAllowed) {
      active = true;
    } else if (current.minute >= start && todayAllowed) {
      active = true;
      endDate = shiftDate(current.date, 1);
    }
  } else {
    active = todayAllowed && current.minute >= start && current.minute < end;
  }

  if (!active) {
    if (todayAllowed && current.minute < start) {
      return { status: "later_today", label: "Later today" };
    }
    return {
      status: "not_today",
      label: todayAllowed ? "Ended today" : "Not today",
    };
  }

  if (endMinute === 1440) {
    endDate = shiftDate(endDate, 1);
    endMinute = 0;
  }
  // An inclusive expiry date ends at the next Vancouver midnight. Even an
  // overnight window cannot extend past the published expiry calendar date.
  const expiryEnd = deal.expiresOn
    ? localEndInstant(shiftDate(deal.expiresOn, 1), 0, now.getTime())
    : undefined;
  let windowEnd = localEndInstant(endDate, endMinute, now.getTime());
  if (
    !deal.validStart &&
    !deal.validEnd &&
    !deal.validDays.length &&
    expiryEnd !== undefined
  ) {
    windowEnd = expiryEnd;
  } else if (expiryEnd !== undefined && windowEnd !== undefined) {
    windowEnd = Math.min(windowEnd, expiryEnd);
  }
  return {
    status: "valid",
    label: "Valid now",
    ...(windowEnd !== undefined && windowEnd > now.getTime()
      ? { minutesLeft: Math.ceil((windowEnd - now.getTime()) / 60_000) }
      : {}),
  };
}

function searchable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-CA");
}

/** Unknown and non-CAD prices stay visible; only known CAD prices are compared. */
export function filterDeals(
  deals: DealView[],
  filters: DealFilters,
  now: Date,
): DealView[] {
  const query = searchable(filters.search.trim());
  const rank: Record<DealValidity["status"], number> = {
    valid: 0,
    later_today: 1,
    unknown: 2,
    not_today: 3,
    expired: 4,
  };
  return deals
    .map((deal) => ({ deal, status: validity(deal, now).status }))
    .filter(({ deal, status }) => {
      if (filters.onlyNow && status !== "valid") return false;
      const cadPrice =
        (deal.currency === undefined || deal.currency === "CAD") &&
        deal.priceCad !== undefined &&
        Number.isFinite(deal.priceCad)
          ? deal.priceCad
          : undefined;
      if (
        filters.priceLimit !== null &&
        cadPrice !== undefined &&
        cadPrice >= filters.priceLimit
      )
        return false;
      return (
        !query ||
        searchable(
          [
            deal.restaurant,
            deal.dealText,
            deal.description,
            deal.address ?? "",
            ...deal.conditions,
          ].join(" "),
        ).includes(query)
      );
    })
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] || b.deal.createdAt - a.deal.createdAt,
    )
    .map(({ deal }) => deal);
}

const nullableText = (limit: number) =>
  z.string().trim().min(1).max(limit).nullable();
const calendarDate = z
  .string()
  .refine(dateIsValid, "Invalid calendar date")
  .nullable();
const sourceUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hostname.includes(":") &&
        !url.hostname.startsWith("[") &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
        url.hostname.includes(".") &&
        !/\.(local|internal|localhost)$/.test(url.hostname)
      );
    } catch {
      return false;
    }
  })
  .nullable();

// This is the actual e3a39cc listForMap payload, not the planned root deals API.
const workflowRecord = z
  .object({
    dealId: z.string().min(1),
    restaurantId: z.string().min(1).optional(),
    restaurantName: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    price: z.number().finite().min(0).max(100000).nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    discountPercent: z.number().min(0).max(100).nullable(),
    days: z
      .array(
        z.enum([
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ]),
      )
      .max(7),
    startTime: z.string().regex(clockPattern).nullable(),
    endTime: z.string().regex(clockPattern).nullable(),
    startDate: calendarDate,
    endDate: calendarDate,
    conditions: z.array(z.string().trim().min(1).max(300)).max(20),
    locationHint: nullableText(300),
    addressHint: nullableText(500),
    evidence: z.string().trim().min(1).max(1000),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1).max(300)).max(10),
    restaurant: z
      .object({
        placeId: z.string().min(1).max(2048),
        name: z.string().min(1).max(300),
        address: z.string().min(1).max(1000),
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        city: z.string().nullable(),
        countryCode: z.string().nullable(),
        categories: z.array(z.string()),
        matchScore: z.number().min(0).max(1),
      })
      .strict(),
    sourceUrl,
    timezone: z.literal(timezone),
    createdAt: z.number().finite().min(0),
  })
  .strict()
  .refine(
    (record) =>
      !record.startDate ||
      !record.endDate ||
      record.startDate <= record.endDate,
    { message: "End date precedes start date", path: ["endDate"] },
  );

/**
 * Reject partial/mismatched payloads as a whole. No live rows receive fictional
 * media, poster details, community counts, discounts, or default coordinates.
 * Non-Vancouver feeds require an explicit contract before they can be shown.
 */
export function parseWorkflowDeals(value: unknown): DealView[] {
  const result = z.array(workflowRecord).max(100).safeParse(value);
  if (!result.success)
    throw new Error("The deal feed did not match its supported contract.");
  const ids = new Set<string>();
  return result.data.map((record) => {
    if (ids.has(record.dealId))
      throw new Error("The deal feed contains duplicate records.");
    ids.add(record.dealId);
    return {
      id: record.dealId,
      restaurant: record.restaurant.name,
      dealText: record.title,
      description: record.description,
      ...(record.currency === "CAD" && record.price !== null
        ? { priceCad: record.price }
        : {}),
      ...(record.currency !== null ? { currency: record.currency } : {}),
      address: record.restaurant.address,
      validDays: record.days.map((day) => dayMap[day]),
      ...(record.startTime !== null ? { validStart: record.startTime } : {}),
      ...(record.endTime !== null ? { validEnd: record.endTime } : {}),
      ...(record.startDate !== null ? { startsOn: record.startDate } : {}),
      ...(record.endDate !== null ? { expiresOn: record.endDate } : {}),
      conditions: record.conditions,
      lat: record.restaurant.latitude,
      lng: record.restaurant.longitude,
      ...(record.sourceUrl !== null ? { sourceUrl: record.sourceUrl } : {}),
      createdAt: record.createdAt,
      isDemo: false,
    };
  });
}
