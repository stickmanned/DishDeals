import { it, expect, vi } from "vitest";
import { compareRestaurants } from "../../lib/workflow/compare";
import { geminiComparison } from "../../lib/workflow/compare-gemini";
import type { SearchRecord } from "../../lib/workflow/search-contracts";
import { deal, place, now, modelResponse } from "./fixtures";

export const records: SearchRecord[] = [
  { dealId: "a", deal: { ...deal, price: 12, currency: "CAD" }, restaurant: { ...place, placeId: "place-a" },
    sourceUrl: "https://example.com/offer-a", timezone: "America/Vancouver" },
  { dealId: "b", deal: { ...deal, restaurantName: "Example Bistro", title: "Lunch special", price: 18, currency: "CAD", discountPercent: null,
    conditions: ["Weekdays only", "One offer per person"] }, restaurant: { ...place, name: "Example Bistro", placeId: "place-b" },
    sourceUrl: "https://example.com/offer-b", timezone: "America/Vancouver" },
];
const selected = { dealIds: ["a", "b"] };
const tasteEvidence = [
  { dealId: "a", quote: "The ramen broth was richly savory, with springy noodles.", sourceUrl: "https://example.com/reviews-a", dish: "Ramen" },
  { dealId: "b", quote: "The lunch noodles were bland and slightly overcooked.", sourceUrl: "https://example.com/reviews-b" },
];

it("shows prices, restrictions and unknown taste without pretending basic output is AI", async () => {
  const result = await compareRestaurants(selected, { records, now });
  expect(result.mode).toBe("evidence_only"); expect(result.recommendation).toBeNull();
  expect(result.priceGroups).toEqual([{ currency: "CAD", lowestListedPrice: 12, dealIds: ["a"] }]);
  expect(result.largestAdvertisedDiscount).toEqual({ percent: 50, dealIds: ["a"] });
  expect(result.restaurants[0].caveats).toContain("Dine-in only");
  expect(result.restaurants[1].facts.some(f => f.text === "Weekdays only")).toBe(true);
  expect(result.restaurants[0].availability).toBe("outside_recorded_schedule");
});

it("uses deterministic price ranking without letting AI choose a higher price", async () => {
  const recommend = vi.fn();
  const result = await compareRestaurants({ ...selected, priority: "price" }, { records, now, recommend });
  expect(result.recommendation?.dealId).toBe("a"); expect(result.recommendation?.label).toBe("Lowest listed offer price");
  expect(recommend).not.toHaveBeenCalled();
});

it.each(["missing", "mixed", "tie"])("does not declare an overall price winner for %s prices", async kind => {
  const changed = structuredClone(records);
  if (kind === "missing") changed[1].deal.price = null;
  if (kind === "mixed") changed[1].deal.currency = "USD";
  if (kind === "tie") changed[1].deal.price = 12;
  const result = await compareRestaurants({ ...selected, priority: "price" }, { records: changed, now });
  expect(result.recommendation).toBeNull();
  if (kind === "mixed") expect(result.priceGroups.map(g => g.currency)).toEqual(["CAD", "USD"]);
  if (kind === "tie") expect(result.priceGroups[0].dealIds).toEqual(["a", "b"]);
});

it("does not derive prices or monetary savings from a percentage discount", async () => {
  const changed = structuredClone(records); changed.forEach(r => { r.deal.price = null; r.deal.currency = null; });
  const result = await compareRestaurants(selected, { records: changed, now });
  expect(result.priceGroups).toEqual([]);
  expect(result.restaurants.flatMap(r => r.facts).some(f => f.kind === "price")).toBe(false);
  expect(result.warnings.join(" ")).toContain("estimated savings");
});

it("abstains from taste ranking with partial review coverage and keeps negative evidence", async () => {
  const recommend = vi.fn();
  const result = await compareRestaurants({ ...selected, priority: "taste", tasteEvidence: [tasteEvidence[1]] }, { records, now, recommend });
  expect(result.recommendation).toBeNull(); expect(recommend).not.toHaveBeenCalled();
  expect(result.message).toContain("every selected restaurant");
  expect(result.restaurants[1].facts.find(f => f.kind === "taste")?.text).toBe(tasteEvidence[1].quote);
});

it("makes a taste-focused suggestion from exact quoted evidence with provenance and dish", async () => {
  const result = await compareRestaurants({ ...selected, priority: "taste", tasteEvidence }, {
    records, now, recommend: async () => ({ suggestedDealId: "a", citedFactIds: ["taste-0", "price"] }),
  });
  expect(result.mode).toBe("gemini"); expect(result.recommendation?.dealId).toBe("a");
  expect(result.recommendation?.reasons[0]).toMatchObject({ text: tasteEvidence[0].quote, sourceUrl: tasteEvidence[0].sourceUrl,
    provenance: "provided_review", dish: "Ramen" });
  expect(result.recommendation?.caveats.join(" ")).toContain("not been independently verified");
});

it.each([
  { suggestedDealId: "invented", citedFactIds: ["price"] },
  { suggestedDealId: "a", citedFactIds: ["invented-rating"] },
  { suggestedDealId: "a", citedFactIds: ["price"] },
  { suggestedDealId: null, citedFactIds: ["taste-0"] },
  { suggestedDealId: "a", citedFactIds: ["taste-0", "taste-0"] },
])("rejects unsupported taste evidence plans %#", async plan => {
  const result = await compareRestaurants({ ...selected, priority: "taste", tasteEvidence }, { records, now, recommend: async () => plan });
  expect(result.mode).toBe("evidence_only"); expect(result.recommendation).toBeNull();
  expect(result.warnings.join(" ")).toContain("unsupported evidence");
});

it("accepts AI abstention and falls back safely on provider failure", async () => {
  const abstain = await compareRestaurants(selected, { records, now, recommend: async () => ({ suggestedDealId: null, citedFactIds: [] }) });
  expect(abstain.mode).toBe("gemini"); expect(abstain.recommendation).toBeNull();
  const failed = await compareRestaurants(selected, { records, now, recommend: async () => { throw new Error("private provider response"); } });
  expect(failed.mode).toBe("evidence_only"); expect(JSON.stringify(failed)).not.toContain("private provider response");
});

it("rejects duplicate, missing, expired and same-location selections", async () => {
  await expect(compareRestaurants({ dealIds: ["a", "a"] }, { records, now })).rejects.toThrow("distinct");
  await expect(compareRestaurants({ dealIds: ["a", "missing"] }, { records, now })).rejects.toThrow("unavailable");
  const changed = structuredClone(records); changed[1].deal.endDate = "2026-10-02";
  await expect(compareRestaurants(selected, { records: changed, now })).rejects.toThrow("expired");
  changed[1].deal.endDate = "2026-10-31"; changed[1].restaurant.placeId = changed[0].restaurant.placeId;
  await expect(compareRestaurants(selected, { records: changed, now })).rejects.toThrow("different restaurant");
});

it("rejects review sources and excerpts that do not belong to selected deals", async () => {
  await expect(compareRestaurants({ ...selected, tasteEvidence: [{ ...tasteEvidence[0], dealId: "unknown" }] }, { records, now })).rejects.toThrow("Select");
  await expect(compareRestaurants({ ...selected, tasteEvidence: [{ ...tasteEvidence[0], sourceUrl: "javascript:alert(1)" }] }, { records, now })).rejects.toThrow("Select");
});

it("keeps unknown schedules and future starts distinct from availability now", async () => {
  const changed = structuredClone(records);
  changed[0].deal.startTime = null; changed[0].deal.endTime = null;
  changed[1].deal.startTime = null; changed[1].deal.endTime = null; changed[1].deal.startDate = "2026-10-04";
  const result = await compareRestaurants(selected, { records: changed, now });
  expect(result.restaurants.map(r => r.availability)).toEqual(["unknown", "outside_recorded_schedule"]);
});

it("calls Gemini with structured evidence and rejects invented free-form claims", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ suggestedDealId: "a", citedFactIds: ["taste-0"] }));
  const result = await compareRestaurants({ ...selected, priority: "taste", tasteEvidence }, { records, now,
    ...geminiComparison({ apiKey: "fake-private-key", model: "gemini-2.5-flash", fetcher }) });
  expect(result.mode).toBe("gemini"); expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.generationConfig.responseMimeType).toBe("application/json");
  expect(body.systemInstruction.parts[0].text).toContain("UNTRUSTED DATA");
  expect(body.contents[0].parts[0].text).toContain(tasteEvidence[0].quote);
  expect(JSON.stringify(result)).not.toContain("fake-private-key");
  const invalid = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ suggestedDealId: "a", citedFactIds: ["price"], claim: "The best food in Vancouver!" }));
  const bad = await compareRestaurants(selected, { records, now, ...geminiComparison({ apiKey: "fake-private-key", model: "gemini-2.5-flash", fetcher: invalid }) });
  expect(bad.mode).toBe("evidence_only"); expect(bad.recommendation).toBeNull();
});
