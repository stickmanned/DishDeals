/**
 * Bounded deterministic geocoding transport and policy core (T-08G-CORE).
 *
 * Implements the core geocoding contract for DishDeals with strict compliance
 * to OpenStreetMap / Nominatim usage policies:
 * - Application-wide maximum 1 request per second via injected global slot reservation.
 * - Explicit identifying User-Agent with contact information.
 * - Prominent OpenStreetMap copyright attribution.
 * - Aggressive caching of normalized queries.
 * - Strict prohibition of autocomplete / search-as-you-type and bulk scraping.
 * - Bounded Metro Vancouver geographic envelope (viewbox) with double-validation of coordinates.
 * - Injected transport and storage abstractions (zero assumptions of distributed memory).
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 * @see https://nominatim.org/release-docs/latest/api/Search/
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Calibrated geographic bounding box encompassing Metro Vancouver:
 * - West: -123.35 (Bowen Island / Point Grey waters)
 * - South: 49.00 (US/Canada international border / Tsawwassen / White Rock)
 * - East: -122.55 (Langley / Maple Ridge regional boundaries)
 * - North: 49.45 (North Shore mountains / Belcarra / Lions Bay)
 *
 * Center covers Vancouver, Burnaby, Richmond, Surrey, Tri-Cities, and SFU Burnaby Mountain.
 */
export const METRO_VANCOUVER_BBOX: BoundingBox = {
  minLng: -123.35,
  minLat: 49.00,
  maxLng: -122.55,
  maxLat: 49.45,
};

export const OSM_ATTRIBUTION = {
  notice: "Data © OpenStreetMap contributors, ODbL 1.0.",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1.0/",
  copyrightUrl: "https://www.openstreetmap.org/copyright",
} as const;

export const NOMINATIM_DEFAULTS = {
  endpoint: "https://nominatim.openstreetmap.org/search",
  format: "jsonv2",
  limit: 5,
  bounded: "1",
  timeoutMs: 8000,
  cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  minQueryLength: 2,
  maxQueryLength: 120,
} as const;

export interface SlotReservationGranted {
  granted: true;
}

export interface SlotReservationDenied {
  granted: false;
  retryAfterMs: number;
}

export type SlotReservationResult = SlotReservationGranted | SlotReservationDenied;

export type ReserveGlobalSlotFn = () => Promise<SlotReservationResult>;
export type CacheGetFn = (cacheKey: string) => Promise<GeocodeResult[] | null>;
export type CachePutFn = (
  cacheKey: string,
  results: GeocodeResult[],
  ttlMs?: number
) => Promise<void>;
export type TransportFn = (url: string, init: RequestInit) => Promise<Response>;

export interface GeocodePolicyConfig {
  /**
   * Geocoding service endpoint. Default: "https://nominatim.openstreetmap.org/search".
   * Allows server-side provider switching (e.g. self-hosted Nominatim, Photon, LocationIQ).
   */
  endpoint?: string;
  /**
   * Identifying User-Agent header with contact info (required by Nominatim policy).
   * Example: "DishDeals-StormHacks/1.0 (contact@dishdeals.app)"
   */
  userAgent: string;
  /**
   * Network request timeout in milliseconds. Default: 8000ms.
   */
  timeoutMs?: number;
  /**
   * Maximum results returned (clamped to 1..5). Default: 5.
   */
  maxResults?: number;
  /**
   * Geographic envelope constraint. Default: METRO_VANCOUVER_BBOX.
   */
  bbox?: BoundingBox;
  /**
   * In-cache retention period in milliseconds. Default: 7 days.
   */
  cacheTtlMs?: number;
}

export interface GeocodeDeps {
  /**
   * Injected distributed slot reservation function. Coordinates application-wide rate-limiting
   * (e.g. max 1 request/sec via Convex durable state).
   */
  reserveGlobalSlot: ReserveGlobalSlotFn;
  /**
   * Injected cache reader.
   */
  cacheGet?: CacheGetFn;
  /**
   * Injected cache writer.
   */
  cachePut?: CachePutFn;
  /**
   * Injected HTTP transport. Defaults to globalThis.fetch.
   */
  transport?: TransportFn;
}

export interface GeocodeInput {
  /**
   * User-submitted place query (e.g. restaurant name or street address).
   */
  query: string;
}

export type GeocodeErrorCode =
  | "INVALID_QUERY"
  | "CONFIGURATION_ERROR"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class GeocodeError extends Error {
  constructor(
    public readonly code: GeocodeErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GeocodeError";
  }
}

/**
 * Validates and normalizes user query string:
 * - Trims external whitespace.
 * - Collapses repeated internal whitespace to a single space.
 * - Rejects empty queries and lengths outside [minQueryLength, maxQueryLength].
 * - Rejects control characters, ASCII 0x00-0x1F, 0x7F, and null bytes.
 * - Rejects URL schemes and HTML/script injection tags.
 * - Requires at least one alphanumeric character.
 */
export function validateAndNormalizeQuery(query: unknown): string {
  if (typeof query !== "string") {
    throw new GeocodeError("INVALID_QUERY", "Query must be a string");
  }

  // Check for control characters (ASCII 0x00-0x1F, 0x7F-0x9F)
  if (/[\x00-\x1F\x7F-\x9F]/.test(query)) {
    throw new GeocodeError("INVALID_QUERY", "Query contains invalid control characters");
  }

  const trimmed = query.trim().replace(/\s+/g, " ");

  if (trimmed.length < NOMINATIM_DEFAULTS.minQueryLength) {
    throw new GeocodeError(
      "INVALID_QUERY",
      `Query too short; must be at least ${NOMINATIM_DEFAULTS.minQueryLength} characters`
    );
  }

  if (trimmed.length > NOMINATIM_DEFAULTS.maxQueryLength) {
    throw new GeocodeError(
      "INVALID_QUERY",
      `Query exceeds maximum length of ${NOMINATIM_DEFAULTS.maxQueryLength} characters`
    );
  }

  // Reject URLs or URI schemes
  if (/^(https?|ftp|file|javascript|data):/i.test(trimmed)) {
    throw new GeocodeError("INVALID_QUERY", "URLs and URI schemes are not allowed in place queries");
  }

  // Reject HTML/XML tags
  if (/[<>]/.test(trimmed)) {
    throw new GeocodeError("INVALID_QUERY", "HTML characters are not allowed in place queries");
  }

  // Require at least one alphanumeric character (prevent punctuation-only queries)
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    throw new GeocodeError("INVALID_QUERY", "Query must contain at least one letter or digit");
  }

  return trimmed;
}

/**
 * Validates runtime policy configuration:
 * - Requires non-empty identifying User-Agent containing contact info.
 * - Enforces HTTPS endpoint for public networks (unless explicitly localhost/test).
 * - Enforces positive finite timeout.
 */
export function validateConfig(config: GeocodePolicyConfig): void {
  if (!config || typeof config !== "object") {
    throw new GeocodeError("CONFIGURATION_ERROR", "Configuration object is required");
  }

  if (typeof config.userAgent !== "string" || config.userAgent.trim().length === 0) {
    throw new GeocodeError(
      "CONFIGURATION_ERROR",
      "User-Agent is required by OpenStreetMap Nominatim usage policy"
    );
  }

  const ua = config.userAgent.trim();
  // Nominatim policy explicitly requires:
  // "Provide a valid HTTP User-Agent identifying the application... A valid contact email or link to a contact page is required."
  const hasContact = ua.includes("@") || ua.includes("http://") || ua.includes("https://");
  if (
    ua.length < 5 ||
    !hasContact ||
    /^curl\//i.test(ua) ||
    /^mozilla\//i.test(ua) ||
    /^python/i.test(ua) ||
    /^wget\//i.test(ua)
  ) {
    throw new GeocodeError(
      "CONFIGURATION_ERROR",
      "User-Agent must identify the application and include a contact email or domain per Nominatim policy"
    );
  }

  const endpoint = config.endpoint ?? NOMINATIM_DEFAULTS.endpoint;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new GeocodeError(
        "CONFIGURATION_ERROR",
        `Endpoint must use HTTPS protocol; received ${parsed.protocol}`
      );
    }
  } catch (err) {
    if (err instanceof GeocodeError) throw err;
    throw new GeocodeError("CONFIGURATION_ERROR", `Invalid endpoint URL: ${endpoint}`);
  }

  if (config.timeoutMs !== undefined) {
    if (typeof config.timeoutMs !== "number" || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
      throw new GeocodeError("CONFIGURATION_ERROR", "timeoutMs must be a positive finite number");
    }
  }

  if (config.maxResults !== undefined) {
    if (typeof config.maxResults !== "number" || !Number.isInteger(config.maxResults) || config.maxResults < 1 || config.maxResults > 5) {
      throw new GeocodeError("CONFIGURATION_ERROR", "maxResults must be an integer between 1 and 5");
    }
  }
}

/**
 * Generates deterministic cache key for normalized query and endpoint.
 */
export function getGeocodeCacheKey(normalizedQuery: string, endpoint: string): string {
  const url = new URL(endpoint);
  return `geocode:v1:${url.hostname.toLowerCase()}:${normalizedQuery.toLowerCase()}`;
}

/**
 * Checks whether coordinate point falls strictly within the given bounding box.
 */
export function isInsideBoundingBox(coord: LatLng, bbox: BoundingBox): boolean {
  return (
    coord.lat >= bbox.minLat &&
    coord.lat <= bbox.maxLat &&
    coord.lng >= bbox.minLng &&
    coord.lng <= bbox.maxLng
  );
}

/**
 * Constructs the Nominatim Search URL with format=jsonv2, bounded viewbox, and limit.
 *
 * Nominatim viewbox format: viewbox=<left>,<top>,<right>,<bottom>
 * where:
 *   left   = minLng
 *   top    = maxLat
 *   right  = maxLng
 *   bottom = minLat
 */
export function buildNominatimUrl(
  normalizedQuery: string,
  endpoint: string,
  bbox: BoundingBox,
  maxResults: number
): URL {
  const url = new URL(endpoint);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("format", NOMINATIM_DEFAULTS.format);
  url.searchParams.set("bounded", NOMINATIM_DEFAULTS.bounded);
  url.searchParams.set("limit", String(maxResults));
  url.searchParams.set(
    "viewbox",
    `${bbox.minLng},${bbox.maxLat},${bbox.maxLng},${bbox.minLat}`
  );
  return url;
}

/**
 * Parses and validates raw provider response against the canonical GeocodeResult contract:
 * - Ensures lat and lon are valid finite numbers.
 * - Re-validates that coordinates are within the specified bounding box.
 * - Discards malformed or out-of-bounds results.
 * - Caps results to maxResults.
 */
export function parseAndValidateProviderResponse(
  data: unknown,
  bbox: BoundingBox,
  maxResults: number
): GeocodeResult[] {
  if (!Array.isArray(data)) {
    throw new GeocodeError("INVALID_RESPONSE", "Expected JSON array from geocoding provider");
  }

  const results: GeocodeResult[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const rawLat = Number(raw.lat);
    const rawLng = Number(raw.lng ?? raw.lon);

    if (!Number.isFinite(rawLat) || rawLat < -90 || rawLat > 90) continue;
    if (!Number.isFinite(rawLng) || rawLng < -180 || rawLng > 180) continue;

    const coord: LatLng = { lat: rawLat, lng: rawLng };
    if (!isInsideBoundingBox(coord, bbox)) {
      // Discard results outside Metro Vancouver
      continue;
    }

    const rawLabel =
      typeof raw.label === "string" && raw.label.trim().length > 0
        ? raw.label.trim()
        : typeof raw.display_name === "string" && raw.display_name.trim().length > 0
          ? raw.display_name.trim()
          : typeof raw.name === "string" && raw.name.trim().length > 0
            ? raw.name.trim()
            : null;

    if (!rawLabel) continue;

    results.push({
      lat: coord.lat,
      lng: coord.lng,
      label: rawLabel,
    });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

/**
 * Core geocoding implementation adhering to OpenStreetMap Nominatim usage policies.
 *
 * Sequence:
 * 1. Validates configuration and input query.
 * 2. Checks injected cache (if available); on cache hit, returns immediately without
 *    touching the global rate-limit slot or making network requests.
 * 3. On cache miss, attempts to reserve an application-wide slot via injected `reserveGlobalSlot`.
 *    If denied, throws an actionable GeocodeError("RATE_LIMITED", ..., retryAfterMs).
 * 4. Executes HTTP fetch with bounded timeout and policy-compliant headers.
 * 5. Parses and double-validates coordinates against the Metro Vancouver envelope.
 * 6. Stores valid results in the injected cache (if available).
 * 7. Returns 0..5 verified GeocodeResults.
 */
export async function geocodeCore(
  input: GeocodeInput,
  config: GeocodePolicyConfig,
  deps: GeocodeDeps
): Promise<GeocodeResult[]> {
  validateConfig(config);

  if (!deps || typeof deps.reserveGlobalSlot !== "function") {
    throw new GeocodeError(
      "CONFIGURATION_ERROR",
      "deps.reserveGlobalSlot must be a function coordinating application-wide rate-limiting"
    );
  }

  const normalizedQuery = validateAndNormalizeQuery(input?.query);
  const endpoint = config.endpoint ?? NOMINATIM_DEFAULTS.endpoint;
  const bbox = config.bbox ?? METRO_VANCOUVER_BBOX;
  const maxResults = config.maxResults ?? NOMINATIM_DEFAULTS.limit;
  const timeoutMs = config.timeoutMs ?? NOMINATIM_DEFAULTS.timeoutMs;
  const cacheKey = getGeocodeCacheKey(normalizedQuery, endpoint);

  // 1. Injected Cache Lookup (bypasses slot reservation on hit)
  if (typeof deps.cacheGet === "function") {
    try {
      const cached = await deps.cacheGet(cacheKey);
      if (cached !== null && Array.isArray(cached)) {
        // Validate cached records
        const validCached = parseAndValidateProviderResponse(cached, bbox, maxResults);
        return validCached;
      }
    } catch (cacheErr) {
      // Non-fatal cache read error; fall through to live geocode
      console.warn("Geocode cache read error, proceeding to live slot reservation:", cacheErr);
    }
  }

  // 2. Global Rate-Limit Slot Reservation (Coordination for max 1 req/sec)
  const slot = await deps.reserveGlobalSlot();
  if (slot.granted === false) {
    throw new GeocodeError(
      "RATE_LIMITED",
      "Global geocoding rate limit reached; maximum 1 request per second permitted across application",
      slot.retryAfterMs
    );
  }

  // 3. Network Transport Execution
  const transport = deps.transport ?? globalThis.fetch;
  const targetUrl = buildNominatimUrl(normalizedQuery, endpoint, bbox, maxResults);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await transport(targetUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": config.userAgent,
        "Accept": "application/json",
        "Accept-Language": "en",
      },
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeocodeError(
        "PROVIDER_TIMEOUT",
        `Geocoding request timed out after ${timeoutMs}ms`,
        undefined,
        err
      );
    }
    throw new GeocodeError(
      "PROVIDER_UNAVAILABLE",
      `Network error communicating with geocoding provider: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  // 4. HTTP Status Validation
  if (response.status === 429) {
    const retryHeader = response.headers.get("Retry-After");
    const retryAfterSec = retryHeader ? parseInt(retryHeader, 10) : 2;
    const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 2000;
    throw new GeocodeError(
      "RATE_LIMITED",
      "Upstream geocoding provider returned HTTP 429 Too Many Requests",
      retryAfterMs
    );
  }

  if (response.status >= 500) {
    throw new GeocodeError(
      "PROVIDER_UNAVAILABLE",
      `Upstream geocoding service unavailable (HTTP ${response.status})`
    );
  }

  if (response.status !== 200) {
    throw new GeocodeError(
      "PROVIDER_ERROR",
      `Upstream geocoding provider returned HTTP ${response.status}`
    );
  }

  // 5. Parse and Validate Body
  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch (jsonErr) {
    throw new GeocodeError(
      "INVALID_RESPONSE",
      "Failed to parse JSON response from geocoding provider",
      undefined,
      jsonErr
    );
  }

  const results = parseAndValidateProviderResponse(rawBody, bbox, maxResults);

  // 6. Injected Cache Write
  if (typeof deps.cachePut === "function") {
    try {
      await deps.cachePut(cacheKey, results, config.cacheTtlMs ?? NOMINATIM_DEFAULTS.cacheTtlMs);
    } catch (cacheWriteErr) {
      // Non-fatal cache write error
      console.warn("Geocode cache write error:", cacheWriteErr);
    }
  }

  return results;
}
