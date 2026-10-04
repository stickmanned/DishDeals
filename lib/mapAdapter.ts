import type { MapDeal } from "@restaurant-deals/map";

export interface CanonicalSavedDeal {
  _id: string;
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
  imageId?: string;
  stillOnCount?: number;
  expiredCount?: number;
  [key: string]: unknown;
}

/**
 * Validates coordinate limits for Web Mercator and bounds.
 */
function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 85.05112878) return false;
  if (Math.abs(lng) > 180) return false;
  return true;
}

/**
 * Pure adapter converting a canonical saved deal record into a MapDeal.
 * Rejects records with invalid coordinates or missing essential fields.
 * Preserves stable IDs without inventing coordinates, fake currency, or fake expiry.
 */
export function toCanonicalMapDeal(record: CanonicalSavedDeal): MapDeal | null {
  if (!record || typeof record !== "object") return null;

  if (typeof record._id !== "string" || !record._id.trim()) return null;
  if (typeof record.restaurant !== "string" || !record.restaurant.trim()) return null;
  if (typeof record.dealText !== "string" || !record.dealText.trim()) return null;

  if (!isValidCoordinate(record.lat, record.lng)) return null;

  const result: MapDeal = {
    id: record._id,
    restaurantName: record.restaurant.trim(),
    title: record.dealText.trim(),
    latitude: record.lat,
    longitude: record.lng,
  };

  if (typeof record.address === "string" && record.address.trim()) {
    result.address = record.address.trim();
  }

  // priceCad: only set currency: "CAD" when priceCad is a finite, non-negative number
  if (typeof record.priceCad === "number" && Number.isFinite(record.priceCad) && record.priceCad >= 0) {
    result.price = record.priceCad;
    result.currency = "CAD";
  }

  if (typeof record.sourceUrl === "string" && record.sourceUrl.trim()) {
    try {
      const url = new URL(record.sourceUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        result.sourceUrl = record.sourceUrl;
      }
    } catch {
      // Invalid URL omitted; do not throw
    }
  }

  if (typeof record.expiresOn === "string" && record.expiresOn.trim()) {
    result.expiresAt = record.expiresOn.trim();
  }

  return result;
}

/**
 * Pure adapter converting a list of canonical saved deal records into MapDeals.
 * Filters out invalid points and deduplicates by stable _id.
 */
export function toCanonicalMapDeals(records: readonly CanonicalSavedDeal[]): MapDeal[] {
  if (!Array.isArray(records)) return [];

  const seenIds = new Set<string>();
  const output: MapDeal[] = [];

  for (const record of records) {
    const deal = toCanonicalMapDeal(record);
    if (!deal) continue;
    if (seenIds.has(deal.id)) continue;
    seenIds.add(deal.id);
    output.push(deal);
  }

  return output;
}
