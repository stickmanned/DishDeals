import { describe, expect, it } from "vitest";
import { selectDeals, CanonicalSavedDeal, UserLocation } from "./dealSelection";

// Synthetic base coordinates (SFU Burnaby campus area)
const SFU_COORDS: UserLocation = { lat: 49.2781, lng: -122.9199 };
const NEAR_COORDS = { lat: 49.2785, lng: -122.9195 }; // ~50m from SFU
const FAR_COORDS = { lat: 49.2500, lng: -123.0000 };  // ~6km from SFU

function createDeal(overrides: Partial<CanonicalSavedDeal> = {}): CanonicalSavedDeal {
  return {
    _id: "deal_1",
    _creationTime: 1000,
    lat: NEAR_COORDS.lat,
    lng: NEAR_COORDS.lng,
    restaurant: "Test Bistro",
    dealText: "Half price appetizers",
    priceCad: 8.5,
    validDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    validStart: "10:00",
    validEnd: "22:00",
    expiresOn: "2026-12-31",
    conditions: [],
    ...overrides,
  };
}

describe("dealSelection (T-09A)", () => {
  // 2026-10-07 is Wednesday (PDT, UTC-7).
  // 12:00 Vancouver = 19:00 UTC
  const defaultNow = new Date("2026-10-07T19:00:00.000Z");

  describe("Price filtering: strict thresholds (<) and price varies", () => {
    const deals: CanonicalSavedDeal[] = [
      createDeal({ _id: "d_free", priceCad: 0 }),
      createDeal({ _id: "d_4_99", priceCad: 4.99 }),
      createDeal({ _id: "d_5_00", priceCad: 5.00 }),
      createDeal({ _id: "d_9_99", priceCad: 9.99 }),
      createDeal({ _id: "d_10_00", priceCad: 10.00 }),
      createDeal({ _id: "d_14_99", priceCad: 14.99 }),
      createDeal({ _id: "d_15_00", priceCad: 15.00 }),
      createDeal({ _id: "d_20_00", priceCad: 20.00 }),
      createDeal({ _id: "d_null", priceCad: null }),
      createDeal({ _id: "d_undef", priceCad: undefined }),
    ];

    it("includes all valid and missing prices under 'any' filter", () => {
      const result = selectDeals(deals, { now: defaultNow, priceFilter: "any" });
      const ids = result.map((d) => d._id);
      expect(ids).toContain("d_free");
      expect(ids).toContain("d_4_99");
      expect(ids).toContain("d_5_00");
      expect(ids).toContain("d_9_99");
      expect(ids).toContain("d_10_00");
      expect(ids).toContain("d_14_99");
      expect(ids).toContain("d_15_00");
      expect(ids).toContain("d_20_00");
      expect(ids).toContain("d_null");
      expect(ids).toContain("d_undef");
      expect(result).toHaveLength(10);
    });

    it("strictly excludes exact 5 and above under $5 filter (< 5), keeping price varies", () => {
      const result = selectDeals(deals, { now: defaultNow, priceFilter: 5 });
      const ids = result.map((d) => d._id);
      expect(ids).toContain("d_free");
      expect(ids).toContain("d_4_99");
      expect(ids).toContain("d_null");
      expect(ids).toContain("d_undef");
      expect(ids).not.toContain("d_5_00");
      expect(ids).not.toContain("d_9_99");
      expect(ids).not.toContain("d_10_00");
      expect(ids).not.toContain("d_15_00");
      expect(result).toHaveLength(4);
    });

    it("accepts string filter '5' identical to numeric 5", () => {
      const result = selectDeals(deals, { now: defaultNow, priceFilter: "5" });
      const ids = result.map((d) => d._id);
      expect(ids).toEqual(["d_4_99", "d_free", "d_null", "d_undef"]);
    });

    it("strictly excludes exact 10 and above under $10 filter (< 10), keeping price varies", () => {
      const result = selectDeals(deals, { now: defaultNow, priceFilter: 10 });
      const ids = result.map((d) => d._id);
      expect(ids).toContain("d_free");
      expect(ids).toContain("d_4_99");
      expect(ids).toContain("d_5_00");
      expect(ids).toContain("d_9_99");
      expect(ids).toContain("d_null");
      expect(ids).toContain("d_undef");
      expect(ids).not.toContain("d_10_00");
      expect(ids).not.toContain("d_15_00");
      expect(result).toHaveLength(6);
    });

    it("strictly excludes exact 15 and above under $15 filter (< 15), keeping price varies", () => {
      const result = selectDeals(deals, { now: defaultNow, priceFilter: 15 });
      const ids = result.map((d) => d._id);
      expect(ids).toContain("d_free");
      expect(ids).toContain("d_4_99");
      expect(ids).toContain("d_5_00");
      expect(ids).toContain("d_9_99");
      expect(ids).toContain("d_10_00");
      expect(ids).toContain("d_14_99");
      expect(ids).toContain("d_null");
      expect(ids).toContain("d_undef");
      expect(ids).not.toContain("d_15_00");
      expect(ids).not.toContain("d_20_00");
      expect(result).toHaveLength(8);
    });

    it("rejects invalid, negative, or non-finite prices from masquerading as varies", () => {
      const invalidDeals: CanonicalSavedDeal[] = [
        createDeal({ _id: "d_neg", priceCad: -1 }),
        createDeal({ _id: "d_nan", priceCad: NaN }),
        createDeal({ _id: "d_inf", priceCad: Infinity }),
        createDeal({ _id: "d_str", priceCad: "5" as unknown as number }),
        createDeal({ _id: "d_valid", priceCad: 4 }),
      ];

      const resAny = selectDeals(invalidDeals, { now: defaultNow, priceFilter: "any" });
      expect(resAny.map((d) => d._id)).toEqual(["d_valid"]);

      const resUnder5 = selectDeals(invalidDeals, { now: defaultNow, priceFilter: 5 });
      expect(resUnder5.map((d) => d._id)).toEqual(["d_valid"]);
    });
  });

  describe("Sorting: valid first, nearest second, newest third, stable tie-break", () => {
    // 2026-10-07 Wednesday:
    // 12:00 Vancouver = 19:00 UTC
    // 09:00 Vancouver = 16:00 UTC (deal 11:00-14:00 is later_today)
    it("sorts valid deals first, even if non-valid deals are closer or newer", () => {
      const validFar: CanonicalSavedDeal = createDeal({
        _id: "valid_far",
        lat: FAR_COORDS.lat,
        lng: FAR_COORDS.lng,
        validStart: "10:00",
        validEnd: "14:00",
        _creationTime: 100,
      });

      const laterNear: CanonicalSavedDeal = createDeal({
        _id: "later_near",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        validStart: "20:00",
        validEnd: "22:00",
        _creationTime: 500,
      });

      const result = selectDeals([laterNear, validFar], {
        now: defaultNow,
        userLocation: SFU_COORDS,
      });

      expect(result[0]._id).toBe("valid_far");
      expect(result[0].validity.status).toBe("valid");
      expect(result[1]._id).toBe("later_near");
      expect(result[1].validity.status).toBe("later_today");
    });

    it("sorts by distance (nearest first) within the valid group", () => {
      const validNear: CanonicalSavedDeal = createDeal({
        _id: "v_near",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        validStart: "10:00",
        validEnd: "14:00",
        _creationTime: 100,
      });

      const validFar: CanonicalSavedDeal = createDeal({
        _id: "v_far",
        lat: FAR_COORDS.lat,
        lng: FAR_COORDS.lng,
        validStart: "10:00",
        validEnd: "14:00",
        _creationTime: 500,
      });

      const result = selectDeals([validFar, validNear], {
        now: defaultNow,
        userLocation: SFU_COORDS,
      });

      expect(result[0]._id).toBe("v_near");
      expect(result[1]._id).toBe("v_far");
      expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm!);
    });

    it("sorts by distance (nearest first) within the non-valid group", () => {
      const laterNear: CanonicalSavedDeal = createDeal({
        _id: "l_near",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        validStart: "21:00",
        validEnd: "23:00",
        _creationTime: 100,
      });

      const laterFar: CanonicalSavedDeal = createDeal({
        _id: "l_far",
        lat: FAR_COORDS.lat,
        lng: FAR_COORDS.lng,
        validStart: "21:00",
        validEnd: "23:00",
        _creationTime: 500,
      });

      const result = selectDeals([laterFar, laterNear], {
        now: defaultNow,
        userLocation: SFU_COORDS,
      });

      expect(result[0]._id).toBe("l_near");
      expect(result[1]._id).toBe("l_far");
    });

    it("breaks ties with newest _creationTime first, then stable _id", () => {
      const sameLocOlder: CanonicalSavedDeal = createDeal({
        _id: "deal_b_older",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        _creationTime: 1000,
      });

      const sameLocNewer: CanonicalSavedDeal = createDeal({
        _id: "deal_a_newer",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        _creationTime: 2000,
      });

      const sameLocSameTimeA: CanonicalSavedDeal = createDeal({
        _id: "deal_c_1",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        _creationTime: 3000,
      });

      const sameLocSameTimeB: CanonicalSavedDeal = createDeal({
        _id: "deal_c_2",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        _creationTime: 3000,
      });

      const result = selectDeals(
        [sameLocOlder, sameLocSameTimeB, sameLocSameTimeA, sameLocNewer],
        { now: defaultNow, userLocation: SFU_COORDS }
      );

      expect(result.map((d) => d._id)).toEqual([
        "deal_c_1",
        "deal_c_2",
        "deal_a_newer",
        "deal_b_older",
      ]);
    });
  });

  describe("Location handling: absent / denied location", () => {
    it("omits distanceKm when user location is absent, null, or undefined", () => {
      const dealA = createDeal({ _id: "a", _creationTime: 200 });
      const dealB = createDeal({ _id: "b", _creationTime: 100 });

      const resNoLoc = selectDeals([dealB, dealA], { now: defaultNow });
      expect(resNoLoc[0]._id).toBe("a");
      expect(resNoLoc[0].distanceKm).toBeUndefined();
      expect("distanceKm" in resNoLoc[0]).toBe(false);
      expect(resNoLoc[1].distanceKm).toBeUndefined();

      const resNullLoc = selectDeals([dealB, dealA], {
        now: defaultNow,
        userLocation: null,
      });
      expect(resNullLoc[0]._id).toBe("a");
      expect(resNullLoc[0].distanceKm).toBeUndefined();
    });

    it("sorts by newest _creationTime when user location is absent", () => {
      const dealOld = createDeal({ _id: "old", _creationTime: 50 });
      const dealMid = createDeal({ _id: "mid", _creationTime: 150 });
      const dealNew = createDeal({ _id: "new", _creationTime: 300 });

      const result = selectDeals([dealOld, dealNew, dealMid], { now: defaultNow });
      expect(result.map((d) => d._id)).toEqual(["new", "mid", "old"]);
    });

    it("handles positional call signature selectDeals(deals, now, priceFilter, userLocation)", () => {
      const deal = createDeal({ _id: "p1", priceCad: 3 });
      const result = selectDeals([deal], defaultNow, 5, SFU_COORDS);
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe("p1");
      expect(result[0].distanceKm).toBeTypeOf("number");
    });
  });

  describe("Overnight logic, Vancouver time, and injected time updates", () => {
    // Overnight deal: Friday 21:00 to 02:00 (Saturday morning)
    // Friday Oct 2 2026: 21:00 Vancouver = Oct 3 04:00 UTC
    // Saturday Oct 3 2026: 01:00 Vancouver = Oct 3 08:00 UTC
    // Saturday Oct 3 2026: 03:00 Vancouver = Oct 3 10:00 UTC
    const overnightDeal = createDeal({
      _id: "overnight_fri",
      validDays: ["fri"],
      validStart: "21:00",
      validEnd: "02:00",
      expiresOn: "2026-10-31",
    });

    it("recognizes Friday overnight tail as valid on Saturday at 01:00 Vancouver", () => {
      const satEarly = new Date("2026-10-03T08:00:00.000Z"); // 01:00 PDT
      const result = selectDeals([overnightDeal], { now: satEarly });
      expect(result).toHaveLength(1);
      expect(result[0].validity.status).toBe("valid");
      expect(result[0].validity.minutesLeft).toBe(60);
    });

    it("transitions overnight deal to not_today on Saturday at 03:00 Vancouver", () => {
      const satAfter = new Date("2026-10-03T10:00:00.000Z"); // 03:00 PDT
      const result = selectDeals([overnightDeal], { now: satAfter });
      expect(result).toHaveLength(1);
      expect(result[0].validity.status).toBe("not_today");
    });

    it("updates validity dynamically when called repeatedly with different injected times", () => {
      const deal = createDeal({
        _id: "d1",
        validDays: ["wed"],
        validStart: "12:00",
        validEnd: "14:00",
      });

      // 1. Before window (11:00 Vancouver = 18:00 UTC)
      const t1 = new Date("2026-10-07T18:00:00.000Z");
      const r1 = selectDeals([deal], { now: t1 });
      expect(r1[0].validity.status).toBe("later_today");

      // 2. Inside window (12:30 Vancouver = 19:30 UTC)
      const t2 = new Date("2026-10-07T19:30:00.000Z");
      const r2 = selectDeals([deal], { now: t2 });
      expect(r2[0].validity.status).toBe("valid");
      expect(r2[0].validity.minutesLeft).toBe(90);

      // 3. After window (15:00 Vancouver = 22:00 UTC)
      const t3 = new Date("2026-10-07T22:00:00.000Z");
      const r3 = selectDeals([deal], { now: t3 });
      expect(r3[0].validity.status).toBe("not_today");
    });
  });

  describe("Preserving enrichment and strict immutability", () => {
    it("preserves custom enrichments and all canonical fields", () => {
      const enrichedDeal: CanonicalSavedDeal = {
        ...createDeal({ _id: "enriched_1", priceCad: 7.5 }),
        authorDisplayName: "Alice",
        authorWallet: "SolanaAddress123",
        viewerVote: "still_on",
        customBadge: "Chef Special",
      };

      const result = selectDeals([enrichedDeal], { now: defaultNow, priceFilter: 10 });
      expect(result[0].authorDisplayName).toBe("Alice");
      expect(result[0].authorWallet).toBe("SolanaAddress123");
      expect(result[0].viewerVote).toBe("still_on");
      expect((result[0] as Record<string, unknown>).customBadge).toBe("Chef Special");
    });

    it("does not mutate caller array or deal objects", () => {
      const dealOriginal = createDeal({ _id: "d_orig", priceCad: 4.5 });
      const dealFrozen = Object.freeze({ ...dealOriginal });
      const dealArray = [dealFrozen];

      const result = selectDeals(dealArray, {
        now: defaultNow,
        priceFilter: 5,
        userLocation: SFU_COORDS,
      });

      expect(dealArray).toHaveLength(1);
      expect(dealArray[0]).toBe(dealFrozen);
      expect("distanceKm" in dealFrozen).toBe(false);
      expect("validity" in dealFrozen).toBe(false);

      expect(result[0]).not.toBe(dealFrozen);
      expect(result[0]._id).toBe("d_orig");
      expect(result[0].distanceKm).toBeTypeOf("number");
      expect(result[0].validity.status).toBe("valid");
    });

    it("strips prior distanceKm when re-selecting with absent or null user location", () => {
      const dealOldNear = createDeal({
        _id: "deal_old_near",
        lat: NEAR_COORDS.lat,
        lng: NEAR_COORDS.lng,
        _creationTime: 100,
      });
      const dealNewFar = createDeal({
        _id: "deal_new_far",
        lat: FAR_COORDS.lat,
        lng: FAR_COORDS.lng,
        _creationTime: 500,
      });

      // 1. Initial selection with user location: dealOldNear has distance ~0.05 km, dealNewFar has ~6 km
      const initial = selectDeals([dealOldNear, dealNewFar], {
        now: defaultNow,
        userLocation: SFU_COORDS,
      });
      expect(initial[0]._id).toBe("deal_old_near");
      expect(initial[0].distanceKm).toBeTypeOf("number");
      expect(initial[1]._id).toBe("deal_new_far");
      expect(initial[1].distanceKm).toBeTypeOf("number");

      // 2. Re-select prior results with location revoked/absent
      const reselected = selectDeals(initial, {
        now: defaultNow,
        userLocation: null,
      });

      // Ensure no distanceKm property remains on any re-selected record
      for (const item of reselected) {
        expect("distanceKm" in item).toBe(false);
        expect(item.distanceKm).toBeUndefined();
      }

      // Ensure sorting order does NOT use stale distances (dealNewFar has newer _creationTime 500 > 100)
      expect(reselected[0]._id).toBe("deal_new_far");
      expect(reselected[1]._id).toBe("deal_old_near");
    });

    it("strips prior distanceKm and does not sort by stale distance when deal coordinates are invalid", () => {
      const priorResult = [
        {
          ...createDeal({ _id: "deal_corrupt", lat: NaN, lng: NaN, _creationTime: 100 }),
          distanceKm: 0.01, // Stale distance from before corruption
        },
        createDeal({ _id: "deal_valid_far", lat: FAR_COORDS.lat, lng: FAR_COORDS.lng, _creationTime: 200 }),
      ];

      const reselected = selectDeals(priorResult, {
        now: defaultNow,
        userLocation: SFU_COORDS,
      });

      const corruptDeal = reselected.find((d) => d._id === "deal_corrupt");
      expect(corruptDeal).toBeDefined();
      expect("distanceKm" in corruptDeal!).toBe(false);
      expect(corruptDeal!.distanceKm).toBeUndefined();

      // Valid far deal with valid distance sorts ahead of corrupt deal lacking valid distance
      expect(reselected[0]._id).toBe("deal_valid_far");
      expect(reselected[1]._id).toBe("deal_corrupt");
    });

    it("sanitizes non-finite _creationTime deterministically", () => {
      const d1 = createDeal({ _id: "d_nan_time", _creationTime: NaN });
      const d2 = createDeal({ _id: "d_inf_time", _creationTime: Infinity });
      const d3 = createDeal({ _id: "d_pos_time", _creationTime: 100 });

      const result = selectDeals([d1, d2, d3], { now: defaultNow });
      // Valid positive creation time sorts before sanitized 0
      expect(result[0]._id).toBe("d_pos_time");
      // d_inf_time and d_nan_time fall back to 0 and tie-break by ID
      expect(result.map((d) => d._id)).toEqual(["d_pos_time", "d_inf_time", "d_nan_time"]);
    });

    it("uses locale-independent ID tie comparison", () => {
      const dA = createDeal({ _id: "deal_a", _creationTime: 1000 });
      const dB = createDeal({ _id: "deal_b", _creationTime: 1000 });
      const result = selectDeals([dB, dA], { now: defaultNow });
      expect(result[0]._id).toBe("deal_a");
      expect(result[1]._id).toBe("deal_b");
    });
  });
});
