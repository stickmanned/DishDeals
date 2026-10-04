import { describe, expect, it } from "vitest";
import {
  formatValidityLabel,
  isDemoDealId,
  isValidDealId,
  safeSourceUrl,
  selectDeals,
  viewerLocation,
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

describe("selectDeals filtering and sorting (canonical dealSelection reuse)", () => {
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

  const dealExact5: CanonicalDeal = {
    _id: "deal_exact_5",
    _creationTime: 1500,
    restaurant: "Five Dollar Stand",
    dealText: "$5.00 Snack",
    priceCad: 5.0,
    lat: 49.28,
    lng: -123.12,
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

  const dealExact10: CanonicalDeal = {
    _id: "deal_exact_10",
    _creationTime: 2500,
    restaurant: "Ten Dollar Lunch",
    dealText: "$10.00 Bowl",
    priceCad: 10.0,
    lat: 49.28,
    lng: -123.11,
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

  const dealExact15: CanonicalDeal = {
    _id: "deal_exact_15",
    _creationTime: 3500,
    restaurant: "Fifteen Dollar Platter",
    dealText: "$15.00 Platter",
    priceCad: 15.0,
    lat: 49.27,
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

  const dealNullPrice: CanonicalDeal = {
    _id: "deal_null_price",
    _creationTime: 5500,
    restaurant: "Dim Sum House",
    dealText: "Market price seafood",
    // Synthetic legacy input: canonical saved rows omit this optional field.
    priceCad: null as unknown as number,
    lat: 49.28,
    lng: -123.11,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "14:00",
    expiresOn: "2026-12-31",
  };

  const dealNegativePrice: CanonicalDeal = {
    _id: "deal_negative_price",
    _creationTime: 5600,
    restaurant: "Buggy Entry",
    dealText: "-$5 Deal",
    priceCad: -5.0,
    lat: 49.28,
    lng: -123.11,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "14:00",
    expiresOn: "2026-12-31",
  };

  const dealNaNPrice: CanonicalDeal = {
    _id: "deal_nan_price",
    _creationTime: 5700,
    restaurant: "NaN Entry",
    dealText: "NaN Deal",
    priceCad: NaN,
    lat: 49.28,
    lng: -123.11,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "14:00",
    expiresOn: "2026-12-31",
  };

  const dealInfinityPrice: CanonicalDeal = {
    _id: "deal_inf_price",
    _creationTime: 5800,
    restaurant: "Infinity Entry",
    dealText: "Infinity Deal",
    priceCad: Infinity,
    lat: 49.28,
    lng: -123.11,
    validDays: ["tue"],
    validStart: "11:00",
    validEnd: "14:00",
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
    dealExact5,
    dealUnder10,
    dealExact10,
    dealUnder15,
    dealExact15,
    dealExpensive,
    dealUnknownPrice,
    dealNullPrice,
    dealNegativePrice,
    dealNaNPrice,
    dealInfinityPrice,
    dealExpired,
  ];

  describe("Price filtering strictness and invalid price regressions", () => {
    it("strictly enforces < 5 for under5 (exact 5.0 excluded, unlisted included, invalid excluded)", () => {
      const selected = selectDeals(allDeals, { price: "under5", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5"); // 4.5 < 5 -> included
      expect(ids).toContain("deal_expired"); // 3.0 < 5 -> included
      expect(ids).toContain("deal_unknown_price"); // undefined -> varies -> included
      expect(ids).toContain("deal_null_price"); // null -> varies -> included

      // Strict inequality: exact 5.0 is NOT under 5
      expect(ids).not.toContain("deal_exact_5");
      expect(ids).not.toContain("deal_under_10");
      expect(ids).not.toContain("deal_exact_10");
      expect(ids).not.toContain("deal_under_15");
      expect(ids).not.toContain("deal_exact_15");
      expect(ids).not.toContain("deal_expensive");

      // Invalid, negative, NaN, and Infinity prices must be excluded
      expect(ids).not.toContain("deal_negative_price");
      expect(ids).not.toContain("deal_nan_price");
      expect(ids).not.toContain("deal_inf_price");
    });

    it("strictly enforces < 10 for under10 (exact 10.0 excluded)", () => {
      const selected = selectDeals(allDeals, { price: "under10", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_exact_5"); // 5.0 < 10 -> included
      expect(ids).toContain("deal_under_10"); // 9.99 < 10 -> included
      expect(ids).toContain("deal_unknown_price");
      expect(ids).toContain("deal_null_price");

      // Exact 10.0 is NOT under 10
      expect(ids).not.toContain("deal_exact_10");
      expect(ids).not.toContain("deal_under_15");
      expect(ids).not.toContain("deal_exact_15");
      expect(ids).not.toContain("deal_expensive");
      expect(ids).not.toContain("deal_negative_price");
      expect(ids).not.toContain("deal_nan_price");
    });

    it("strictly enforces < 15 for under15 (exact 15.0 excluded)", () => {
      const selected = selectDeals(allDeals, { price: "under15", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_exact_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_exact_10"); // 10.0 < 15 -> included
      expect(ids).toContain("deal_under_15"); // 14.0 < 15 -> included
      expect(ids).toContain("deal_unknown_price");
      expect(ids).toContain("deal_null_price");

      // Exact 15.0 is NOT under 15
      expect(ids).not.toContain("deal_exact_15");
      expect(ids).not.toContain("deal_expensive");
      expect(ids).not.toContain("deal_negative_price");
      expect(ids).not.toContain("deal_nan_price");
    });

    it("excludes negative, NaN, and non-finite prices even with price='any'", () => {
      const selected = selectDeals(allDeals, { price: "any", time: "all", now: testNow });
      const ids = selected.map((d) => d._id);

      expect(ids).not.toContain("deal_negative_price");
      expect(ids).not.toContain("deal_nan_price");
      expect(ids).not.toContain("deal_inf_price");

      // Valid prices and unlisted prices are present
      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_exact_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_exact_10");
      expect(ids).toContain("deal_under_15");
      expect(ids).toContain("deal_exact_15");
      expect(ids).toContain("deal_expensive");
      expect(ids).toContain("deal_unknown_price");
      expect(ids).toContain("deal_null_price");
      expect(ids).toContain("deal_expired");
    });
  });

  describe("Time filtering", () => {
    it("filters to valid-now deals only", () => {
      const selected = selectDeals(allDeals, { price: "any", time: "valid-now", now: testNow });
      const ids = selected.map((d) => d._id);

      // At 12:30 PM:
      // dealUnder5 (11:00-14:00): VALID
      // dealExact5 (11:00-14:00): VALID
      // dealUnder10 (11:00-15:00): VALID
      // dealExact10 (11:00-15:00): VALID
      // dealUnder15 (12:00-16:00): VALID
      // dealExact15 (12:00-16:00): VALID
      // dealUnknownPrice (11:30-14:30): VALID
      // dealNullPrice (11:00-14:00): VALID
      // dealExpensive (17:00-22:00): later_today -> EXCLUDED
      // dealExpired: EXPIRED -> EXCLUDED

      expect(ids).toContain("deal_under_5");
      expect(ids).toContain("deal_exact_5");
      expect(ids).toContain("deal_under_10");
      expect(ids).toContain("deal_exact_10");
      expect(ids).toContain("deal_under_15");
      expect(ids).toContain("deal_exact_15");
      expect(ids).toContain("deal_unknown_price");
      expect(ids).toContain("deal_null_price");
      expect(ids).not.toContain("deal_expensive");
      expect(ids).not.toContain("deal_expired");
    });
  });

  describe("Sorting & Stable Ties", () => {
    it("breaks ties stably by _id string comparison", () => {
      const tieDealA: CanonicalDeal = {
        _id: "deal_tie_aaa",
        _creationTime: 5000,
        restaurant: "Spot A",
        dealText: "Tie A",
        priceCad: 10,
        lat: 49.28,
        lng: -123.12,
        validDays: ["tue"],
        validStart: "11:00",
        validEnd: "14:00",
        expiresOn: "2026-12-31",
      };
      const tieDealB: CanonicalDeal = {
        _id: "deal_tie_zzz",
        _creationTime: 5000,
        restaurant: "Spot B",
        dealText: "Tie B",
        priceCad: 10,
        lat: 49.28,
        lng: -123.12,
        validDays: ["tue"],
        validStart: "11:00",
        validEnd: "14:00",
        expiresOn: "2026-12-31",
      };

      const selected = selectDeals([tieDealB, tieDealA], {
        sort: "newest",
        time: "all",
        now: testNow,
      });

      // Same creation time: lexicographical _id tie break ensures deal_tie_aaa before deal_tie_zzz
      expect(selected[0]._id).toBe("deal_tie_aaa");
      expect(selected[1]._id).toBe("deal_tie_zzz");
    });

    it("sorts by price (cheapest first, unlisted at end)", () => {
      const sample = [dealExact10, dealUnder5, dealUnknownPrice, dealUnder10, dealExact5];
      const selected = selectDeals(sample, { sort: "price", time: "all", now: testNow });
      const prices = selected.map((d) => d.priceCad);
      // Expected order: 4.5, 5.0, 9.99, 10.0, undefined
      expect(prices).toEqual([4.5, 5.0, 9.99, 10.0, undefined]);
    });

    it("sorts by distance when userLocation is provided", () => {
      const userLoc = { lat: 49.2827, lng: -123.1207 };
      const selected = selectDeals(allDeals, {
        sort: "distance",
        userLocation: userLoc,
        time: "all",
        now: testNow,
      });

      expect(selected[0]._id).toBe("deal_under_5");
    });

    it("truthfully falls back to newest when userLocation is null (no fake distance)", () => {
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
  });
});

// Uses the exact nearby-query bounds in the callback adapter, synthetic fixes.
describe("viewer location acceptance", () => {
  it("rejects invalid and non-map coordinates without guessing a center", () => {
    for (const [lat, lng] of [[NaN, 0], [Infinity, 0], [86, 0], [49, 181], [null, 0], [true, 0], ["49", -123]]) expect(viewerLocation(lat, lng)).toBeNull();
    expect(viewerLocation(49.25, -122.95)).toEqual({lat: 49.25, lng: -122.95});
    expect(viewerLocation(-85.05112878, 180)).toEqual({lat: -85.05112878, lng: 180});
  });
});
