/**
 * Bounded deterministic geocoding transport and policy core (T-08G-CORE).
 *
 * Implements the core geocoding contract for DishDeals with strict compliance
 * to OpenStreetMap / Nominatim usage policies:
 * - Application-wide maximum 1 request per second via injected global slot reservation.
 * - Genuine identifying User-Agent; contact configuration enforced as DishDeals operational rule.
 * - Prominent OpenStreetMap copyright attribution.
 * - Aggressive caching of normalized queries scoped to endpoint, bounds, and result limits.
 * - Strict prohibition of autocomplete / search-as-you-type and bulk scraping.
 * - Chosen Metro Vancouver search envelope (viewbox) with double-validation of coordinates.
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
 * Chosen search envelope encompassing Metro Vancouver for deal discovery:
 * - West: -123.35 (coastal waters / Point Grey)
 * - South: 49.00 (southern regional approaches / US border vicinity)
 * - East: -122.55 (eastern regional perimeter)
 * - North: 49.45 (North Shore slopes)
 *
 * Note: This is an operational application search envelope, not an independently
 * surveyed or legally confirmed regional boundary definition.
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
  minTimeoutMs: 100,
  maxTimeoutMs: 60000,
  cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxCacheTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  minQueryLength: 2,
  maxQueryLength: 120,
  maxResponseBytes: 256 * 1024, // 256 KB response body limit
  maxProviderRecords: 50, // Capped upstream array processing
  maxLabelLength: 300, // Bounded label string length
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
   * Genuine identifying User-Agent header with contact info.
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
   * Geographic search envelope constraint. Default: METRO_VANCOUVER_BBOX.
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
 * - Rejects control characters, ASCII 0x00-0x1F, 0x7F-0x9F, and null bytes.
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
 * Validates bounding box coordinates:
 * - Must be finite numbers.
 * - Longitudes must be in [-180, 180].
 * - Latitudes must be in [-90, 90].
 * - Geographically ordered: minLng < maxLng and minLat < maxLat.
 */
export function validateBoundingBox(bbox: BoundingBox): void {
  if (!bbox || typeof bbox !== "object") {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box object is required");
  }

  const { minLng, minLat, maxLng, maxLat } = bbox;

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box coordinates must be finite numbers");
  }

  if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box longitudes must be between -180 and 180");
  }

  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box latitudes must be between -90 and 90");
  }

  if (minLng >= maxLng) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box minLng must be strictly less than maxLng");
  }

  if (minLat >= maxLat) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Bounding box minLat must be strictly less than maxLat");
  }
}

/**
 * Validates runtime policy configuration:
 * - Requires genuine identifying User-Agent with contact info per DishDeals operational policy.
 * - Enforces HTTPS or explicit http://localhost only (rejects ftp localhost, credentials, fragments).
 * - Enforces positive finite bounded timeout and cache TTL.
 * - Validates bounding box if specified.
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
  // Nominatim policy requires a genuine identifying User-Agent (forbids curl, wget, python, etc.).
  // Including contact information is DishDeals' operational rule for upstream responsibility.
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
      "User-Agent must identify the application and include contact info per DishDeals operational policy"
    );
  }

  const endpoint = config.endpoint ?? NOMINATIM_DEFAULTS.endpoint;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new GeocodeError("CONFIGURATION_ERROR", "Invalid endpoint URL");
  }

  // Reject URLs containing credentials
  if (parsed.username || parsed.password) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Endpoint URL must not contain credentials");
  }

  // Reject URL fragments
  if (parsed.hash) {
    throw new GeocodeError("CONFIGURATION_ERROR", "Endpoint URL must not contain a URL fragment/hash");
  }

  // Reject non-http(s) schemes (e.g. ftp://localhost)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new GeocodeError("CONFIGURATION_ERROR", "Endpoint must use HTTPS or HTTP on localhost");
  }

  // If HTTP, only localhost or loopback is permitted
  if (parsed.protocol === "http:") {
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
    if (!isLocalhost) {
      throw new GeocodeError(
        "CONFIGURATION_ERROR",
        "Non-HTTPS endpoint is only permitted for localhost or loopback"
      );
    }
  }

  if (config.timeoutMs !== undefined) {
    if (
      typeof config.timeoutMs !== "number" ||
      !Number.isFinite(config.timeoutMs) ||
      config.timeoutMs < NOMINATIM_DEFAULTS.minTimeoutMs ||
      config.timeoutMs > NOMINATIM_DEFAULTS.maxTimeoutMs
    ) {
      throw new GeocodeError(
        "CONFIGURATION_ERROR",
        `timeoutMs must be a finite number between ${NOMINATIM_DEFAULTS.minTimeoutMs} and ${NOMINATIM_DEFAULTS.maxTimeoutMs}`
      );
    }
  }

  if (config.cacheTtlMs !== undefined) {
    if (
      typeof config.cacheTtlMs !== "number" ||
      !Number.isFinite(config.cacheTtlMs) ||
      config.cacheTtlMs <= 0 ||
      config.cacheTtlMs > NOMINATIM_DEFAULTS.maxCacheTtlMs
    ) {
      throw new GeocodeError(
        "CONFIGURATION_ERROR",
        `cacheTtlMs must be a positive finite number not exceeding ${NOMINATIM_DEFAULTS.maxCacheTtlMs}ms`
      );
    }
  }

  if (config.maxResults !== undefined) {
    if (
      typeof config.maxResults !== "number" ||
      !Number.isInteger(config.maxResults) ||
      config.maxResults < 1 ||
      config.maxResults > 5
    ) {
      throw new GeocodeError("CONFIGURATION_ERROR", "maxResults must be an integer between 1 and 5");
    }
  }

  if (config.bbox !== undefined) {
    validateBoundingBox(config.bbox);
  }
}

/**
 * Generates deterministic cache key distinguishing full provider endpoint (path, port, query),
 * geographic search envelope, and maxResults.
 *
 * Provides safe default arguments for backwards caller compatibility.
 */
export function getGeocodeCacheKey(
  normalizedQuery: string,
  endpoint: string = NOMINATIM_DEFAULTS.endpoint,
  bbox: BoundingBox = METRO_VANCOUVER_BBOX,
  maxResults: number = NOMINATIM_DEFAULTS.limit
): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    parsed = new URL(NOMINATIM_DEFAULTS.endpoint);
  }

  // Sort search query params to produce a canonical representation
  const searchKeys = Array.from(parsed.searchParams.keys()).sort();
  const sortedSearch = searchKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(parsed.searchParams.get(k) ?? "")}`)
    .join("&");

  const endpointKey = `${parsed.protocol}//${parsed.host}${parsed.pathname}${
    sortedSearch ? `?${sortedSearch}` : ""
  }`.toLowerCase();

  const bboxSegment = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  return `geocode:v2:${endpointKey}:${bboxSegment}:${maxResults}:${normalizedQuery.toLowerCase()}`;
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
 * Strict numeric parser for coordinate values.
 *
 * Explicitly rejects booleans, null, undefined, blank strings, and objects
 * so that Number(null) or Number(false) cannot fabricate 0 coordinates.
 */
export function parseNumericCoordinate(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    // Strict numeric string match (optional sign, digits, optional decimal)
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Sanitizes and bounds a candidate label:
 * - Strips control characters (ASCII 0x00-0x1F, 0x7F-0x9F) and null bytes.
 * - Collapses internal whitespace.
 * - Caps label length to maxLength.
 */
export function sanitizeLabel(
  candidate: unknown,
  maxLength: number = NOMINATIM_DEFAULTS.maxLabelLength
): string | null {
  if (typeof candidate !== "string") return null;
  const stripped = candidate
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (stripped.length === 0) return null;
  return stripped.length > maxLength ? stripped.slice(0, maxLength).trim() : stripped;
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
 * - Enforces strict numeric coordinates (no boolean/null/blank fabrication).
 * - Re-validates that coordinates are within the specified bounding box.
 * - Discards malformed or out-of-bounds results.
 * - Sanitizes, cleans control characters, and bounds labels.
 * - Caps results to maxResults.
 * - Bounded upstream array processing.
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
  const boundedRecords = data.slice(0, NOMINATIM_DEFAULTS.maxProviderRecords);

  for (const item of boundedRecords) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const rawLat = parseNumericCoordinate(raw.lat);
    const rawLng = parseNumericCoordinate(raw.lng ?? raw.lon);

    if (rawLat === null || rawLat < -90 || rawLat > 90) continue;
    if (rawLng === null || rawLng < -180 || rawLng > 180) continue;

    const coord: LatLng = { lat: rawLat, lng: rawLng };
    if (!isInsideBoundingBox(coord, bbox)) {
      continue;
    }

    const candidateLabel =
      typeof raw.label === "string"
        ? raw.label
        : typeof raw.display_name === "string"
          ? raw.display_name
          : typeof raw.name === "string"
            ? raw.name
            : null;

    const label = sanitizeLabel(candidateLabel, NOMINATIM_DEFAULTS.maxLabelLength);
    if (!label) continue;

    results.push({
      lat: coord.lat,
      lng: coord.lng,
      label,
    });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

/**
 * Fire-and-forget cancellation for streams or readers with rejection handling.
 *
 * Ensures that if a cancel operation stalls or returns a rejected Promise,
 * it cannot hang the execution thread or produce unhandled promise rejections.
 */
function safeFireAndForgetCancel(
  target: { cancel?: (reason?: unknown) => Promise<unknown> } | null | undefined
): void {
  try {
    const p = target?.cancel?.();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  } catch {
    // Ignore synchronous cancellation errors
  }
}

/**
 * Reads response body with strict byte-capping and active cancellation.
 */
async function readCappedResponseBody(
  response: Response,
  controller: AbortController,
  maxBytes: number
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      safeFireAndForgetCancel(response.body);
      throw new GeocodeError(
        "INVALID_RESPONSE",
        `Response exceeded maximum size limit of ${maxBytes} bytes`
      );
    }
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    const onAbort = () => {
      safeFireAndForgetCancel(reader);
    };

    if (controller.signal.aborted) {
      onAbort();
    } else {
      controller.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.byteLength;
          if (receivedBytes > maxBytes) {
            safeFireAndForgetCancel(reader);
            throw new GeocodeError(
              "INVALID_RESPONSE",
              `Response exceeded maximum size limit of ${maxBytes} bytes`
            );
          }
          chunks.push(value);
        }
      }
    } catch (readErr) {
      if (readErr instanceof GeocodeError) {
        throw readErr;
      }
      if (controller.signal.aborted) {
        const timeoutErr = new Error("The operation was aborted");
        timeoutErr.name = "AbortError";
        throw timeoutErr;
      }
      throw readErr;
    } finally {
      controller.signal.removeEventListener("abort", onAbort);
    }

    if (controller.signal.aborted) {
      const timeoutErr = new Error("The operation was aborted");
      timeoutErr.name = "AbortError";
      throw timeoutErr;
    }

    const decoder = new TextDecoder("utf-8");
    let text = "";
    for (const chunk of chunks) {
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    return text;
  }

  if (typeof response.text === "function") {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new GeocodeError(
        "INVALID_RESPONSE",
        `Response exceeded maximum size limit of ${maxBytes} bytes`
      );
    }
    return text;
  }

  if (typeof response.json === "function") {
    const json = await response.json();
    const text = JSON.stringify(json);
    if (text.length > maxBytes) {
      throw new GeocodeError(
        "INVALID_RESPONSE",
        `Response exceeded maximum size limit of ${maxBytes} bytes`
      );
    }
    return text;
  }

  throw new GeocodeError("INVALID_RESPONSE", "Response body is not readable");
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
 * 4. Executes HTTP fetch with bounded timeout and policy-compliant headers, maintaining
 *    an explicit deadline Promise.race across full transport, stream reading, and parsing.
 * 5. Parses and double-validates coordinates against the search envelope.
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
  const cacheKey = getGeocodeCacheKey(normalizedQuery, endpoint, bbox, maxResults);

  // 1. Injected Cache Lookup (bypasses slot reservation on hit)
  if (typeof deps.cacheGet === "function") {
    try {
      const cached = await deps.cacheGet(cacheKey);
      if (cached !== null && Array.isArray(cached)) {
        return parseAndValidateProviderResponse(cached, bbox, maxResults);
      }
    } catch {
      // Safe no-content handling: do not log raw exception or cacheKey containing user address
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

  // 3. Network Transport Execution & Capped Body Reading with Explicit Deadline Promise.race
  const transport = deps.transport ?? globalThis.fetch;
  const targetUrl = buildNominatimUrl(normalizedQuery, endpoint, bbox, maxResults);

  const controller = new AbortController();

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      controller.abort();
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    }, timeoutMs);
  });

  const executionPromise = (async (): Promise<unknown> => {
    const response = await transport(targetUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": config.userAgent,
        "Accept": "application/json",
        "Accept-Language": "en",
      },
      signal: controller.signal,
    });

    // 4. HTTP Status Validation
    if (response.status === 429) {
      controller.abort();
      const retryHeader = response.headers.get("Retry-After");
      const retryAfterSec = retryHeader ? parseInt(retryHeader, 10) : 2;
      const retryAfterMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 2000;
      throw new GeocodeError(
        "RATE_LIMITED",
        "Upstream geocoding provider returned HTTP 429 Too Many Requests",
        retryAfterMs
      );
    }

    if (response.status >= 500) {
      controller.abort();
      throw new GeocodeError(
        "PROVIDER_UNAVAILABLE",
        `Upstream geocoding service unavailable (HTTP ${response.status})`
      );
    }

    if (response.status !== 200) {
      controller.abort();
      throw new GeocodeError(
        "PROVIDER_ERROR",
        `Upstream geocoding provider returned HTTP ${response.status}`
      );
    }

    // Read capped body with timeout STILL ACTIVE
    const rawBodyText = await readCappedResponseBody(
      response,
      controller,
      NOMINATIM_DEFAULTS.maxResponseBytes
    );

    // Parse JSON with timeout STILL ACTIVE
    try {
      return JSON.parse(rawBodyText);
    } catch {
      throw new GeocodeError(
        "INVALID_RESPONSE",
        "Failed to parse JSON response from geocoding provider"
      );
    }
  })();

  let rawJson: unknown;
  try {
    rawJson = await Promise.race([executionPromise, timeoutPromise]);
  } catch (err: unknown) {
    if (err instanceof GeocodeError) {
      throw err;
    }
    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw new GeocodeError(
        "PROVIDER_TIMEOUT",
        `Geocoding request timed out after ${timeoutMs}ms`
      );
    }
    // Safe generic error: do not expose raw error or targetUrl which can contain user address
    throw new GeocodeError(
      "PROVIDER_UNAVAILABLE",
      "Network error communicating with geocoding provider"
    );
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
  }

  const results = parseAndValidateProviderResponse(rawJson, bbox, maxResults);

  // 5. Injected Cache Write
  if (typeof deps.cachePut === "function") {
    try {
      await deps.cachePut(
        cacheKey,
        results,
        config.cacheTtlMs ?? NOMINATIM_DEFAULTS.cacheTtlMs
      );
    } catch {
      // Safe no-content handling: do not log raw exception or cacheKey containing user address
    }
  }

  return results;
}
