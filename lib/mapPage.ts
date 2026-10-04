import {
  selectDeals as canonicalSelectDeals,
  type PriceFilter as CanonicalPriceFilter,
} from "./dealSelection";
import { type ValidNowResult } from "./validNow";
import { type LatLng } from "./distance";
import { validateLatLng } from "./dealWrite";
import type { CanonicalSavedDeal } from "./mapAdapter";

export type PriceFilter = "any" | "under5" | "under10" | "under15";
export type TimeFilter = "all" | "valid-now";
export type SortOption = "default" | "newest" | "price" | "time" | "distance";

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
  validity?: ValidNowResult;
  distanceKm?: number;
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
 * Note: Real Convex runtime validation (v.id) is enforced by backend queries and caught
 * via the DealDetailsErrorBoundary.
 */
export function isValidDealId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed !== id) return false;
  if (isDemoDealId(trimmed)) return false;
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

function toCanonicalPriceFilter(filter?: PriceFilter): CanonicalPriceFilter {
  switch (filter) {
    case "under5":
      return 5;
    case "under10":
      return 10;
    case "under15":
      return 15;
    case "any":
    default:
      return "any";
  }
}

/**
 * Filters and sorts canonical deals according to the selected price, time, and sort options.
 *
 * Reuses the canonical reviewed lib/dealSelection.ts engine for core filtering and enrichment:
 * - Strict under thresholds: < 5, < 10, < 15 (e.g. $5.00 is NOT under $5.00).
 * - Deals with unlisted prices (null or undefined) represent "price varies" and are included in all filters.
 * - Invalid, negative, or non-finite prices are excluded and not treated as varies.
 * - Canonical default sort: valid deals first, nearest first (if location granted), newest creation time first, stable _id tie-break.
 * - Explicit UI sort overrides: newest, price, time, or distance (with truthful fallback to newest if location denied).
 */
export function selectDeals<T extends CanonicalDeal>(
  deals: readonly T[],
  options: SelectDealsOptions = {}
): (T & { validity: ValidNowResult; distanceKm?: number })[] {
  if (!Array.isArray(deals)) return [];

  const {
    price = "any",
    time = "all",
    sort = "default",
    userLocation = null,
    now = new Date(),
  } = options;

  // 1. Delegate core price filtering, validity computation, distance calculation,
  // and canonical default sorting to the reviewed lib/dealSelection.ts engine.
  const canonicalFilter = toCanonicalPriceFilter(price);
  const selected = canonicalSelectDeals(
    deals as readonly (T & { _id: string; _creationTime: number; lat: number; lng: number })[],
    {
      now,
      priceFilter: canonicalFilter,
      userLocation,
    }
  ) as (T & { validity: ValidNowResult; distanceKm?: number })[];

  // 2. Filter by time (valid-now)
  let result = selected;
  if (time === "valid-now") {
    result = result.filter((deal) => deal.validity.status === "valid");
  }

  // 3. Optional explicit UI sorting override
  if (sort === "default") {
    return result;
  }

  if (sort === "price") {
    return sortByPrice(result);
  }

  if (sort === "time") {
    return sortByTime(result);
  }

  if (sort === "newest") {
    return sortByNewest(result);
  }

  if (sort === "distance") {
    const hasValidLocation =
      userLocation !== null &&
      userLocation !== undefined &&
      typeof userLocation.lat === "number" &&
      typeof userLocation.lng === "number" &&
      Number.isFinite(userLocation.lat) &&
      Number.isFinite(userLocation.lng);

    if (hasValidLocation) {
      return sortByDistance(result);
    }
    // Truthful fallback: if location is not granted/valid, fall back to newest
    return sortByNewest(result);
  }

  return result;
}

function sortByNewest<T extends CanonicalDeal>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const timeA = typeof a._creationTime === "number" && Number.isFinite(a._creationTime) ? a._creationTime : 0;
    const timeB = typeof b._creationTime === "number" && Number.isFinite(b._creationTime) ? b._creationTime : 0;
    if (timeB !== timeA) return timeB - timeA;
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

function sortByPrice<T extends CanonicalDeal>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const priceA = typeof a.priceCad === "number" && Number.isFinite(a.priceCad) ? a.priceCad : null;
    const priceB = typeof b.priceCad === "number" && Number.isFinite(b.priceCad) ? b.priceCad : null;

    if (priceA !== null && priceB !== null) {
      if (priceA !== priceB) return priceA - priceB;
    } else if (priceA !== null && priceB === null) {
      return -1;
    } else if (priceA === null && priceB !== null) {
      return 1;
    }

    // Tie-breaker: newest creation time, then stable ID
    const timeA = typeof a._creationTime === "number" && Number.isFinite(a._creationTime) ? a._creationTime : 0;
    const timeB = typeof b._creationTime === "number" && Number.isFinite(b._creationTime) ? b._creationTime : 0;
    if (timeB !== timeA) return timeB - timeA;
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

function sortByDistance<T extends CanonicalDeal>(items: (T & { distanceKm?: number })[]): (T & { distanceKm?: number })[] {
  return [...items].sort((a, b) => {
    const distA = a.distanceKm;
    const distB = b.distanceKm;
    const hasDistA = typeof distA === "number" && Number.isFinite(distA);
    const hasDistB = typeof distB === "number" && Number.isFinite(distB);

    if (hasDistA && hasDistB) {
      if (distA !== distB) return distA! - distB!;
    } else if (hasDistA && !hasDistB) {
      return -1;
    } else if (!hasDistA && hasDistB) {
      return 1;
    }

    const timeA = typeof a._creationTime === "number" && Number.isFinite(a._creationTime) ? a._creationTime : 0;
    const timeB = typeof b._creationTime === "number" && Number.isFinite(b._creationTime) ? b._creationTime : 0;
    if (timeB !== timeA) return timeB - timeA;
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

function sortByTime<T extends CanonicalDeal>(items: (T & { validity?: ValidNowResult })[]): (T & { validity?: ValidNowResult })[] {
  const getRank = (status?: string): number => {
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

  return [...items].sort((a, b) => {
    const rankA = getRank(a.validity?.status);
    const rankB = getRank(b.validity?.status);

    if (rankA !== rankB) return rankA - rankB;

    if (a.validity?.status === "valid" && b.validity?.status === "valid") {
      const minA = a.validity.minutesLeft ?? Infinity;
      const minB = b.validity.minutesLeft ?? Infinity;
      if (minA !== minB) return minA - minB;
    }

    const timeA = typeof a._creationTime === "number" && Number.isFinite(a._creationTime) ? a._creationTime : 0;
    const timeB = typeof b._creationTime === "number" && Number.isFinite(b._creationTime) ? b._creationTime : 0;
    if (timeB !== timeA) return timeB - timeA;
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

// Same finite Web Mercator limits as the actual nearby query; no guessed fix.
export function viewerLocation(lat: unknown, lng: unknown): LatLng | null {
  try { return validateLatLng(lat, lng); } catch { return null; }
}

/** URL input selects only a genuine ID-shaped candidate; the map still requires a matching loaded published record. */
export function mapSelectionFromQuery(value: unknown): string | null {
  return typeof value === "string" && isValidDealId(value) ? value : null;
}

/** Selection never reintroduces a record excluded by the active query or filters. */
export function resolveMapSelectionId(requested: unknown, visibleDeals: readonly Pick<CanonicalDeal, "_id">[]): string | null {
  const id = mapSelectionFromQuery(requested);
  return id !== null && visibleDeals.some(deal => deal._id === id) ? id : null;
}
