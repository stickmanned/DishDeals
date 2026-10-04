// Pure validation and ranking rules for canonical deal writes and nearby reads
// (used by convex/deals.ts). No Convex imports. Nothing here guesses or
// repairs a value: input is either normalized exactly or rejected.
import { distanceKm } from "./distance";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const MAX_RESTAURANT = 200;
export const MAX_DEAL_TEXT = 2000;
export const MAX_ADDRESS = 500;
export const MAX_CONDITIONS = 20;
export const MAX_CONDITION = 300;
export const MAX_PRICE_CAD = 100000;
export const MAX_SOURCE_URL = 2048;
export const MAX_LAT = 85.05112878; // Web Mercator limit used by the map
export const MAX_LNG = 180;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const NEARBY_LIMIT = 50;
export const NEARBY_FALLBACK_SCAN = 200;
export const NEARBY_MAX_KM = 50;
export const MAX_VOTES_PER_DELETE = 2000;

export class WriteError extends Error {}

/** Raw canonical publish fields as received from a client (optionals may be absent). */
export type RawPublishFields = {
  restaurant: string;
  address?: string;
  dealText: string;
  priceCad?: number;
  validDays: string[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions: string[];
  lat: number;
  lng: number;
  sourceUrl?: string;
};
/** Normalized fields; optional keys are omitted, never null. */
export type CleanPublishFields = Omit<RawPublishFields, "validDays"> & { validDays: (typeof WEEKDAYS)[number][] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isSafeHttpUrl(value: string): boolean {
  if (value.length > MAX_SOURCE_URL || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && u.hostname.length > 0;
  } catch { return false; }
}

const text = (value: unknown, name: string, max: number, required: boolean): string | undefined => {
  if (value === undefined) {
    if (required) throw new WriteError(`${name} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new WriteError(`${name} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new WriteError(`${name} cannot be blank.`);
    return undefined; // a blank optional field is simply omitted
  }
  if (trimmed.length > max) throw new WriteError(`${name} is too long (at most ${max} characters).`);
  return trimmed;
};

export function validateLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > MAX_LAT) throw new WriteError(`Latitude must be a number from -${MAX_LAT} to ${MAX_LAT}.`);
  if (typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > MAX_LNG) throw new WriteError(`Longitude must be a number from -${MAX_LNG} to ${MAX_LNG}.`);
  return { lat, lng };
}

/** Strict, bounded normalization of a full canonical publish payload. */
export function validatePublishFields(input: RawPublishFields): CleanPublishFields {
  const restaurant = text(input.restaurant, "Restaurant", MAX_RESTAURANT, true)!;
  const dealText = text(input.dealText, "Deal text", MAX_DEAL_TEXT, true)!;
  const address = text(input.address, "Address", MAX_ADDRESS, false);

  let priceCad: number | undefined;
  if (input.priceCad !== undefined) {
    if (typeof input.priceCad !== "number" || !Number.isFinite(input.priceCad) || input.priceCad < 0 || input.priceCad > MAX_PRICE_CAD) {
      throw new WriteError(`Price must be a finite CAD amount from 0 to ${MAX_PRICE_CAD}.`);
    }
    priceCad = input.priceCad;
  }

  if (!Array.isArray(input.validDays) || input.validDays.length > WEEKDAYS.length) throw new WriteError("Valid days must be a list of weekdays.");
  const days = new Set<string>();
  for (const day of input.validDays) {
    if (!(WEEKDAYS as readonly string[]).includes(day)) throw new WriteError("Valid days must use mon to sun.");
    if (days.has(day)) throw new WriteError("Valid days cannot repeat.");
    days.add(day);
  }

  const hasStart = input.validStart !== undefined, hasEnd = input.validEnd !== undefined;
  if (hasStart !== hasEnd) throw new WriteError("Provide both start and end times, or neither.");
  if (hasStart && (typeof input.validStart !== "string" || !TIME.test(input.validStart))) throw new WriteError("Start time must be HH:MM from 00:00 to 23:59.");
  if (hasEnd && (typeof input.validEnd !== "string" || !TIME.test(input.validEnd))) throw new WriteError("End time must be HH:MM from 00:00 to 23:59.");

  if (input.expiresOn !== undefined && (typeof input.expiresOn !== "string" || !isRealIsoDate(input.expiresOn))) throw new WriteError("Expiry must be a real date, YYYY-MM-DD.");

  if (!Array.isArray(input.conditions) || input.conditions.length > MAX_CONDITIONS) throw new WriteError(`At most ${MAX_CONDITIONS} conditions.`);
  const conditions = input.conditions.map(c => {
    const t = text(c, "A condition", MAX_CONDITION, true)!;
    return t;
  });

  let sourceUrl: string | undefined;
  if (input.sourceUrl !== undefined) {
    if (typeof input.sourceUrl !== "string" || !isSafeHttpUrl(input.sourceUrl.trim())) throw new WriteError("Source link must be a plain http or https URL.");
    sourceUrl = input.sourceUrl.trim();
  }

  const { lat, lng } = validateLatLng(input.lat, input.lng);
  return {
    restaurant, dealText, validDays: [...days] as CleanPublishFields["validDays"], conditions, lat, lng,
    ...(address !== undefined ? { address } : {}),
    ...(priceCad !== undefined ? { priceCad } : {}),
    ...(hasStart ? { validStart: input.validStart, validEnd: input.validEnd } : {}),
    ...(input.expiresOn !== undefined ? { expiresOn: input.expiresOn } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  };
}

export function validateNearbyArgs(lat: unknown, lng: unknown, maxKm: unknown): { lat: number; lng: number; maxKm: number } {
  const point = validateLatLng(lat, lng);
  if (typeof maxKm !== "number" || !Number.isFinite(maxKm) || maxKm <= 0 || maxKm > NEARBY_MAX_KM) throw new WriteError(`Distance must be above 0 and at most ${NEARBY_MAX_KM} km.`);
  return { ...point, maxKm };
}

export const isAllowedImageType = (type: unknown): boolean => typeof type === "string" && (IMAGE_TYPES as readonly string[]).includes(type);

/**
 * Rank candidate deals by true distance from the viewer, keep those within
 * maxKm, break ties by id for a stable order, and take `limit`. Distance comes
 * from the single shared haversine helper using the canonical stored lat/lng.
 */
export function rankByDistance<T extends { _id: string; lat: number; lng: number }>(
  deals: T[], center: { lat: number; lng: number }, maxKm: number, limit: number = NEARBY_LIMIT,
): (T & { distanceKm: number })[] {
  const ranked: (T & { distanceKm: number })[] = [];
  for (const deal of deals) {
    let d: number;
    try { d = distanceKm(center, { lat: deal.lat, lng: deal.lng }); } catch { continue; } // corrupt coordinates are skipped, not guessed
    if (d <= maxKm) ranked.push({ ...deal, distanceKm: d });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  return ranked.slice(0, limit);
}
