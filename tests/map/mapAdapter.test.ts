import { describe, expect, it } from "vitest";
import {
  toCanonicalMapDeal,
  toCanonicalMapDeals,
  type CanonicalSavedDeal,
} from "../../lib/mapAdapter";

describe("toCanonicalMapDeal pure adapter", () => {
  const minimalValid: CanonicalSavedDeal = {
    _id: "deal_123",
    restaurant: "Ramen Danbo",
    dealText: "Half price gyoza with any ramen bowl",
    lat: 49.2781,
    lng: -123.1207,
  };

  it("maps minimal canonical saved deal to MapDeal", () => {
    const result = toCanonicalMapDeal(minimalValid);
    expect(result).toEqual({
      id: "deal_123",
      restaurantName: "Ramen Danbo",
      title: "Half price gyoza with any ramen bowl",
      latitude: 49.2781,
      longitude: -123.1207,
    });
  });

  it("maps optional fields: address, priceCad (with CAD currency), sourceUrl, and expiresOn", () => {
    const fullDeal: CanonicalSavedDeal = {
      ...minimalValid,
      address: "1333 Robson St, Vancouver, BC",
      priceCad: 14.5,
      sourceUrl: "https://www.instagram.com/reel/C1234567890/",
      expiresOn: "2026-12-31",
      conditions: ["Dine-in only"],
    };

    const result = toCanonicalMapDeal(fullDeal);
    expect(result).toEqual({
      id: "deal_123",
      restaurantName: "Ramen Danbo",
      title: "Half price gyoza with any ramen bowl",
      latitude: 49.2781,
      longitude: -123.1207,
      address: "1333 Robson St, Vancouver, BC",
      price: 14.5,
      currency: "CAD",
      sourceUrl: "https://www.instagram.com/reel/C1234567890/",
      expiresAt: "2026-12-31",
    });
  });

  it("does not invent currency when priceCad is omitted", () => {
    const noPrice: CanonicalSavedDeal = {
      ...minimalValid,
      priceCad: undefined,
    };
    const result = toCanonicalMapDeal(noPrice);
    expect(result?.price).toBeUndefined();
    expect(result?.currency).toBeUndefined();
  });

  it("does not invent expiry timestamp when expiresOn is omitted", () => {
    const noExpiry: CanonicalSavedDeal = {
      ...minimalValid,
      expiresOn: undefined,
    };
    const result = toCanonicalMapDeal(noExpiry);
    expect(result?.expiresAt).toBeUndefined();
  });

  it("rejects invalid coordinate bounds outside Web Mercator limits", () => {
    expect(toCanonicalMapDeal({ ...minimalValid, lat: 86 })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, lat: -86 })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, lng: 181 })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, lng: -181 })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, lat: NaN })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, lng: Infinity })).toBeNull();
  });

  it("rejects records with missing or empty required string fields", () => {
    expect(toCanonicalMapDeal({ ...minimalValid, _id: "" })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, restaurant: "   " })).toBeNull();
    expect(toCanonicalMapDeal({ ...minimalValid, dealText: "" })).toBeNull();
  });

  it("rejects non-http/https source URLs", () => {
    const invalidUrlDeal: CanonicalSavedDeal = {
      ...minimalValid,
      sourceUrl: "javascript:alert(1)",
    };
    const result = toCanonicalMapDeal(invalidUrlDeal);
    expect(result?.sourceUrl).toBeUndefined();
  });
});

describe("toCanonicalMapDeals list adapter", () => {
  it("filters out invalid deals and deduplicates identical _ids", () => {
    const deals: CanonicalSavedDeal[] = [
      {
        _id: "deal_1",
        restaurant: "Saku",
        dealText: "20% off tonkatsu",
        lat: 49.2638,
        lng: -123.1205,
      },
      {
        _id: "deal_invalid_lat",
        restaurant: "Bad Lat",
        dealText: "Invalid",
        lat: 999,
        lng: -123.1205,
      },
      {
        _id: "deal_1", // duplicate ID
        restaurant: "Saku Duplicate",
        dealText: "Duplicate entry",
        lat: 49.2638,
        lng: -123.1205,
      },
      {
        _id: "deal_2",
        restaurant: "Marutama",
        dealText: "Free tamago upgrade",
        lat: 49.2865,
        lng: -123.1311,
      },
    ];

    const result = toCanonicalMapDeals(deals);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("deal_1");
    expect(result[0].restaurantName).toBe("Saku");
    expect(result[1].id).toBe("deal_2");
    expect(result[1].restaurantName).toBe("Marutama");
  });

  it("returns empty array for empty or invalid input", () => {
    expect(toCanonicalMapDeals([])).toEqual([]);
    // @ts-expect-error testing invalid input
    expect(toCanonicalMapDeals(null)).toEqual([]);
  });
});
