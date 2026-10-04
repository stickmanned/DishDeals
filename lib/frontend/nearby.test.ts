import { describe, expect, it } from "vitest";
import type { DealView } from "./deals";
import { demoDeals, previewSeedPosts } from "./demoDeals";
import {
  DEFAULT_ORIGIN,
  distanceKm,
  formatDistance,
  hasCoordinates,
  nearbyDeals,
} from "./nearby";

const noon = new Date("2026-10-03T19:00:00Z"); // Noon in Vancouver.
const base: DealView = {
  id: "a",
  restaurant: "Test",
  dealText: "Lunch",
  description: "Soup",
  validDays: [],
  validStart: "11:00",
  validEnd: "14:00",
  conditions: [],
  createdAt: 1,
  isDemo: false,
};
const deal = (changes: Partial<DealView>): DealView => ({ ...base, ...changes });
const metrotown = DEFAULT_ORIGIN;

describe("distanceKm", () => {
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 49.2276, lng: -122.9996 };
    const b = { lat: 49.2827, lng: -123.1207 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
  it("matches a known Burnaby to downtown Vancouver distance", () => {
    // Metrotown to Vancouver City Hall is roughly 9.5 km in a straight line.
    const km = distanceKm(metrotown, { lat: 49.2606, lng: -123.1139 });
    expect(km).toBeGreaterThan(9);
    expect(km).toBeLessThan(10.5);
  });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre and one decimal under ten", () => {
    expect(formatDistance(0.02)).toBe("50 m");
    expect(formatDistance(0.43)).toBe("450 m");
    expect(formatDistance(1.26)).toBe("1.3 km");
    expect(formatDistance(12.4)).toBe("12 km");
  });
});

describe("nearbyDeals", () => {
  const near = deal({ id: "near", lat: 49.2277, lng: -122.9997 });
  const far = deal({ id: "far", lat: 49.2801, lng: -122.9155 });
  const unplaced = deal({ id: "unplaced" });
  const endedToday = deal({ id: "ended", lat: 49.2277, lng: -122.9997, validStart: "06:00", validEnd: "09:00" });

  it("orders by distance and keeps deals without coordinates visible", () => {
    const ids = nearbyDeals([unplaced, far, near], metrotown, null, noon).map((r) => r.deal.id);
    expect(ids).toEqual(["near", "far", "unplaced"]);
  });
  it("drops only known deals beyond the radius", () => {
    const rows = nearbyDeals([far, near, unplaced], metrotown, 2, noon);
    expect(rows.map((r) => r.deal.id)).toEqual(["near", "unplaced"]);
    expect(rows[0].distanceKm).toBeLessThan(0.1);
    expect(rows[1].distanceKm).toBeUndefined();
  });
  it("puts usable deals ahead of closer ones that already ended", () => {
    const ids = nearbyDeals([endedToday, far], metrotown, null, noon).map((r) => r.deal.id);
    expect(ids).toEqual(["far", "ended"]);
  });
  it("treats non-finite coordinates as missing", () => {
    expect(hasCoordinates(deal({ lat: Number.NaN, lng: 1 }))).toBe(false);
    expect(hasCoordinates(deal({ lat: 91, lng: 1 }))).toBe(false);
  });
});

describe("Burnaby placeholder deals", () => {
  it("all sit in Burnaby with real coordinates and stay marked as examples", () => {
    for (const row of demoDeals) {
      expect(row.isDemo).toBe(true);
      expect(hasCoordinates(row)).toBe(true);
      expect(row.address).toContain("Burnaby");
      expect(row.description).toContain("not a real promotion");
      // Burnaby's bounding box, with a little slack.
      expect(row.lat!).toBeGreaterThan(49.17);
      expect(row.lat!).toBeLessThan(49.31);
      expect(row.lng!).toBeGreaterThan(-123.03);
      expect(row.lng!).toBeLessThan(-122.89);
    }
  });
  it("spread across the default radius options so filtering is visible", () => {
    const km = nearbyDeals(demoDeals, metrotown, null, noon).map((r) => r.distanceKm!);
    expect(km.filter((d) => d <= 2).length).toBeGreaterThan(0);
    expect(km.filter((d) => d > 5 && d <= 10).length).toBeGreaterThan(0);
  });
});

describe("preview seed posts", () => {
  it("recasts existing placeholders as the visitor's own posts with distinct ids", () => {
    const posts = previewSeedPosts("Alex");
    expect(posts.length).toBeGreaterThanOrEqual(3);
    for (const post of posts) {
      expect(post.id.startsWith("mine-")).toBe(true);
      expect(post.authorName).toBe("Alex");
      expect(post.isDemo).toBe(true);
      expect(demoDeals.some((d) => d.restaurant === post.restaurant)).toBe(true);
    }
    expect(new Set(posts.map((p) => p.id)).size).toBe(posts.length);
  });
});
