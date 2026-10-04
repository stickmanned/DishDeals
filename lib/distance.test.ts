import { describe, expect, it } from "vitest";
import { distanceKm, EARTH_RADIUS_KM, LatLng } from "./distance";

describe("distanceKm", () => {
  const HALF_CIRCUMFERENCE_KM = Math.PI * EARTH_RADIUS_KM; // ~20015.11444 km
  const ONE_DEG_KM = (Math.PI / 180) * EARTH_RADIUS_KM; // ~111.19493 km

  describe("identity", () => {
    it("returns 0 for the exact same object reference", () => {
      const p: LatLng = { lat: 49.2827, lng: -123.1207 };
      expect(distanceKm(p, p)).toBe(0);
    });

    it("returns 0 for identical coordinates in distinct objects", () => {
      const a: LatLng = { lat: 49.2827, lng: -123.1207 };
      const b: LatLng = { lat: 49.2827, lng: -123.1207 };
      expect(distanceKm(a, b)).toBe(0);
    });

    it("returns 0 for (0, 0)", () => {
      expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    });

    it("returns 0 at the North and South Poles", () => {
      expect(distanceKm({ lat: 90, lng: 0 }, { lat: 90, lng: 0 })).toBe(0);
      expect(distanceKm({ lat: -90, lng: 0 }, { lat: -90, lng: 0 })).toBe(0);
    });

    it("returns 0 for identical physical points at the antimeridian (+180 vs -180)", () => {
      expect(distanceKm({ lat: 0, lng: 180 }, { lat: 0, lng: -180 })).toBe(0);
      expect(distanceKm({ lat: 45, lng: 180 }, { lat: 45, lng: -180 })).toBe(0);
      expect(distanceKm({ lat: -45, lng: -180 }, { lat: -45, lng: 180 })).toBe(0);
    });
  });

  describe("symmetry", () => {
    const pairs: [LatLng, LatLng][] = [
      [
        { lat: 49.2827, lng: -123.1207 }, // Vancouver
        { lat: 49.2781, lng: -122.9199 }, // SFU Burnaby
      ],
      [
        { lat: 51.5074, lng: -0.1278 }, // London
        { lat: 48.8566, lng: 2.3522 }, // Paris
      ],
      [
        { lat: 35.6762, lng: 139.6503 }, // Tokyo
        { lat: -33.8688, lng: 151.2093 }, // Sydney
      ],
      [
        { lat: -22.9068, lng: -43.1729 }, // Rio de Janeiro
        { lat: 37.7749, lng: -122.4194 }, // San Francisco
      ],
      [
        { lat: 0, lng: 179 },
        { lat: 0, lng: -179 },
      ],
    ];

    it.each(pairs)("guarantees distanceKm(a, b) === distanceKm(b, a)", (a, b) => {
      const d1 = distanceKm(a, b);
      const d2 = distanceKm(b, a);
      expect(d1).toBe(d2);
    });
  });

  describe("synthetic known distances", () => {
    it("computes quarter-meridian from Equator to North Pole as pi/2 * R", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: 90, lng: 0 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM / 2, 6);
    });

    it("computes quarter-meridian from Equator to South Pole as pi/2 * R", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: -90, lng: 0 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM / 2, 6);
    });

    it("computes 1 degree of latitude along a meridian", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
      expect(d).toBeCloseTo(ONE_DEG_KM, 6);
    });

    it("computes 1 degree of longitude along the equator", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
      expect(d).toBeCloseTo(ONE_DEG_KM, 6);
    });

    it("matches analytical distance for 60 degrees longitude at latitude 60 degrees", () => {
      // At lat=60 deg, cos(60)=0.5. For dLng=60 deg, sin(dLng/2)=sin(30)=0.5.
      // h = 0.5 * 0.5 * 0.5 * 0.5 = 0.0625.
      // c = 2 * asin(sqrt(0.0625)) = 2 * asin(0.25).
      const expectedAngle = 2 * Math.asin(0.25);
      const expectedKm = EARTH_RADIUS_KM * expectedAngle;
      const d = distanceKm({ lat: 60, lng: 0 }, { lat: 60, lng: 60 });
      expect(d).toBeCloseTo(expectedKm, 6);
    });

    it("computes expected synthetic distance between Downtown Vancouver and SFU Burnaby (~14.57 km)", () => {
      const vancouver: LatLng = { lat: 49.2827, lng: -123.1207 };
      const sfuBurnaby: LatLng = { lat: 49.2781, lng: -122.9199 };
      const d = distanceKm(vancouver, sfuBurnaby);
      expect(d).toBeGreaterThan(14.5);
      expect(d).toBeLessThan(14.65);
      expect(d).toBeCloseTo(14.5748, 2);
    });

    it("computes expected synthetic distance between Tokyo and Sydney (~7826 km)", () => {
      const tokyo: LatLng = { lat: 35.6762, lng: 139.6503 };
      const sydney: LatLng = { lat: -33.8688, lng: 151.2093 };
      const d = distanceKm(tokyo, sydney);
      expect(d).toBeGreaterThan(7800);
      expect(d).toBeLessThan(7850);
      expect(d).toBeCloseTo(7825.83, 1);
    });
  });

  describe("antipodal and near-antipodal points", () => {
    it("computes exact half-circumference for equatorial antipodes (0, 0) and (0, 180)", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 6);
    });

    it("computes exact half-circumference for equatorial antipodes (0, 0) and (0, -180)", () => {
      const d = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: -180 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 6);
    });

    it("computes exact half-circumference for polar antipodes (90, 0) and (-90, 0)", () => {
      const d = distanceKm({ lat: 90, lng: 0 }, { lat: -90, lng: 0 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 6);
    });

    it("computes exact half-circumference for arbitrary antipodes (45, 30) and (-45, -150)", () => {
      const d = distanceKm({ lat: 45, lng: 30 }, { lat: -45, lng: -150 });
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 6);
    });

    it("clamps intermediate to guard against NaN at antipodes", () => {
      // Vancouver antipode: (-49.2827, 56.8793)
      const vancouver: LatLng = { lat: 49.2827, lng: -123.1207 };
      const antipode: LatLng = { lat: -49.2827, lng: 56.8793 };
      const d = distanceKm(vancouver, antipode);
      expect(Number.isNaN(d)).toBe(false);
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 6);
    });

    it("handles near-antipodal points gracefully without overflow or NaN", () => {
      const a: LatLng = { lat: 0, lng: 0 };
      const b: LatLng = { lat: 0.00001, lng: 179.99999 };
      const d = distanceKm(a, b);
      expect(Number.isNaN(d)).toBe(false);
      expect(d).toBeLessThanOrEqual(HALF_CIRCUMFERENCE_KM);
      expect(d).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 1);
    });
  });

  describe("antimeridian crossing", () => {
    it("calculates shortest path across 180th meridian (e.g. 179 to -179 is 2 degrees)", () => {
      const cross = distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
      const baseline = distanceKm({ lat: 0, lng: -1 }, { lat: 0, lng: 1 });
      expect(cross).toBeCloseTo(baseline, 6);
      expect(cross).toBeCloseTo(2 * ONE_DEG_KM, 4);
    });

    it("calculates shortest path across antimeridian at higher latitudes", () => {
      const cross = distanceKm({ lat: 60, lng: 179.5 }, { lat: 60, lng: -179.5 });
      const baseline = distanceKm({ lat: 60, lng: -0.5 }, { lat: 60, lng: 0.5 });
      expect(cross).toBeCloseTo(baseline, 6);
    });

    it("maintains symmetry when crossing the antimeridian", () => {
      const a: LatLng = { lat: 10, lng: 175 };
      const b: LatLng = { lat: -10, lng: -175 };
      expect(distanceKm(a, b)).toBe(distanceKm(b, a));
    });
  });

  describe("invalid input handling (RangeError)", () => {
    it("rejects latitude greater than 90", () => {
      expect(() => distanceKm({ lat: 90.001, lng: 0 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 120, lng: 0 })).toThrow(RangeError);
    });

    it("rejects latitude less than -90", () => {
      expect(() => distanceKm({ lat: -90.001, lng: 0 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: -91, lng: 0 })).toThrow(RangeError);
    });

    it("rejects longitude greater than 180", () => {
      expect(() => distanceKm({ lat: 0, lng: 180.001 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 200 })).toThrow(RangeError);
    });

    it("rejects longitude less than -180", () => {
      expect(() => distanceKm({ lat: 0, lng: -180.001 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: -181 })).toThrow(RangeError);
    });

    it("rejects non-finite coordinates (NaN, Infinity, -Infinity)", () => {
      expect(() => distanceKm({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: NaN }, { lat: 0, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: Infinity, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: -Infinity, lng: 0 })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: Infinity })).toThrow(RangeError);
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: -Infinity })).toThrow(RangeError);
    });

    it("rejects null or non-object inputs", () => {
      // @ts-expect-error Testing invalid runtime input
      expect(() => distanceKm(null, { lat: 0, lng: 0 })).toThrow(RangeError);
      // @ts-expect-error Testing invalid runtime input
      expect(() => distanceKm({ lat: 0, lng: 0 }, undefined)).toThrow(RangeError);
      // @ts-expect-error Testing invalid runtime input
      expect(() => distanceKm({}, { lat: 0, lng: 0 })).toThrow(RangeError);
    });

    it("rejects non-number coordinates (e.g. strings)", () => {
      // @ts-expect-error Testing invalid runtime input
      expect(() => distanceKm({ lat: "49.28", lng: -123.12 }, { lat: 0, lng: 0 })).toThrow(RangeError);
      // @ts-expect-error Testing invalid runtime input
      expect(() => distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: "abc" })).toThrow(RangeError);
    });

    it("accepts exact boundary values without throwing", () => {
      expect(() =>
        distanceKm({ lat: 90, lng: 180 }, { lat: -90, lng: -180 })
      ).not.toThrow();
      expect(() =>
        distanceKm({ lat: -90, lng: 180 }, { lat: 90, lng: -180 })
      ).not.toThrow();
    });
  });
});
