/**
 * Shared canonical deal selection, price filtering, and deterministic sorting
 * for DishDeals (T-09A).
 *
 * Implements pure shared business logic used identically across feed and map views.
 *
 * Requirements & Semantics:
 * - Pure, deterministic function; no network, storage, or current-time Convex queries.
 * - Caller supplies explicit injected `now: Date` and `priceFilter` ("any" | 5 | 10 | 15).
 * - Optional user location `{ lat, lng }`: if granted, computes distance; if denied/absent,
 *   omits distance (no bogus 0).
 * - Price filtering:
 *   - Under thresholds is strictly less: `< threshold` (e.g. $10 is not under $10).
 *   - Missing / null / undefined price represents "price varies" (plan edge case 5)
 *     and is included in all price filters.
 *   - Invalid, non-finite, or negative prices are excluded and not treated as varies.
 * - Sorting:
 *   - Valid deals first (`validNow(deal, now).status === "valid"`).
 *   - Within valid deals, then within non-valid deals:
 *     1. Nearest first (if valid user location provided and deal coordinates valid).
 *     2. Newest `_creationTime` first (descending).
 *     3. Stable `_id` string tie-break (ascending).
 * - Immutability: caller deal objects and array are never mutated; all original
 *   canonical fields and custom enrichments are preserved.
 */

import { validNow, ValidNowResult } from "./validNow";
import { distanceKm, LatLng } from "./distance";

export type PriceFilter = "any" | 5 | 10 | 15 | "5" | "10" | "15";

export type UserLocation = LatLng;

export interface DealSelectionOptions {
  now: Date;
  priceFilter?: PriceFilter;
  userLocation?: UserLocation | null;
}

export interface CanonicalSavedDeal {
  _id: string;
  _creationTime: number;
  lat: number;
  lng: number;
  priceCad?: number | null;
  validDays?: string[] | null;
  validStart?: string | null;
  validEnd?: string | null;
  expiresOn?: string | null;
  [key: string]: unknown;
}

export type SelectedDeal<T extends CanonicalSavedDeal = CanonicalSavedDeal> = T & {
  validity: ValidNowResult;
  distanceKm?: number;
};

function isValidCoordinate(point: unknown): point is LatLng {
  if (!point || typeof point !== "object") return false;
  const { lat, lng } = point as LatLng;
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function parseThreshold(filter?: PriceFilter): number | null {
  if (filter == null || filter === "any") return null;
  if (typeof filter === "number") {
    if (filter === 5 || filter === 10 || filter === 15) return filter;
    return null;
  }
  if (typeof filter === "string") {
    const num = parseInt(filter, 10);
    if (num === 5 || num === 10 || num === 15) return num;
  }
  return null;
}

function matchesPriceFilter(priceCad: unknown, threshold: number | null): boolean {
  // Missing/null price means "price varies" and is included in every filter
  if (priceCad == null) {
    return true;
  }

  // If price is provided, validate finite and non-negative
  if (typeof priceCad !== "number" || !Number.isFinite(priceCad) || priceCad < 0) {
    return false;
  }

  // "any" matches all valid non-negative prices
  if (threshold === null) {
    return true;
  }

  // Strict inequality: under threshold (< threshold)
  return priceCad < threshold;
}

/**
 * Pure shared deal selection, price filtering, and deterministic sorting.
 */
export function selectDeals<T extends CanonicalSavedDeal>(
  deals: readonly T[],
  options: DealSelectionOptions
): SelectedDeal<T>[];
export function selectDeals<T extends CanonicalSavedDeal>(
  deals: readonly T[],
  now: Date,
  priceFilter?: PriceFilter,
  userLocation?: UserLocation | null
): SelectedDeal<T>[];
export function selectDeals<T extends CanonicalSavedDeal>(
  deals: readonly T[],
  optionsOrNow: DealSelectionOptions | Date,
  priceFilterArg?: PriceFilter,
  userLocationArg?: UserLocation | null
): SelectedDeal<T>[] {
  if (!Array.isArray(deals)) {
    return [];
  }

  let now: Date;
  let priceFilter: PriceFilter | undefined;
  let userLocation: UserLocation | null | undefined;

  if (optionsOrNow instanceof Date) {
    now = optionsOrNow;
    priceFilter = priceFilterArg;
    userLocation = userLocationArg;
  } else if (optionsOrNow && typeof optionsOrNow === "object") {
    now = optionsOrNow.now;
    priceFilter = optionsOrNow.priceFilter;
    userLocation = optionsOrNow.userLocation;
  } else {
    now = new Date(NaN);
  }

  const threshold = parseThreshold(priceFilter);
  const hasUserLocation = isValidCoordinate(userLocation);

  const selected: SelectedDeal<T>[] = [];

  for (const deal of deals) {
    if (!deal || typeof deal !== "object" || Array.isArray(deal)) {
      continue;
    }

    // Filter by price
    if (!matchesPriceFilter(deal.priceCad, threshold)) {
      continue;
    }

    // Evaluate temporal validity with injected Date
    const validity = validNow(deal, now);

    // Compute distance if valid user location is present and deal has valid coords
    let dealDist: number | undefined;
    if (hasUserLocation && isValidCoordinate({ lat: deal.lat, lng: deal.lng })) {
      try {
        dealDist = distanceKm(userLocation!, { lat: deal.lat, lng: deal.lng });
      } catch {
        dealDist = undefined;
      }
    }

    // Shallow clone to preserve all original and enrichment fields without mutating
    const enriched: SelectedDeal<T> = {
      ...deal,
      validity,
    };

    // Strip any prior/stale distanceKm from incoming deal (e.g. from a prior selectDeals call)
    if ("distanceKm" in enriched) {
      delete (enriched as { distanceKm?: number }).distanceKm;
    }

    if (dealDist !== undefined) {
      enriched.distanceKm = dealDist;
    }

    selected.push(enriched);
  }

  // Deterministic sort:
  // 1. Valid deals first
  // 2. Nearest first (if valid userLocation provided and deal has distance)
  // 3. Newest _creationTime first (sanitized finite numbers)
  // 4. Stable _id tie-break (locale-independent lexicographical comparison)
  selected.sort((a, b) => {
    const aValid = a.validity.status === "valid" ? 0 : 1;
    const bValid = b.validity.status === "valid" ? 0 : 1;
    if (aValid !== bValid) {
      return aValid - bValid;
    }

    if (hasUserLocation) {
      const aDist = a.distanceKm;
      const bDist = b.distanceKm;
      const aHasDist = typeof aDist === "number" && Number.isFinite(aDist);
      const bHasDist = typeof bDist === "number" && Number.isFinite(bDist);

      if (aHasDist && bHasDist) {
        if (aDist !== bDist) {
          return aDist! - bDist!;
        }
      } else if (aHasDist && !bHasDist) {
        return -1;
      } else if (!aHasDist && bHasDist) {
        return 1;
      }
    }

    const aTime =
      typeof a._creationTime === "number" && Number.isFinite(a._creationTime)
        ? a._creationTime
        : 0;
    const bTime =
      typeof b._creationTime === "number" && Number.isFinite(b._creationTime)
        ? b._creationTime
        : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    const aId = String(a._id ?? "");
    const bId = String(b._id ?? "");
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });

  return selected;
}
