import { validNow, type ValidNowResult } from "./validNow";
import { distanceKm, type LatLng } from "./distance";
import type { CanonicalSavedDeal } from "./mapAdapter";

export type PriceFilter = "any" | "under5" | "under10" | "under15";
export type TimeFilter = "all" | "valid-now";
export type SortOption = "newest" | "price" | "time" | "distance";

export interface CanonicalDeal extends CanonicalSavedDeal {
  _id: string;
  id?: string;
  _creationTime?: number;
  restaurant: string;
  dealText: string;
  lat: number;
  lng: number;
  address?: string;
  priceCad?: number;
  validDays?: string[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions?: string[];
  sourceUrl?: string;
  authorId?: string;
  authorName?: string;
  authorWallet?: string;
  imageUrl?: string | null;
  viewerVote?: "still_on" | "expired" | null;
  stillOnCount?: number;
  expiredCount?: number;
  [key: string]: unknown;
}

export interface SelectDealsOptions {
  price?: PriceFilter;
  time?: TimeFilter;
  sort?: SortOption;
  userLocation?: LatLng | null;
  now?: Date;
}

/**
 * Validates whether an ID represents a demo/preview deal.
 */
export function isDemoDealId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("demo-");
}

/**
 * Validates whether an ID represents a syntactically valid database deal ID.
 * Rejects empty strings, demo IDs, traversal patterns, and non-identifier characters.
 */
export function isValidDealId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed !== id) return false;
  if (isDemoDealId(trimmed)) return false;
  // Convex IDs and test IDs: alphanumeric, underscores, hyphens, length 1-128
  return /^[a-zA-Z0-9_-]{1,128}$/.test(trimmed);
}

/**
 * Validates and normalizes a source URL.
 * Only HTTP and HTTPS URLs with valid hostnames and no user credentials are accepted.
 */
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname || parsed.hostname.includes(" ") || parsed.hostname.startsWith(".")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Returns a human-friendly validity label and active status from ValidNowResult.
 */
export function formatValidityLabel(val: ValidNowResult): { label: string; isValid: boolean } {
  switch (val.status) {
    case "valid": {
      if (typeof val.minutesLeft === "number" && val.minutesLeft > 0) {
        if (val.minutesLeft < 60) {
          return { label: `Valid now · ${val.minutesLeft}m left`, isValid: true };
        }
        const hours = Math.floor(val.minutesLeft / 60);
        const mins = val.minutesLeft % 60;
        return {
          label: `Valid now · ${hours}h${mins ? ` ${mins}m` : ""} left`,
          isValid: true,
        };
      }
      return { label: "Valid now", isValid: true };
    }
    case "later_today":
      return { label: "Later today", isValid: false };
    case "not_today":
      return { label: "Not today", isValid: false };
    case "expired":
      return { label: "Expired", isValid: false };
    case "unknown":
    default:
      return { label: "Hours unlisted", isValid: false };
  }
}

function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Filters and sorts canonical deals according to the selected price, time, and sort options.
 *
 * Rules:
 * - Unknown prices (undefined or null) are included in all price filters.
 * - Time filter "valid-now" requires validNow(deal, now).status === "valid".
 * - "distance" sort falls back truthfully to "newest" if userLocation is null, undefined, or invalid.
 * - Distance sort does not invent fake coordinates or fake proximity.
 */
export function selectDeals<T extends CanonicalDeal>(
  deals: readonly T[],
  options: SelectDealsOptions = {}
): T[] {
  if (!Array.isArray(deals)) return [];

  const {
    price = "any",
    time = "all",
    sort = "newest",
    userLocation = null,
    now = new Date(),
  } = options;

  // 1. Filter by price
  const filteredByPrice = deals.filter((deal) => {
    if (!deal || typeof deal !== "object") return false;
    const priceCad = deal.priceCad;
    // Unknown price (missing, null, or undefined) is included in every filter
    if (priceCad === undefined || priceCad === null) return true;
    if (typeof priceCad !== "number" || !Number.isFinite(priceCad) || priceCad < 0) return true;

    switch (price) {
      case "under5":
        return priceCad <= 5;
      case "under10":
        return priceCad <= 10;
      case "under15":
        return priceCad <= 15;
      case "any":
      default:
        return true;
    }
  });

  // 2. Filter by time
  const filteredByTime = filteredByPrice.filter((deal) => {
    if (time === "all") return true;
    if (time === "valid-now") {
      const validity: ValidNowResult = validNow(deal, now);
      return validity.status === "valid";
    }
    return true;
  });

  // 3. Sort
  const result = [...filteredByTime];

  const hasValidUserLocation =
    userLocation !== null &&
    userLocation !== undefined &&
    isValidCoordinate(userLocation.lat, userLocation.lng);

  if (sort === "distance") {
    if (!hasValidUserLocation) {
      // Truthful fallback: sort by newest when user location is denied or absent
      return sortByNewest(result);
    }
    return sortByDistance(result, userLocation!);
  }

  if (sort === "price") {
    return sortByPrice(result);
  }

  if (sort === "time") {
    return sortByTime(result, now);
  }

  // Default: newest
  return sortByNewest(result);
}

function sortByNewest<T extends CanonicalDeal>(items: T[]): T[] {
  return items.sort((a, b) => {
    const timeA = typeof a._creationTime === "number" ? a._creationTime : 0;
    const timeB = typeof b._creationTime === "number" ? b._creationTime : 0;
    if (timeB !== timeA) return timeB - timeA;
    // Stable tie-breaker
    const idA = a._id ?? a.id ?? "";
    const idB = b._id ?? b.id ?? "";
    return String(idA).localeCompare(String(idB));
  });
}

function sortByPrice<T extends CanonicalDeal>(items: T[]): T[] {
  return items.sort((a, b) => {
    const priceA = typeof a.priceCad === "number" && Number.isFinite(a.priceCad) ? a.priceCad : null;
    const priceB = typeof b.priceCad === "number" && Number.isFinite(b.priceCad) ? b.priceCad : null;

    if (priceA !== null && priceB !== null) {
      if (priceA !== priceB) return priceA - priceB;
      return (b._creationTime ?? 0) - (a._creationTime ?? 0);
    }
    // Items with known prices appear before unknown prices
    if (priceA !== null && priceB === null) return -1;
    if (priceA === null && priceB !== null) return 1;

    // Both unknown prices: fallback to newest
    return (b._creationTime ?? 0) - (a._creationTime ?? 0);
  });
}

function sortByDistance<T extends CanonicalDeal>(items: T[], userLoc: LatLng): T[] {
  return items.sort((a, b) => {
    const validA = isValidCoordinate(a.lat, a.lng);
    const validB = isValidCoordinate(b.lat, b.lng);

    if (validA && validB) {
      const distA = distanceKm(userLoc, { lat: a.lat, lng: a.lng });
      const distB = distanceKm(userLoc, { lat: b.lat, lng: b.lng });
      if (distA !== distB) return distA - distB;
      return (b._creationTime ?? 0) - (a._creationTime ?? 0);
    }

    if (validA && !validB) return -1;
    if (!validA && validB) return 1;

    return (b._creationTime ?? 0) - (a._creationTime ?? 0);
  });
}

function sortByTime<T extends CanonicalDeal>(items: T[], now: Date): T[] {
  const getRank = (status: string): number => {
    switch (status) {
      case "valid":
        return 0;
      case "later_today":
        return 1;
      case "unknown":
        return 2;
      case "not_today":
        return 3;
      case "expired":
        return 4;
      default:
        return 5;
    }
  };

  return items.sort((a, b) => {
    const valA = validNow(a, now);
    const valB = validNow(b, now);

    const rankA = getRank(valA.status);
    const rankB = getRank(valB.status);

    if (rankA !== rankB) return rankA - rankB;

    // If both valid, sort by remaining minutes ascending (ending sooner first)
    if (valA.status === "valid" && valB.status === "valid") {
      const minA = valA.minutesLeft ?? Infinity;
      const minB = valB.minutesLeft ?? Infinity;
      if (minA !== minB) return minA - minB;
    }

    return (b._creationTime ?? 0) - (a._creationTime ?? 0);
  });
}
