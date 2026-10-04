import { describe, expect, it } from "vitest";
import {
  filterDeals,
  parseWorkflowDeals,
  validity,
  type DealView,
} from "./deals";
import { demoDeals } from "./demoDeals";

const noon = new Date("2026-10-03T19:00:00Z"); // Noon in Vancouver, Saturday.
const base: DealView = {
  id: "test-deal",
  restaurant: "Test café",
  dealText: "Lunch special",
  description: "Soup and bread",
  validDays: [],
  validStart: "11:00",
  validEnd: "14:00",
  conditions: [],
  createdAt: 1,
  isDemo: false,
};
const deal = (changes: Partial<DealView> = {}): DealView => ({
  ...base,
  ...changes,
});

describe("Vancouver browser validity", () => {
  it("uses Vancouver even while UTC is already the following day", () => {
    const result = validity(
      deal({ validDays: ["sat"], validStart: "22:00", validEnd: "23:59" }),
      new Date("2026-10-04T06:30:00Z"),
    );
    expect(result).toMatchObject({ status: "valid", minutesLeft: 29 });
  });

  it("shows a future window as later today and closes at the exact end", () => {
    expect(validity(base, new Date("2026-10-03T17:00:00Z")).status).toBe(
      "later_today",
    );
    expect(validity(base, noon)).toMatchObject({
      status: "valid",
      minutesLeft: 120,
    });
    expect(validity(base, new Date("2026-10-03T21:00:00Z")).status).toBe(
      "not_today",
    );
  });

  it("keeps an expiry date inclusive until Vancouver midnight", () => {
    const dated = deal({
      validStart: undefined,
      validEnd: undefined,
      expiresOn: "2026-10-03",
    });
    expect(validity(dated, new Date("2026-10-04T06:59:30Z"))).toMatchObject({
      status: "valid",
      minutesLeft: 1,
    });
    expect(validity(dated, new Date("2026-10-04T07:00:00Z")).status).toBe(
      "expired",
    );
  });

  it("keeps a start date inclusive and hides deals that have not started", () => {
    const dated = deal({ startsOn: "2026-10-04", expiresOn: "2026-10-07" });
    expect(validity(dated, noon).status).toBe("not_today");
    expect(validity(dated, new Date("2026-10-04T19:00:00Z")).status).toBe(
      "valid",
    );
  });

  it("does not treat missing validity evidence or only a past start date as valid", () => {
    const unknown = deal({ validStart: undefined, validEnd: undefined });
    expect(validity(unknown, noon).status).toBe("unknown");
    expect(validity({ ...unknown, startsOn: "2026-10-01" }, noon).status).toBe(
      "unknown",
    );
  });

  it("supports day-only and expiry-only evidence without inventing hours", () => {
    expect(
      validity(
        deal({
          validDays: ["sat"],
          validStart: undefined,
          validEnd: undefined,
        }),
        noon,
      ).status,
    ).toBe("valid");
    expect(
      validity(
        deal({
          validDays: ["mon"],
          validStart: undefined,
          validEnd: undefined,
        }),
        noon,
      ).status,
    ).toBe("not_today");
    expect(
      validity(
        deal({
          validStart: undefined,
          validEnd: undefined,
          expiresOn: "2026-10-04",
        }),
        noon,
      ),
    ).toMatchObject({ status: "valid", minutesLeft: 2160 });
  });

  it("attributes an overnight window to the weekday it started", () => {
    const overnight = deal({
      validDays: ["mon"],
      validStart: "22:00",
      validEnd: "02:00",
    });
    expect(validity(overnight, new Date("2026-10-06T08:00:00Z"))).toMatchObject(
      { status: "valid", minutesLeft: 60 },
    );
    expect(validity(overnight, new Date("2026-10-06T09:00:00Z")).status).toBe(
      "not_today",
    );
    expect(validity(overnight, new Date("2026-10-07T08:00:00Z")).status).toBe(
      "not_today",
    );
  });

  it("shows the next overnight window later today", () => {
    const overnight = deal({
      validDays: ["mon"],
      validStart: "22:00",
      validEnd: "02:00",
    });
    expect(validity(overnight, new Date("2026-10-05T19:00:00Z")).status).toBe(
      "later_today",
    );
  });

  it("never extends an overnight offer beyond its expiry calendar date", () => {
    const overnight = deal({
      validDays: ["mon"],
      validStart: "22:00",
      validEnd: "02:00",
      expiresOn: "2026-10-05",
    });
    expect(validity(overnight, new Date("2026-10-06T06:00:00Z"))).toMatchObject(
      { status: "valid", minutesLeft: 60 },
    );
    expect(validity(overnight, new Date("2026-10-06T08:00:00Z")).status).toBe(
      "expired",
    );
  });

  it("does not use the night before the start date as an active session", () => {
    const overnight = deal({
      validStart: "22:00",
      validEnd: "02:00",
      startsOn: "2026-10-05",
    });
    expect(validity(overnight, new Date("2026-10-05T08:00:00Z")).status).toBe(
      "later_today",
    );
  });

  it("uses actual elapsed minutes over spring-forward and autumn DST transitions", () => {
    const window = deal({ validStart: "00:00", validEnd: "04:00" });
    expect(validity(window, new Date("2026-03-08T08:30:00Z"))).toMatchObject({
      status: "valid",
      minutesLeft: 150,
    });
    // Vancouver's last autumn fallback was in 2025; B.C. keeps UTC-7 after
    // its final spring-forward in March 2026. Intl's timezone data owns this.
    expect(
      validity(
        { ...window, validEnd: "03:00" },
        new Date("2025-11-02T07:30:00Z"),
      ),
    ).toMatchObject({ status: "valid", minutesLeft: 210 });
  });

  it("follows Vancouver's permanent UTC-7 rule in November 2026", () => {
    expect(
      validity(
        deal({ validStart: "00:00", validEnd: "03:00" }),
        new Date("2026-11-01T07:30:00Z"),
      ),
    ).toMatchObject({ status: "valid", minutesLeft: 150 });
  });

  it("omits an exact countdown for a nonexistent spring-forward endpoint", () => {
    expect(
      validity(
        deal({ validStart: "00:00", validEnd: "02:30" }),
        new Date("2026-03-08T09:00:00Z"),
      ),
    ).toEqual({ status: "valid", label: "Valid now" });
  });

  it.each([
    { validStart: "25:00" },
    { validEnd: "12:60" },
    { validDays: ["Monday"] },
    { expiresOn: "2026-02-30" },
    { startsOn: "2026-12-01", expiresOn: "2026-01-01" },
    { validStart: "12:00", validEnd: "12:00" },
  ])("keeps malformed or contradictory schedules unknown: %j", (changes) => {
    expect(validity(deal(changes), noon).status).toBe("unknown");
  });

  it("does not throw for an invalid now value", () => {
    expect(validity(base, new Date("invalid")).status).toBe("unknown");
  });
});

describe("price and search filters", () => {
  const filters = { search: "", priceLimit: 10, onlyNow: false };

  it("uses strict under thresholds and keeps unknown prices", () => {
    const rows = [
      deal({ id: "cheap", priceCad: 9.99 }),
      deal({ id: "boundary", priceCad: 10 }),
      deal({ id: "unknown" }),
      deal({ id: "expensive", priceCad: 12 }),
    ];
    expect(filterDeals(rows, filters, noon).map((row) => row.id)).toEqual([
      "cheap",
      "unknown",
    ]);
    expect(
      filterDeals(rows, { ...filters, priceLimit: null }, noon),
    ).toHaveLength(4);
  });

  it("does not compare or convert non-CAD currencies", () => {
    const foreign = deal({ id: "foreign", priceCad: 100, currency: "USD" });
    expect(filterDeals([foreign], filters, noon)).toEqual([foreign]);
  });

  it("only-now excludes unknown and future schedules", () => {
    const rows = [
      base,
      deal({ id: "unknown", validStart: undefined, validEnd: undefined }),
      deal({ id: "later", validStart: "18:00", validEnd: "20:00" }),
    ];
    expect(filterDeals(rows, { ...filters, onlyNow: true }, noon)).toEqual([
      base,
    ]);
  });

  it("searches supplied text and accents without fabricating cuisine or city", () => {
    expect(filterDeals([base], { ...filters, search: " CAFE " }, noon)).toEqual(
      [base],
    );
    expect(filterDeals([base], { ...filters, search: "soup" }, noon)).toEqual([
      base,
    ]);
    expect(
      filterDeals([base], { ...filters, search: "Japanese" }, noon),
    ).toEqual([]);
  });

  it("sorts valid-now first and then newest without mutating the input", () => {
    const rows = [
      deal({
        id: "later",
        validStart: "18:00",
        validEnd: "20:00",
        createdAt: 10,
      }),
      deal({ id: "old", createdAt: 2 }),
      deal({ id: "new", createdAt: 4 }),
    ];
    expect(
      filterDeals(rows, { ...filters, priceLimit: null }, noon).map(
        (row) => row.id,
      ),
    ).toEqual(["new", "old", "later"]);
    expect(rows.map((row) => row.id)).toEqual(["later", "old", "new"]);
  });
});

const workflowRecord = {
  dealId: "workflow-deal-1",
  restaurantId: "workflow-restaurant-1",
  restaurantName: "Extracted restaurant",
  title: "Lunch special",
  description: "Soup and bread",
  price: 8.5,
  currency: "CAD",
  discountPercent: null,
  days: ["Monday", "Tuesday"],
  startTime: "11:00",
  endTime: "14:00",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  conditions: ["Dine-in"],
  locationHint: "Vancouver",
  addressHint: null,
  evidence: "Lunch special $8.50",
  confidence: 0.92,
  warnings: [],
  restaurant: {
    placeId: "verified-place",
    name: "Verified branch",
    address: "123 Source Street, Vancouver",
    latitude: 49.28,
    longitude: -123.12,
    city: "Vancouver",
    countryCode: "ca",
    categories: ["catering.restaurant"],
    matchScore: 0.99,
  },
  sourceUrl: "https://example.com/offer",
  timezone: "America/Vancouver",
  createdAt: 1234,
};

describe("workflow public feed adapter", () => {
  it("maps the verified place, CAD price and source schedule while preserving descriptions", () => {
    const [parsed] = parseWorkflowDeals([workflowRecord]);
    expect(parsed).toMatchObject({
      id: "workflow-deal-1",
      restaurant: "Verified branch",
      dealText: "Lunch special",
      description: "Soup and bread",
      priceCad: 8.5,
      currency: "CAD",
      validDays: ["mon", "tue"],
      validStart: "11:00",
      validEnd: "14:00",
      startsOn: "2026-10-01",
      expiresOn: "2026-10-31",
      lat: 49.28,
      lng: -123.12,
      isDemo: false,
    });
    for (const unsupported of [
      "imageUrl",
      "authorName",
      "originalPrice",
      "stillOnCount",
      "expiredCount",
    ]) {
      expect(parsed).not.toHaveProperty(unsupported);
    }
  });

  it("omits nullable optional fields and never assumes CAD", () => {
    const [parsed] = parseWorkflowDeals([
      {
        ...workflowRecord,
        price: 7,
        currency: null,
        startTime: null,
        endTime: null,
        startDate: null,
        endDate: null,
        sourceUrl: null,
        days: [],
      },
    ]);
    for (const optional of [
      "priceCad",
      "currency",
      "validStart",
      "validEnd",
      "startsOn",
      "expiresOn",
      "sourceUrl",
    ]) {
      expect(parsed).not.toHaveProperty(optional);
    }
    expect(validity(parsed, noon).status).toBe("unknown");
    expect(
      parseWorkflowDeals([{ ...workflowRecord, currency: "USD" }])[0],
    ).toMatchObject({ currency: "USD" });
    expect(
      parseWorkflowDeals([{ ...workflowRecord, currency: "USD" }])[0],
    ).not.toHaveProperty("priceCad");
  });

  it("accepts an empty real feed", () => {
    expect(parseWorkflowDeals([])).toEqual([]);
  });

  it.each([
    null,
    {},
    { deals: [workflowRecord] },
    [{ dealId: "partial" }],
    [base],
  ])("rejects a wrong or incomplete payload: %j", (payload) => {
    expect(() => parseWorkflowDeals(payload)).toThrow("supported contract");
  });

  it.each([
    { timezone: "Europe/London" },
    { timezone: undefined },
    { price: Number.NaN },
    { price: -1 },
    { endDate: "2026-02-30" },
    { startTime: "24:00" },
    { days: ["mon"] },
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "https://name:secret@example.com/offer" },
    { sourceUrl: "https://127.0.0.1/offer" },
    { sourceUrl: "https://example.com:8080/offer" },
    { endDate: "2026-01-01" },
    { currency: "cad" },
    { restaurant: { ...workflowRecord.restaurant, latitude: 91 } },
    { restaurant: null },
    { unexpected: true },
  ])("rejects unsafe or mismatched record fields: %j", (changes) => {
    expect(() =>
      parseWorkflowDeals([{ ...workflowRecord, ...changes }]),
    ).toThrow("supported contract");
  });

  it("rejects the entire batch if one row is broken, and rejects duplicate IDs", () => {
    expect(() =>
      parseWorkflowDeals([
        workflowRecord,
        { ...workflowRecord, dealId: "broken", title: "" },
      ]),
    ).toThrow();
    expect(() => parseWorkflowDeals([workflowRecord, workflowRecord])).toThrow(
      "duplicate records",
    );
  });

  it("keeps demo records separate from live data, with Burnaby placeholders and example images", () => {
    expect(demoDeals.length).toBeGreaterThanOrEqual(60);
    expect(
      demoDeals.every((row) => row.isDemo && row.id.startsWith("demo-")),
    ).toBe(true);
    expect(new Set(demoDeals.map((row) => row.id)).size).toBe(demoDeals.length);
    const photos = new Set([
      "/images/ramen.jpg",
      "/images/pizza.jpg",
      "/images/sushi.jpg",
      "/images/coffee.jpg",
      "/images/tacos.jpg",
      "/images/burger.jpg",
    ]);
    for (const row of demoDeals) {
      if (row.imageUrl) expect(photos.has(row.imageUrl)).toBe(true);
    }
    expect(new Set(demoDeals.map((row) => row.imageUrl)).size).toBeGreaterThan(5);
  });

  it("gives every placeholder a schedule that the validity rules can read", () => {
    for (const row of demoDeals) {
      expect(validity(row, noon).status).not.toBe("unknown");
    }
    const statuses = new Set(demoDeals.map((row) => validity(row, noon).status));
    expect(statuses.has("valid")).toBe(true);
    expect(statuses.has("expired")).toBe(true);
  });
});
