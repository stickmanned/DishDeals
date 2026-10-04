import { describe, expect, it } from "vitest";
import {
  formatValidityLabel,
  isDemoDealId,
  isValidDealId,
  safeSourceUrl,
  selectDeals,
  type CanonicalDeal,
} from "../../lib/mapPage";

describe("Deal ID validation", () => {
  it("identifies demo deal IDs correctly", () => {
    expect(isDemoDealId("demo-1")).toBe(true);
    expect(isDemoDealId("demo-happy-hour")).toBe(true);
    expect(isDemoDealId("deal_123")).toBe(false);
    expect(isDemoDealId("")).toBe(false);
    expect(isDemoDealId(null)).toBe(false);
    expect(isDemoDealId(undefined)).toBe(false);
  });

  it("validates database deal IDs and rejects invalid or malicious strings", () => {
    expect(isValidDealId("deal_123")).toBe(true);
    expect(isValidDealId("k572y3b7w7v8n2m9")).toBe(true);
    expect(isValidDealId("d1")).toBe(true);
    expect(isValidDealId("deal-abc_123")).toBe(true);

    // Rejects demo IDs
    expect(isValidDealId("demo-1")).toBe(false);
    expect(isValidDealId("demo-tacos")).toBe(false);

    // Rejects empty or whitespace
    expect(isValidDealId("")).toBe(false);
    expect(isValidDealId("   ")).toBe(false);
    expect(isValidDealId("deal 123")).toBe(false);

    // Rejects path traversal and suspicious characters
    expect(isValidDealId("../secret")).toBe(false);
    expect(isValidDealId("../../etc/passwd")).toBe(false);
    expect(isValidDealId("<script>")).toBe(false);
    expect(isValidDealId("deal/sub")).toBe(false);

    // Rejects non-string types
    expect(isValidDealId(null)).toBe(false);
    expect(isValidDealId(undefined)).toBe(false);
    expect(isValidDealId(123)).toBe(false);
    expect(isValidDealId({})).toBe(false);
  });
});

describe("safeSourceUrl helper", () => {
  it("accepts valid https and http URLs", () => {
    expect(safeSourceUrl("https://www.instagram.com/p/C12345/")).toBe(
      "https://www.instagram.com/p/C12345/"
    );
    expect(safeSourceUrl("http://restaurant.example.com/specials")).toBe(
      "http://restaurant.example.com/specials"
    );
  });

  it("rejects invalid, unsafe, or credential-bearing URLs", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("data:text/html,test")).toBeNull();
    expect(safeSourceUrl("https://user:pass@example.com/deal")).toBeNull();
    expect(safeSourceUrl("not-a-url")).toBeNull();
    expect(safeSourceUrl("")).toBeNull();
    expect(safeSourceUrl(null)).toBeNull();
    expect(safeSourceUrl(undefined)).toBeNull();
  });
});

describe("formatValidityLabel helper", () => {
  it("formats valid now with remaining minutes", () => {
    expect(formatValidityLabel({ status: "valid", minutesLeft: 45 })).toEqual({
      label: "Valid now · 45m left",
      isValid: true,
    });
    expect(formatValidityLabel({ status: "valid", minutesLeft: 90 })).toEqual({
      label: "Valid now · 1h 30m left",
      isValid: true,
    });
    expect(formatValidityLabel({ status: "valid" })).toEqual({
      label: "Valid now",
      isValid: true,
    });
  });

  it("formats non-valid statuses", () => {
    expect(formatValidityLabel({ status: "later_today" })).toEqual({
      label: "Later today",
      isValid: false,
    });
    expect(formatValidityLabel({ status: "not_today" })).toEqual({
      label: "Not today",
      isValid: false,
    });
    expect(formatValidityLabel({ status: "expired" })).toEqual({
      label: "Expired",
      isValid: false,
    });
    expect(formatValidityLabel({ status: "unknown" })).toEqual({
      label: "Hours unlisted",
      isValid: false,
    });
  });
});

describe("selectDeals filtering and sorting", () => {
  // Tuesday, October 6, 2026 at 12:30 PM PDT (UTC-7) -> 19:30 UTC
  const testNow = new Date("2026-10-06T19:30:00Z");

  const dealUnder5: CanonicalDeal = {
    _id: "deal_under_5",
    _creationTime: 1000,
    restaurant: "Taco Truck",
    dealText: "$4.50 Fish Taco",
    priceCad: 4.5,
    lat: 49.2827,
    lng: -123.1207,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "14:00",
    expiresOn: "2026-12-31",
  };

  const dealUnder10: CanonicalDeal = {
    _id: "deal_under_10",
    _creationTime: 2000,
    restaurant: "Ramen Spot",
    dealText: "$9.99 Lunch Bowl",
    priceCad: 9.99,
    lat: 49.281,
    lng: -123.115,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "15:00",
    expiresOn: "2026-12-31",
  };

  const dealUnder15: CanonicalDeal = {
    _id: "deal_under_15",
    _creationTime: 3000,
    restaurant: "Burger House",
    dealText: "$14 Combo",
    priceCad: 14.0,
    lat: 49.275,
    lng: -123.13,
    validDays: ["tue"],
    validStart: "12:00",
    validEnd: "16:00",
    expiresOn: "2026-12-31",
  };

  const dealExpensive: CanonicalDeal = {
    _id: "deal_expensive",
    _creationTime: 4000,
    restaurant: "Steakhouse",
    dealText: "$35 Steak Special",
    priceCad: 35.0,
    lat: 49.28,
    lng: -123.11,
    validDays: ["tue"],
    validStart: "17:00",
    validEnd: "22:00",
    expiresOn: "2026-12-31",
  };

  const dealUnknownPrice: CanonicalDeal = {
    _id: "deal_unknown_price",
    _creationTime: 5000,
    restaurant: "Sushi Bar",
    dealText: "Chef Special Roll - Price varies",
    priceCad: undefined,
    lat: 49.285,
    lng: -123.125,
    validDays: ["tue"],
    validStart: "11:30",
    validEnd: "14:30",
    expiresOn: "2026-12-31",
  };

  const dealExpired: CanonicalDeal = {
    _id: "deal_expired",
    _creationTime: 6000,
    restaurant: "Bakery",
    dealText: "Morning Pastry $3",
    priceCad: 3.0,
    lat: 49.28,
    lng: -123.12,
    validDays: ["tue"],
    validStart: "07:00",
    validEnd: "10:00",
    expiresOn: "2026-10-01", // Past expiry
  };

  const allDeals: CanonicalDeal[] = [
    dealUnder5,
    dealUnder10,
    dealUnder15,
    dealExpensive,
    dealUnknownPrice,
    dealExpired,
  ];

  describe("Price filtering (unknown price included)", () => {
    it("includes unknown price deals and deals <= 5 in under5 filter", () => {
      const selected = selectDeals(allDeals, { price: "under5", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_expired"); // $3.00 is under 5
      expect(ids).toContain("deal_unknown_price"); // unknown price is explicitly included
      expect(ids).not.toContain("deal_under_10");
      expect(ids).not.toContain("deal_under_15");
      expect(ids).not.toContain("deal_expensive");
    });

    it("includes unknown price deals and deals <= 10 in under10 filter", () => {
      const selected = selectDeals(allDeals, { price: "under10", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_expired");
      expect(ids).toContain("deal_unknown_price"); // unknown price included
      expect(ids).not.toContain("deal_under_15");
      expect(ids).not.toContain("deal_expensive");
    });

    it("includes unknown price deals and deals <= 15 in under15 filter", () => {
      const selected = selectDeals(allDeals, { price: "under15", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_under_15");
      expect(ids).toContain("deal_unknown_price"); // unknown price included
      expect(ids).not.toContain("deal_expensive");
    });

    it("includes all deals when price is 'any'", () => {
      const selected = selectDeals(allDeals, { price: "any", time: "all", now: testNow });
      expect(selected.length).toBe(allDeals.length);
    });
  });

  describe("Time filtering", () => {
    it("filters to valid-now deals only", () => {
      const selected = selectDeals(allDeals, { price: "any", time: "valid-now", now: testNow });
      const ids = selected.map((d) => d._id);

      // At 12:30 PM:
      // dealUnder5 (11:00-14:00): VALID
      // dealUnder10 (11:00-15:00): VALID
      // dealUnder15 (12:00-16:00): VALID
      // dealExpensive (17:00-22:00): later_today -> EXCLUDED
      // dealUnknownPrice (11:30-14:30): VALID
      // dealExpired: EXPIRED -> EXCLUDED

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_under_15");
      expect(ids).toContain("deal_unknown_price");
      expect(ids).not.toContain("deal_expensive");
      expect(ids).not.toContain("deal_expired");
    });
  });

  describe("Sorting", () => {
    it("sorts by newest (_creationTime desc)", () => {
      const selected = selectDeals(allDeals, { sort: "newest", time: "all", now: testNow });
      const creationTimes = selected.map((d) => d._creationTime);
      for (let i = 0; i < creationTimes.length - 1; i++) {
        expect(creationTimes[i]!).toBeGreaterThanOrEqual(creationTimes[i + 1]!);
      }
    });

    it("sorts by price (cheapest first, unknown at end)", () => {
      const selected = selectDeals(allDeals, { sort: "price", time: "all", now: testNow });
      const prices = selected.map((d) => d.priceCad);
      // Expected order: 3.0, 4.5, 9.99, 14.0, 35.0, undefined
      expect(prices).toEqual([3.0, 4.5, 9.99, 14.0, 35.0, undefined]);
    });

    it("sorts by distance when userLocation is provided", () => {
      // User is right next to dealUnder5 (49.2827, -123.1207)
      const userLoc = { lat: 49.2827, lng: -123.1207 };
      const selected = selectDeals(allDeals, {
        sort: "distance",
        userLocation: userLoc,
        time: "all",
        now: testNow,
      });

      expect(selected[0]._id).toBe("deal_under_5");
    });

    it("truthfully falls back to newest when userLocation is null or denied (no fake distance)", () => {
      const selectedWithoutLoc = selectDeals(allDeals, {
        sort: "distance",
        userLocation: null,
        time: "all",
        now: testNow,
      });
      const selectedNewest = selectDeals(allDeals, {
        sort: "newest",
        time: "all",
        now: testNow,
      });

      expect(selectedWithoutLoc.map((d) => d._id)).toEqual(
        selectedNewest.map((d) => d._id)
      );
    });

    it("sorts by time with currently valid deals first", () => {
      const selected = selectDeals(allDeals, { sort: "time", time: "all", now: testNow });
      // First 4 items should be the valid ones
      const firstFourIds = selected.slice(0, 4).map((d) => d._id);
      expect(firstFourIds).toContain("deal_under_5");
      expect(firstFourIds).toContain("deal_under_10");
      expect(firstFourIds).toContain("deal_under_15");
      expect(firstFourIds).toContain("deal_unknown_price");

      // Non-valid deals should come after
      const remainingIds = selected.slice(4).map((d) => d._id);
      expect(remainingIds).toContain("deal_expensive"); // later_today
      expect(remainingIds).toContain("deal_expired"); // expired
    });
  });
});
