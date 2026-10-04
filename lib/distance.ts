/**
 * Pure haversine distance calculation utility.
 * Mean Earth radius: 6371.0088 km (IUGG / WGS84 volumetric mean radius).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export const EARTH_RADIUS_KM = 6371.0088;

function validatePoint(point: LatLng, name: string): void {
  if (!point || typeof point !== "object") {
    throw new RangeError(`${name} must be a coordinate object with lat and lng`);
  }
  const { lat, lng } = point;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(
      `${name}.lat must be a finite number between -90 and 90; received ${lat}`
    );
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(
      `${name}.lng must be a finite number between -180 and 180; received ${lng}`
    );
  }
}

/**
 * Calculates the great-circle distance between two points on Earth in kilometers
 * using the Haversine formula.
 *
 * @param a First coordinate { lat, lng }
 * @param b Second coordinate { lat, lng }
 * @returns Great-circle distance in kilometers
 * @throws RangeError if coordinates are missing, non-finite, or out of valid bounds
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  validatePoint(a, "Point a");
  validatePoint(b, "Point b");

  // Fast path for identical coordinates or identical points on the antimeridian
  if (a.lat === b.lat && (a.lng === b.lng || Math.abs(a.lng - b.lng) === 360)) {
    return 0;
  }

  const toRad = Math.PI / 180;
  const phi1 = a.lat * toRad;
  const phi2 = b.lat * toRad;
  const deltaPhi = (b.lat - a.lat) * toRad;
  const deltaLambda = (b.lng - a.lng) * toRad;

  const sinHalfDeltaPhi = Math.sin(deltaPhi / 2);
  const sinHalfDeltaLambda = Math.sin(deltaLambda / 2);

  const h =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda;

  // Clamp intermediate h to [0, 1] to guard against floating-point inaccuracies
  // (e.g. antipodal points or rounding errors)
  const clampedH = Math.min(1, Math.max(0, h));

  const c = 2 * Math.atan2(Math.sqrt(clampedH), Math.sqrt(1 - clampedH));

  return EARTH_RADIUS_KM * c;
}
