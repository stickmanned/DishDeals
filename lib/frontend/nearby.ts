import { validity, type DealView, type DealValidity } from "./deals";
import { distanceKm, type LatLng } from "../distance";

// The one shared haversine lives in lib/distance.ts.
export { distanceKm, type LatLng };

export type NearbyOrigin = LatLng & {
  /** "device" came from the browser's geolocation prompt; "default" is the fallback anchor. */
  source: "device" | "default";
  label: string;
};

/** Metropolis at Metrotown, Burnaby. Only used until the visitor chooses to share their location. */
export const DEFAULT_ORIGIN: NearbyOrigin = {
  lat: 49.2276,
  lng: -122.9996,
  source: "default",
  label: "Metrotown, Burnaby",
};

export const RADIUS_OPTIONS_KM = [2, 5, 10] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number] | null;

export type NearbyDeal = { deal: DealView; distanceKm?: number };

export function hasCoordinates(
  deal: DealView,
): deal is DealView & { lat: number; lng: number } {
  return (
    typeof deal.lat === "number" &&
    typeof deal.lng === "number" &&
    Number.isFinite(deal.lat) &&
    Number.isFinite(deal.lng) &&
    Math.abs(deal.lat) <= 90 &&
    Math.abs(deal.lng) <= 180
  );
}

export function formatDistance(km: number): string {
  if (km < 0.95) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

// Deals that can be used soonest come first; ties fall back to distance.
const statusRank: Record<DealValidity["status"], number> = {
  valid: 0,
  later_today: 1,
  unknown: 2,
  not_today: 3,
  expired: 4,
};

/**
 * Attach distance from `origin`, drop known-distance deals beyond `radiusKm`, and order by
 * usability then proximity. Deals without coordinates stay visible at the end of their
 * usability group so a missing location never hides an offer.
 */
export function nearbyDeals(
  deals: DealView[],
  origin: LatLng,
  radiusKm: RadiusKm,
  now: Date,
): NearbyDeal[] {
  return deals
    .map((deal) => ({
      deal,
      distanceKm: hasCoordinates(deal) ? distanceKm(origin, deal) : undefined,
      rank: statusRank[validity(deal, now).status],
    }))
    .filter(
      (row) =>
        radiusKm === null ||
        row.distanceKm === undefined ||
        row.distanceKm <= radiusKm,
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
        b.deal.createdAt - a.deal.createdAt,
    )
    .map(({ deal, distanceKm }) => ({
      deal,
      ...(distanceKm !== undefined ? { distanceKm } : {}),
    }));
}
