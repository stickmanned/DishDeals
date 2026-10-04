import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Deal, DealResult } from "./dealSchema";

const confidence = { restaurant: 0.9, priceCad: 0.8, hours: 0.7, expiresOn: 0.5 };

const fullDeal = {
  restaurant: "Pizza Place",
  address: "8888 University Dr, Burnaby",
  dealText: "Two slices and a drink",
  priceCad: 7.5,
  validDays: ["mon", "fri"],
  validStart: "11:00",
  validEnd: "14:00",
  expiresOn: "2026-11-30",
  conditions: ["Dine in only"],
  confidence,
};

const sparseDeal = {
  restaurant: "Noodle Bar",
  address: null,
  dealText: "Half-price ramen",
  priceCad: null,
  validDays: [],
  validStart: null,
  validEnd: null,
  expiresOn: null,
  conditions: [],
  confidence: { restaurant: 0.95, priceCad: 0, hours: 0, expiresOn: 0 },
};

describe("DealResult contract", () => {
  it("keeps null for missing fields instead of coercing them", () => {
    const parsed = DealResult.parse({ isDeal: true, deals: [sparseDeal] });
    const deal = parsed.deals[0];
    expect(deal.address).toBeNull();
    expect(deal.priceCad).toBeNull();
    expect(deal.validStart).toBeNull();
    expect(deal.validEnd).toBeNull();
    expect(deal.expiresOn).toBeNull();
    expect(deal.validDays).toEqual([]);
  });

  it("rejects a missing nullable key; Gemini must send null explicitly", () => {
    const withoutAddress: Partial<typeof sparseDeal> = { ...sparseDeal };
    delete withoutAddress.address;
    expect(Deal.safeParse(withoutAddress).success).toBe(false);
  });

  it("accepts several deals in one result", () => {
    const parsed = DealResult.parse({ isDeal: true, deals: [fullDeal, sparseDeal] });
    expect(parsed.deals).toHaveLength(2);
    expect(parsed.deals[0].validDays).toEqual(["mon", "fri"]);
  });

  it("accepts a non-deal result with no deals", () => {
    expect(DealResult.parse({ isDeal: false, deals: [] })).toEqual({ isDeal: false, deals: [] });
  });

  it("accepts every lowercase weekday and rejects other spellings", () => {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    expect(Deal.safeParse({ ...fullDeal, validDays: days }).success).toBe(true);
    for (const bad of ["Mon", "monday", "mo", ""]) {
      expect(Deal.safeParse({ ...fullDeal, validDays: [bad] }).success).toBe(false);
    }
  });

  it("rejects malformed field types", () => {
    const bad: Record<string, unknown>[] = [
      { ...fullDeal, priceCad: "7.50" },
      { ...fullDeal, conditions: "Dine in only" },
      { ...fullDeal, restaurant: null },
      { ...fullDeal, confidence: { ...confidence, hours: "high" } },
      { ...fullDeal, confidence: { restaurant: 1, priceCad: 1, hours: 1 } },
    ];
    for (const deal of bad) {
      expect(Deal.safeParse(deal).success).toBe(false);
    }
    expect(DealResult.safeParse({ isDeal: "yes", deals: [] }).success).toBe(false);
    expect(DealResult.safeParse({ isDeal: true }).success).toBe(false);
  });

  it("exports a JSON Schema usable as Gemini's responseJsonSchema", () => {
    const schema = z.toJSONSchema(DealResult) as {
      type: string;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["isDeal", "deals"]);
    expect(Object.keys(schema.properties)).toEqual(["isDeal", "deals"]);
  });
});
