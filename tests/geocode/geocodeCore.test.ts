import { describe, expect, it, vi } from "vitest";
import {
  geocodeCore,
  GeocodeError,
  METRO_VANCOUVER_BBOX,
  OSM_ATTRIBUTION,
  validateAndNormalizeQuery,
  validateConfig,
  validateBoundingBox,
  buildNominatimUrl,
  isInsideBoundingBox,
  parseAndValidateProviderResponse,
  parseNumericCoordinate,
  sanitizeLabel,
  getGeocodeCacheKey,
  type GeocodePolicyConfig,
  type GeocodeDeps,
  type GeocodeResult,
  type BoundingBox,
} from "../../lib/geocodeCore";

const VALID_CONFIG: GeocodePolicyConfig = {
  userAgent: "DishDeals-StormHacks/1.0 (contact@dishdeals.app)",
  endpoint: "https://nominatim.openstreetmap.org/search",
  timeoutMs: 5000,
  maxResults: 5,
};

const MOCK_BURNABY_NOMINATIM_ROW = {
  place_id: 28472910,
  lat: "49.2521",
  lon: "-123.0212",
  display_name: "Argo Greek, 3790, Canada Way, Burnaby, Metro Vancouver Regional District, British Columbia, V5G 1G4, Canada",
  name: "Argo Greek",
  type: "restaurant",
};

const MOCK_VANCOUVER_ROW = {
  place_id: 19482012,
  lat: "49.2827",
  lon: "-123.1207",
  display_name: "Robson Street, Downtown, Vancouver, Metro Vancouver Regional District, British Columbia, Canada",
  name: "Robson Street",
  type: "street",
};

const MOCK_OUT_OF_BOUNDS_ROW = {
  place_id: 9999999,
  lat: "43.6532", // Toronto, Ontario
  lon: "-79.3832",
  display_name: "Pho Hoa, Spadina Avenue, Chinatown, Toronto, Ontario, Canada",
  name: "Pho Hoa",
  type: "restaurant",
};

describe("geocodeCore: Policy & Transport Unit Tests", () => {
  describe("1. Query Validation and Normalization", () => {
    it("trims and collapses internal whitespaces", () => {
      const q = validateAndNormalizeQuery("   Tenen   Restaurant   ");
      expect(q).toBe("Tenen Restaurant");
    });

    it("rejects non-string queries", () => {
      expect(() => validateAndNormalizeQuery(null)).toThrowError(GeocodeError);
      expect(() => validateAndNormalizeQuery(123)).toThrowError(/must be a string/);
    });

    it("rejects queries shorter than 2 characters", () => {
      expect(() => validateAndNormalizeQuery("")).toThrowError(/too short/);
      expect(() => validateAndNormalizeQuery(" a ")).toThrowError(/too short/);
    });

    it("rejects queries exceeding 120 characters", () => {
      const longQuery = "a".repeat(121);
      expect(() => validateAndNormalizeQuery(longQuery)).toThrowError(/exceeds maximum length/);
    });

    it("rejects control characters, newlines, and null bytes", () => {
      expect(() => validateAndNormalizeQuery("Tenen\nRestaurant")).toThrowError(/invalid control characters/);
      expect(() => validateAndNormalizeQuery("Tentatsu\x00Sushi")).toThrowError(/invalid control characters/);
      expect(() => validateAndNormalizeQuery("Argo\tGreek")).toThrowError(/invalid control characters/);
      expect(() => validateAndNormalizeQuery("Acqua\x1FBar")).toThrowError(/invalid control characters/);
    });

    it("rejects URLs and URI schemes", () => {
      expect(() => validateAndNormalizeQuery("https://google.com")).toThrowError(/URLs and URI schemes are not allowed/);
      expect(() => validateAndNormalizeQuery("http://evil.com/search")).toThrowError(/URLs and URI schemes/);
      expect(() => validateAndNormalizeQuery("javascript:alert(1)")).toThrowError(/URLs and URI schemes/);
    });

    it("rejects HTML tags and injection tokens", () => {
      expect(() => validateAndNormalizeQuery("<script>alert(1)</script>")).toThrowError(/HTML characters are not allowed/);
      expect(() => validateAndNormalizeQuery("Acqua <b>Bar</b>")).toThrowError(/HTML characters/);
    });

    it("rejects punctuation-only queries", () => {
      expect(() => validateAndNormalizeQuery("???")).toThrowError(/must contain at least one letter or digit/);
      expect(() => validateAndNormalizeQuery("---")).toThrowError(/must contain at least one letter or digit/);
    });
  });

  describe("2. Configuration, Endpoint, and Bounds Validation", () => {
    it("requires genuine identifying User-Agent with contact info per DishDeals policy", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "" })).toThrowError(/User-Agent is required/);
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "curl/7.68.0" })).toThrowError(/contact info/);
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "Mozilla/5.0" })).toThrowError(/contact info/);
      expect(() => validateConfig(VALID_CONFIG)).not.toThrow();
    });

    it("enforces HTTPS protocol on public endpoints and allows HTTP localhost", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://nominatim.openstreetmap.org/search" })).toThrowError(
        /Non-HTTPS endpoint is only permitted for localhost/
      );
      // Localhost allowed for test mocks
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://localhost:8080/search" })).not.toThrow();
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://127.0.0.1:8080/search" })).not.toThrow();
    });

    it("rejects ftp localhost and other non-http(s) schemes", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "ftp://localhost:8080/search" })).toThrowError(
        /Endpoint must use HTTPS or HTTP on localhost/
      );
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "file:///etc/passwd" })).toThrowError(
        /Endpoint must use HTTPS or HTTP on localhost/
      );
    });

    it("rejects credentials and hash fragments in endpoint URLs", () => {
      expect(() =>
        validateConfig({ ...VALID_CONFIG, endpoint: "https://user:pass@nominatim.openstreetmap.org/search" })
      ).toThrowError(/must not contain credentials/);
      expect(() =>
        validateConfig({ ...VALID_CONFIG, endpoint: "https://nominatim.openstreetmap.org/search#results" })
      ).toThrowError(/must not contain a URL fragment/);
    });

    it("validates timeoutMs bounds (100ms..60000ms)", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, timeoutMs: -10 })).toThrowError(/finite number between/);
      expect(() => validateConfig({ ...VALID_CONFIG, timeoutMs: 50 })).toThrowError(/finite number between/);
      expect(() => validateConfig({ ...VALID_CONFIG, timeoutMs: 70000 })).toThrowError(/finite number between/);
      expect(() => validateConfig({ ...VALID_CONFIG, timeoutMs: Infinity })).toThrowError(/finite number between/);
    });

    it("validates cacheTtlMs bounds (positive, max 30 days)", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, cacheTtlMs: -100 })).toThrowError(/positive finite number/);
      expect(() => validateConfig({ ...VALID_CONFIG, cacheTtlMs: 0 })).toThrowError(/positive finite number/);
      expect(() => validateConfig({ ...VALID_CONFIG, cacheTtlMs: 31 * 24 * 60 * 60 * 1000 })).toThrowError(/not exceeding/);
      expect(() => validateConfig({ ...VALID_CONFIG, cacheTtlMs: 7 * 24 * 60 * 60 * 1000 })).not.toThrow();
    });

    it("validates maxResults (between 1 and 5)", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, maxResults: 0 })).toThrowError(/between 1 and 5/);
      expect(() => validateConfig({ ...VALID_CONFIG, maxResults: 6 })).toThrowError(/between 1 and 5/);
      expect(() => validateConfig({ ...VALID_CONFIG, maxResults: 2.5 })).toThrowError(/integer between 1 and 5/);
    });

    it("validates bounding box ordering and coordinate ranges", () => {
      // Inverted longitude
      const invertedLng: BoundingBox = { minLng: -122.5, minLat: 49.0, maxLng: -123.5, maxLat: 49.5 };
      expect(() => validateBoundingBox(invertedLng)).toThrowError(/minLng must be strictly less than maxLng/);

      // Inverted latitude
      const invertedLat: BoundingBox = { minLng: -123.5, minLat: 49.5, maxLng: -122.5, maxLat: 49.0 };
      expect(() => validateBoundingBox(invertedLat)).toThrowError(/minLat must be strictly less than maxLat/);

      // Non-finite coordinates
      const nonFinite: BoundingBox = { minLng: NaN, minLat: 49.0, maxLng: -122.5, maxLat: 49.5 };
      expect(() => validateBoundingBox(nonFinite)).toThrowError(/must be finite numbers/);

      // Out of world bounds
      const outOfBounds: BoundingBox = { minLng: -190, minLat: 49.0, maxLng: -122.5, maxLat: 49.5 };
      expect(() => validateBoundingBox(outOfBounds)).toThrowError(/longitudes must be between -180 and 180/);

      expect(() => validateBoundingBox(METRO_VANCOUVER_BBOX)).not.toThrow();
    });
  });

  describe("3. Search Envelope Constraints", () => {
    it("accepts points strictly inside Metro Vancouver search envelope", () => {
      // Burnaby City Hall: 49.252, -122.955
      expect(isInsideBoundingBox({ lat: 49.252, lng: -122.955 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // Downtown Vancouver: 49.282, -123.120
      expect(isInsideBoundingBox({ lat: 49.282, lng: -123.120 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // SFU Burnaby Mountain: 49.278, -122.919
      expect(isInsideBoundingBox({ lat: 49.278, lng: -122.919 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // Richmond: 49.166, -123.133
      expect(isInsideBoundingBox({ lat: 49.166, lng: -123.133 }, METRO_VANCOUVER_BBOX)).toBe(true);
    });

    it("rejects points outside Metro Vancouver search envelope", () => {
      // Seattle, WA: 47.6062, -122.3321
      expect(isInsideBoundingBox({ lat: 47.6062, lng: -122.3321 }, METRO_VANCOUVER_BBOX)).toBe(false);
      // Toronto, ON: 43.6532, -79.3832
      expect(isInsideBoundingBox({ lat: 43.6532, lng: -79.3832 }, METRO_VANCOUVER_BBOX)).toBe(false);
      // Calgary, AB: 51.0447, -114.0719
      expect(isInsideBoundingBox({ lat: 51.0447, lng: -114.0719 }, METRO_VANCOUVER_BBOX)).toBe(false);
    });

    it("constructs Nominatim URL with format=jsonv2, bounded=1, and viewbox", () => {
      const url = buildNominatimUrl("Argo Greek", "https://nominatim.openstreetmap.org/search", METRO_VANCOUVER_BBOX, 5);
      expect(url.searchParams.get("format")).toBe("jsonv2");
      expect(url.searchParams.get("bounded")).toBe("1");
      expect(url.searchParams.get("limit")).toBe("5");
      expect(url.searchParams.get("q")).toBe("Argo Greek");
      expect(url.searchParams.get("viewbox")).toBe("-123.35,49.45,-122.55,49");
    });
  });

  describe("4. Injected Cache Behavior", () => {
    it("returns cached results on hit, bypassing slot reservation and transport entirely", async () => {
      const cachedResults: GeocodeResult[] = [
        { lat: 49.2521, lng: -123.0212, label: "Argo Greek, 3790 Canada Way, Burnaby" },
      ];

      const cacheGet = vi.fn().mockResolvedValue(cachedResults);
      const reserveGlobalSlot = vi.fn();
      const transport = vi.fn();

      const deps: GeocodeDeps = {
        reserveGlobalSlot,
        cacheGet,
        transport,
      };

      const results = await geocodeCore({ query: "Argo Greek" }, VALID_CONFIG, deps);

      expect(results).toEqual(cachedResults);
      expect(cacheGet).toHaveBeenCalledTimes(1);
      expect(reserveGlobalSlot).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    });

    it("proceeds to slot reservation and live transport on cache miss", async () => {
      const cacheGet = vi.fn().mockResolvedValue(null);
      const cachePut = vi.fn().mockResolvedValue(undefined);
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([MOCK_BURNABY_NOMINATIM_ROW]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = {
        reserveGlobalSlot,
        cacheGet,
        cachePut,
        transport,
      };

      const results = await geocodeCore({ query: "Argo Greek" }, VALID_CONFIG, deps);

      expect(cacheGet).toHaveBeenCalledTimes(1);
      expect(reserveGlobalSlot).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(cachePut).toHaveBeenCalledTimes(1);

      expect(results).toHaveLength(1);
      expect(results[0].lat).toBe(49.2521);
      expect(results[0].lng).toBe(-123.0212);
      expect(results[0].label).toContain("Argo Greek");
    });

    it("survives cache read error safely without throwing or leaking", async () => {
      const cacheGet = vi.fn().mockRejectedValue(new Error("Cache connection dropped"));
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([MOCK_BURNABY_NOMINATIM_ROW]), { status: 200 })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, cacheGet, transport };
      const results = await geocodeCore({ query: "Argo Greek" }, VALID_CONFIG, deps);
      expect(results).toHaveLength(1);
    });
  });

  describe("5. Global Slot Rate-Limit Gate (Max 1 req/sec)", () => {
    it("throws actionable RATE_LIMITED error when slot reservation is denied", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({
        granted: false,
        retryAfterMs: 750,
      });
      const transport = vi.fn();

      const deps: GeocodeDeps = {
        reserveGlobalSlot,
        transport,
      };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have thrown RATE_LIMITED GeocodeError");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        const geoErr = err as GeocodeError;
        expect(geoErr.code).toBe("RATE_LIMITED");
        expect(geoErr.retryAfterMs).toBe(750);
        expect(geoErr.message).toContain("maximum 1 request per second");
      }

      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("6. Stalled Body, Timeouts, Capping, and Safe Errors", () => {
    it("handles HTTP 429 Too Many Requests with Retry-After header", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": "3" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have thrown RATE_LIMITED GeocodeError");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        const geoErr = err as GeocodeError;
        expect(geoErr.code).toBe("RATE_LIMITED");
        expect(geoErr.retryAfterMs).toBe(3000);
      }
    });

    it("handles HTTP 503 Provider Unavailable", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response("Service Unavailable", { status: 503 })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have thrown PROVIDER_UNAVAILABLE");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_UNAVAILABLE");
      }
    });

    it("handles request timeout during initial connection", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            setTimeout(() => reject(err), 150);
          })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore(
          { query: "Tenen Restaurant" },
          { ...VALID_CONFIG, timeoutMs: 100 },
          deps
        );
        expect.unreachable("Should have thrown PROVIDER_TIMEOUT");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_TIMEOUT");
      }
    });

    it("enforces finite timeout through stalled response body stream", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });

      // Create a stalled ReadableStream that never resolves chunks
      const stalledStream = new ReadableStream({
        start() {
          // Never enqueue or close
        },
      });

      const transport = vi.fn().mockResolvedValue(
        new Response(stalledStream, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore(
          { query: "Tenen Restaurant" },
          { ...VALID_CONFIG, timeoutMs: 120 },
          deps
        );
        expect.unreachable("Should have timed out on stalled stream body");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_TIMEOUT");
      }
    });

    it("rejects oversized response exceeding maximum bytes limit", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      // Create a 300KB string (exceeds 256KB default limit)
      const oversizedPayload = "x".repeat(300 * 1024);

      const transport = vi.fn().mockResolvedValue(
        new Response(oversizedPayload, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have rejected oversized body");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("INVALID_RESPONSE");
        expect((err as GeocodeError).message).toContain("exceeded maximum size limit");
      }
    });

    it("uses safe generic errors without leaking sensitive query URLs", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const sensitiveAddress = "7600 Halifax St Burnaby Private";

      const transport = vi.fn().mockRejectedValue(
        new TypeError(`fetch failed to https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(sensitiveAddress)}`)
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: sensitiveAddress }, VALID_CONFIG, deps);
        expect.unreachable("Should have failed");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        const geoErr = err as GeocodeError;
        expect(geoErr.code).toBe("PROVIDER_UNAVAILABLE");
        // Must NOT contain sensitive query address or target URL!
        expect(geoErr.message).not.toContain("Halifax");
        expect(geoErr.message).not.toContain("nominatim");
        expect(geoErr.message).toBe("Network error communicating with geocoding provider");
      }
    });

    it("handles non-JSON or malformed body responses", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response("<html><body>Error</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have thrown INVALID_RESPONSE");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("INVALID_RESPONSE");
      }
    });

    it("handles non-settling injected transport via explicit deadline Promise.race", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      // Transport that ignores abort signal and never settles
      const transport = vi.fn().mockImplementation(() => new Promise(() => {}));

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore(
          { query: "Tenen Restaurant" },
          { ...VALID_CONFIG, timeoutMs: 120 },
          deps
        );
        expect.unreachable("Should have timed out via deadline Promise.race");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_TIMEOUT");
        expect((err as GeocodeError).message).toContain("timed out after 120ms");
      }
    });

    it("handles slow or stalled reader.cancel() on oversized response without blocking", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });

      // Create a stream with a cancel method that never settles
      const oversizedChunk = new Uint8Array(300 * 1024);
      let chunkServed = false;
      const streamWithStalledCancel = new ReadableStream({
        pull(controller) {
          if (!chunkServed) {
            chunkServed = true;
            controller.enqueue(oversizedChunk);
          }
        },
        cancel() {
          // Never settles (would hang if awaited)
          return new Promise(() => {});
        },
      });

      const transport = vi.fn().mockResolvedValue(
        new Response(streamWithStalledCancel, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have thrown INVALID_RESPONSE without hanging on cancel");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("INVALID_RESPONSE");
        expect((err as GeocodeError).message).toContain("exceeded maximum size limit");
      }
    });

    it("handles reader.cancel() that returns a rejected Promise without unhandled rejection", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });

      const oversizedChunk = new Uint8Array(300 * 1024);
      let chunkServed = false;
      const streamWithRejectingCancel = new ReadableStream({
        pull(controller) {
          if (!chunkServed) {
            chunkServed = true;
            controller.enqueue(oversizedChunk);
          }
        },
        cancel() {
          return Promise.reject(new Error("Underlying stream cancel failed"));
        },
      });

      const transport = vi.fn().mockResolvedValue(
        new Response(streamWithRejectingCancel, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore({ query: "Tenen Restaurant" }, VALID_CONFIG, deps);
        expect.unreachable("Should have caught INVALID_RESPONSE");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("INVALID_RESPONSE");
      }
    });

    it("handles fallback response.text() that never settles via deadline Promise.race", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });

      const mockResponse = {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        // Body is not a readable stream, text never settles
        body: null,
        text: () => new Promise<string>(() => {}),
      } as unknown as Response;

      const transport = vi.fn().mockResolvedValue(mockResponse);
      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore(
          { query: "Tenen Restaurant" },
          { ...VALID_CONFIG, timeoutMs: 120 },
          deps
        );
        expect.unreachable("Should have timed out on stalled text fallback");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_TIMEOUT");
        expect((err as GeocodeError).message).toContain("timed out after 120ms");
      }
    });
  });

  describe("7. Provider Output Parsing, Numeric Coords, and Label Sanitization", () => {
    it("strictly rejects fabricated numeric coordinates from boolean, null, blank, and objects", () => {
      expect(parseNumericCoordinate(null)).toBeNull();
      expect(parseNumericCoordinate(false)).toBeNull();
      expect(parseNumericCoordinate(true)).toBeNull();
      expect(parseNumericCoordinate("")).toBeNull();
      expect(parseNumericCoordinate("   ")).toBeNull();
      expect(parseNumericCoordinate([])).toBeNull();
      expect(parseNumericCoordinate({})).toBeNull();
      expect(parseNumericCoordinate("NaN")).toBeNull();
      expect(parseNumericCoordinate("Infinity")).toBeNull();
      expect(parseNumericCoordinate("49.25px")).toBeNull();

      expect(parseNumericCoordinate("49.2521")).toBe(49.2521);
      expect(parseNumericCoordinate("-123.0212")).toBe(-123.0212);
      expect(parseNumericCoordinate(49.2521)).toBe(49.2521);
      expect(parseNumericCoordinate(0)).toBe(0);
      expect(parseNumericCoordinate("0")).toBe(0);
    });

    it("sanitizes labels by stripping control characters and null bytes", () => {
      expect(sanitizeLabel("Argo\x00Greek\tRestaurant")).toBe("Argo Greek Restaurant");
      expect(sanitizeLabel("Acqua\x1FBar\n")).toBe("Acqua Bar");
      expect(sanitizeLabel("   ")).toBeNull();
      expect(sanitizeLabel(null)).toBeNull();
      expect(sanitizeLabel(123)).toBeNull();
    });

    it("caps long labels to maximum length", () => {
      const longLabel = "A".repeat(400);
      const sanitized = sanitizeLabel(longLabel, 300);
      expect(sanitized).toHaveLength(300);
    });

    it("filters out results returned by provider that fall outside search envelope", () => {
      const rawProviderData = [
        MOCK_BURNABY_NOMINATIM_ROW,
        MOCK_OUT_OF_BOUNDS_ROW, // Toronto, ON -> must be discarded
        MOCK_VANCOUVER_ROW,
      ];

      const results = parseAndValidateProviderResponse(rawProviderData, METRO_VANCOUVER_BBOX, 5);

      expect(results).toHaveLength(2);
      expect(results[0].label).toContain("Argo Greek");
      expect(results[1].label).toContain("Robson Street");
      expect(results.some((r) => r.label.includes("Toronto"))).toBe(false);
    });

    it("caps results to maxResults (1..5)", () => {
      const rawRows = Array.from({ length: 10 }, (_, i) => ({
        place_id: 1000 + i,
        lat: String(49.25 + i * 0.001),
        lon: String(-123.0 + i * 0.001),
        display_name: `Location ${i}, Burnaby, BC`,
      }));

      const results = parseAndValidateProviderResponse(rawRows, METRO_VANCOUVER_BBOX, 3);
      expect(results).toHaveLength(3);
    });

    it("returns empty array when provider finds no matches (never synthesizes fake pins)", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockResolvedValue(
        new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };
      const results = await geocodeCore({ query: "NonexistentPlaceXYZ123" }, VALID_CONFIG, deps);

      expect(results).toEqual([]);
    });

    it("discards entries with missing or non-numeric coordinates without fabricating 0s", () => {
      const corruptRows = [
        { place_id: 1, lat: null, lon: false, display_name: "Corrupt Boolean" },
        { place_id: 2, lat: "", lon: "   ", display_name: "Corrupt Blank" },
        { place_id: 3, lat: "49.25", lon: "-123.0", display_name: "" }, // empty label
        MOCK_BURNABY_NOMINATIM_ROW,
      ];

      const results = parseAndValidateProviderResponse(corruptRows, METRO_VANCOUVER_BBOX, 5);
      expect(results).toHaveLength(1);
      expect(results[0].label).toContain("Argo Greek");
    });
  });

  describe("8. Attribution & Cache Key Scope", () => {
    it("exports OpenStreetMap attribution object", () => {
      expect(OSM_ATTRIBUTION.notice).toContain("Data © OpenStreetMap contributors");
      expect(OSM_ATTRIBUTION.licenseUrl).toBe("https://opendatacommons.org/licenses/odbl/1.0/");
    });

    it("generates cache keys distinguishing full endpoint, bounds, and maxResults", () => {
      const baseKey = getGeocodeCacheKey(
        "tenen restaurant",
        "https://nominatim.openstreetmap.org/search",
        METRO_VANCOUVER_BBOX,
        5
      );

      // Same query but different endpoint path
      const pathKey = getGeocodeCacheKey(
        "tenen restaurant",
        "https://nominatim.openstreetmap.org/api/v2/search",
        METRO_VANCOUVER_BBOX,
        5
      );
      expect(pathKey).not.toBe(baseKey);

      // Same query but different port
      const portKey = getGeocodeCacheKey(
        "tenen restaurant",
        "http://localhost:8080/search",
        METRO_VANCOUVER_BBOX,
        5
      );
      expect(portKey).not.toBe(baseKey);

      // Same query but different bounding box
      const otherBbox: BoundingBox = { minLng: -123.0, minLat: 49.1, maxLng: -122.8, maxLat: 49.3 };
      const bboxKey = getGeocodeCacheKey(
        "tenen restaurant",
        "https://nominatim.openstreetmap.org/search",
        otherBbox,
        5
      );
      expect(bboxKey).not.toBe(baseKey);

      // Same query but different maxResults
      const limitKey = getGeocodeCacheKey(
        "tenen restaurant",
        "https://nominatim.openstreetmap.org/search",
        METRO_VANCOUVER_BBOX,
        1
      );
      expect(limitKey).not.toBe(baseKey);
    });

    it("normalizes query casing and whitespace in cache keys while preserving defaults", () => {
      const norm1 = validateAndNormalizeQuery("Tenen   Restaurant");
      const norm2 = validateAndNormalizeQuery("  tenen restaurant  ");
      expect(getGeocodeCacheKey(norm1)).toBe(getGeocodeCacheKey(norm2));
    });
  });
});
