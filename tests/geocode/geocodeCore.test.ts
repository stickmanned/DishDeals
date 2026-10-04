import { describe, expect, it, vi } from "vitest";
import {
  geocodeCore,
  GeocodeError,
  METRO_VANCOUVER_BBOX,
  OSM_ATTRIBUTION,
  validateAndNormalizeQuery,
  validateConfig,
  buildNominatimUrl,
  isInsideBoundingBox,
  parseAndValidateProviderResponse,
  getGeocodeCacheKey,
  type GeocodePolicyConfig,
  type GeocodeDeps,
  type GeocodeResult,
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

  describe("2. Configuration Validation", () => {
    it("requires identifying User-Agent with contact info per Nominatim policy", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "" })).toThrowError(/User-Agent is required/);
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "curl/7.68.0" })).toThrowError(/contact email or domain/);
      expect(() => validateConfig({ ...VALID_CONFIG, userAgent: "Mozilla/5.0" })).toThrowError(/contact email or domain/);
      expect(() => validateConfig(VALID_CONFIG)).not.toThrow();
    });

    it("enforces HTTPS protocol on public endpoints", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://nominatim.openstreetmap.org/search" })).toThrowError(
        /Endpoint must use HTTPS/
      );
      // Localhost allowed for test mocks
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://localhost:8080/search" })).not.toThrow();
      expect(() => validateConfig({ ...VALID_CONFIG, endpoint: "http://127.0.0.1:8080/search" })).not.toThrow();
    });

    it("validates timeoutMs and maxResults", () => {
      expect(() => validateConfig({ ...VALID_CONFIG, timeoutMs: -10 })).toThrowError(/positive finite number/);
      expect(() => validateConfig({ ...VALID_CONFIG, maxResults: 0 })).toThrowError(/between 1 and 5/);
      expect(() => validateConfig({ ...VALID_CONFIG, maxResults: 6 })).toThrowError(/between 1 and 5/);
    });
  });

  describe("3. Bounding Box & Metro Vancouver Constraints", () => {
    it("accepts points strictly inside Metro Vancouver envelope", () => {
      // Burnaby City Hall: 49.252, -122.955
      expect(isInsideBoundingBox({ lat: 49.252, lng: -122.955 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // Downtown Vancouver: 49.282, -123.120
      expect(isInsideBoundingBox({ lat: 49.282, lng: -123.120 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // SFU Burnaby Mountain: 49.278, -122.919
      expect(isInsideBoundingBox({ lat: 49.278, lng: -122.919 }, METRO_VANCOUVER_BBOX)).toBe(true);
      // Richmond: 49.166, -123.133
      expect(isInsideBoundingBox({ lat: 49.166, lng: -123.133 }, METRO_VANCOUVER_BBOX)).toBe(true);
    });

    it("rejects points outside Metro Vancouver envelope", () => {
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
      // Crucial: Global slot and HTTP transport must NOT be called on cache hit!
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

      // Verifies no provider HTTP call was made when slot was denied!
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("6. Provider HTTP Error and Timeout Handling", () => {
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

    it("handles request timeout cleanly", async () => {
      const reserveGlobalSlot = vi.fn().mockResolvedValue({ granted: true });
      const transport = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            setTimeout(() => reject(err), 50);
          })
      );

      const deps: GeocodeDeps = { reserveGlobalSlot, transport };

      try {
        await geocodeCore(
          { query: "Tenen Restaurant" },
          { ...VALID_CONFIG, timeoutMs: 20 },
          deps
        );
        expect.unreachable("Should have thrown PROVIDER_TIMEOUT");
      } catch (err) {
        expect(err).toBeInstanceOf(GeocodeError);
        expect((err as GeocodeError).code).toBe("PROVIDER_TIMEOUT");
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
  });

  describe("7. Provider Output Parsing & Geographic Envelope Filtering", () => {
    it("filters out results returned by provider that fall outside Metro Vancouver", () => {
      const rawProviderData = [
        MOCK_BURNABY_NOMINATIM_ROW,
        MOCK_OUT_OF_BOUNDS_ROW, // Toronto, ON -> must be discarded
        MOCK_VANCOUVER_ROW,
      ];

      const results = parseAndValidateProviderResponse(rawProviderData, METRO_VANCOUVER_BBOX, 5);

      expect(results).toHaveLength(2);
      expect(results[0].label).toContain("Argo Greek");
      expect(results[1].label).toContain("Robson Street");
      // The Toronto result must not be present
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

    it("discards entries with missing or non-numeric coordinates", () => {
      const corruptRows = [
        { place_id: 1, lat: "not-a-number", lon: "-123.0", display_name: "Corrupt Lat" },
        { place_id: 2, lat: "49.25", lon: "NaN", display_name: "Corrupt Lon" },
        { place_id: 3, lat: "49.25", lon: "-123.0", display_name: "" }, // empty label
        MOCK_BURNABY_NOMINATIM_ROW,
      ];

      const results = parseAndValidateProviderResponse(corruptRows, METRO_VANCOUVER_BBOX, 5);
      expect(results).toHaveLength(1);
      expect(results[0].label).toContain("Argo Greek");
    });
  });

  describe("8. Attribution & Cache Key Stability", () => {
    it("exports OpenStreetMap attribution object", () => {
      expect(OSM_ATTRIBUTION.notice).toContain("Data © OpenStreetMap contributors");
      expect(OSM_ATTRIBUTION.licenseUrl).toBe("https://opendatacommons.org/licenses/odbl/1.0/");
    });

    it("generates stable cache keys regardless of casing and repeated whitespace", () => {
      const key1 = getGeocodeCacheKey("tenen restaurant", "https://nominatim.openstreetmap.org/search");
      const key2 = getGeocodeCacheKey("Tenen   Restaurant", "https://nominatim.openstreetmap.org/search");
      expect(key1).toBe("geocode:v1:nominatim.openstreetmap.org:tenen restaurant");
      expect(key2).toBe("geocode:v1:nominatim.openstreetmap.org:tenen   restaurant");
      // When normalized through validateAndNormalizeQuery first:
      const norm1 = validateAndNormalizeQuery("Tenen   Restaurant");
      const norm2 = validateAndNormalizeQuery("  tenen restaurant  ");
      expect(getGeocodeCacheKey(norm1, "https://nominatim.openstreetmap.org/search")).toBe(
        getGeocodeCacheKey(norm2, "https://nominatim.openstreetmap.org/search")
      );
    });
  });
});
