import { it, expect, vi } from "vitest";
import { searchDeals, availableAt, basicIntent } from "../../lib/workflow/search";
import { geminiSearch } from "../../lib/workflow/search-gemini";
import { searchInputSchema, type SearchRecord, type SearchIntent } from "../../lib/workflow/search-contracts";
import type { SearchDependencies } from "../../lib/workflow/search";
import { toMapDeals } from "../../lib/workflow/search-map";
import { deal, place, now, modelResponse } from "./fixtures";
export const records: SearchRecord[] = [
  { dealId: "ramen-1", deal: { ...deal, price: 12, currency: "CAD" }, restaurant: place, sourceUrl: "https://example.com/deal", timezone: "America/Vancouver" },
  { dealId: "pizza-1", deal: { ...deal, restaurantName: "Example Pizza", title: "CAD 8 pizza", description: "Pizza for CAD 8", price: 8, currency: "CAD", discountPercent: null },
    restaurant: { ...place, name: "Example Pizza", placeId: "pizza", latitude: 49.19 }, sourceUrl: null, timezone: "America/Vancouver" },
  { dealId: "expired", deal: { ...deal, price: 5, currency: "CAD", endDate: "2026-10-02" }, restaurant: place, sourceUrl: null, timezone: "America/Vancouver" },
];
const aiIntent: SearchIntent = { keywords: ["ramen"], excludeKeywords: [], city: "Richmond", maxPrice: 15, currency: "CAD", maxDistanceKm: 3,
  requiresOrigin: true, availableNow: false, sortBy: "relevance", unsupportedNeeds: [] };
it("searches stored offers in Chinese without a key and provides truthful persuasive cards", async () => {
  const result = await searchDeals({ query: "附近拉面，预算 CAD 15", origin: { latitude: place.latitude, longitude: place.longitude } }, { records, now });
  expect(result.mode).toBe("basic"); expect(result.recommendations).toHaveLength(1);
  const recommendation = result.recommendations[0];
  expect(recommendation.dealId).toBe("ramen-1"); expect(recommendation.pitch).toContain("CAD 12");
  expect(recommendation.pitch).toContain("值得"); expect(recommendation.caveats).toContain("Dine-in only");
  expect(recommendation.cta.url).toContain("destination=49.1666,-123.1336");
  expect(recommendation.citedFactIds.every(id => recommendation.facts.some(f => f.id === id))).toBe(true);
});
it("understands query and chooses evidence using Gemini adapters", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse(aiIntent))
    .mockResolvedValueOnce(modelResponse({ selections: [{ dealId: "ramen-1", hookFactId: "price", supportFactIds: ["distance", "discount"], angle: "value" }] }));
  const result = await searchDeals({ query: "想吃附近划算的拉面", origin: { latitude: place.latitude, longitude: place.longitude } },
    { records, now, ...geminiSearch({ apiKey: "test", model: "gemini-2.5-flash", fetcher }, now()) });
  expect(result.mode).toBe("gemini"); expect(result.recommendations[0].pitch).toContain("更划算");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const request = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
  expect(request.systemInstruction.parts[0].text).toContain("UNTRUSTED");
  const data = JSON.parse(request.contents[0].parts[0].text);
  expect(data.candidates).toHaveLength(1); expect(data.candidates[0].dealId).toBe("ramen-1");
});
it("does not pass private or expired deals to the model shortlist", async () => {
  const recommend = vi.fn<NonNullable<SearchDependencies["recommend"]>>(async () => ({ selections: [{ dealId: "ramen-1", hookFactId: "offer", supportFactIds: [], angle: "discover" as const }] }));
  const result = await searchDeals({ query: "ramen" }, { records, now, understand: async () => ({ ...aiIntent, maxPrice: null, currency: null, requiresOrigin: false, maxDistanceKm: null }), recommend });
  expect(result.recommendations.map(r => r.dealId)).toEqual(["ramen-1"]);
  expect(recommend.mock.calls[0][2].map(c => c.dealId)).not.toContain("expired");
});
it("never computes a final price from a percent discount or mixes currencies", async () => {
  const result = await searchDeals({ query: "拉面", maxPrice: 15, currency: "CAD" }, { records: [
    { ...records[0], dealId: "unknown-price", deal: { ...deal, price: null } },
    { ...records[0], dealId: "usd", deal: { ...deal, price: 10, currency: "USD" } },
  ], now });
  expect(result.recommendations).toHaveLength(0);
});
it("asks for missing location/currency and does not call recommendation", async () => {
  const recommend = vi.fn();
  const nearby = await searchDeals({ query: "附近拉面" }, { records, now, recommend });
  expect(nearby.recommendations).toEqual([]); expect(nearby.message).toContain("位置");
  const budget = await searchDeals({ query: "ramen under $15" }, { records, now, recommend });
  expect(budget.message).toContain("币种"); expect(recommend).not.toHaveBeenCalled();
});
it("does not relax a user's hard filters to promote a restaurant", async () => {
  const result = await searchDeals({ query: "ramen", maxPrice: 5, currency: "CAD" }, { records, now, understand: async () => ({ ...aiIntent, maxPrice: 1000, currency: "USD", requiresOrigin: false, maxDistanceKm: null }) });
  expect(result.intent.maxPrice).toBe(5); expect(result.intent.currency).toBe("CAD"); expect(result.recommendations).toEqual([]);
});
it("rejects invented deal IDs, evidence and unsupported promotional angles", async () => {
  for (const selection of [
    { dealId: "invented", hookFactId: "offer", supportFactIds: [], angle: "discover" as const },
    { dealId: "ramen-1", hookFactId: "five-star-rating", supportFactIds: [], angle: "value" as const },
    { dealId: "ramen-1", hookFactId: "offer", supportFactIds: [], angle: "nearby" as const },
  ]) {
    const result = await searchDeals({ query: "ramen" }, { records, now, understand: async () => ({ ...aiIntent, maxPrice: null, currency: null, requiresOrigin: false, maxDistanceKm: null }),
      recommend: async () => ({ selections: [selection] }) });
    expect(result.warnings).toHaveLength(1); expect(result.recommendations[0].dealId).toBe("ramen-1");
    expect(result.recommendations[0].pitch).not.toContain("five-star-rating");
  }
});
it("supports focused restaurant persuasion without promoting excluded offers", async () => {
  const result = await searchDeals({ query: "帮我选一个", focusDealId: "pizza-1", limit: 1 }, { records, now });
  expect(result.recommendations).toHaveLength(1); expect(result.recommendations[0].restaurant.name).toBe("Example Pizza");
  const excluded = await searchDeals({ query: "帮我选一个", focusDealId: "pizza-1", maxPrice: 5, currency: "CAD" }, { records, now });
  expect(excluded.recommendations).toEqual([]);
});
it("matches active schedules including overnight offers on the previous weekday", () => {
  const overnight = { ...records[0], deal: { ...records[0].deal, days: ["Friday" as const], startTime: "22:00", endTime: "02:00" } };
  expect(availableAt(overnight, new Date("2026-10-03T08:00:00Z"))).toBe(true); // Sat 01:00, Friday's offer
  expect(availableAt(overnight, new Date("2026-10-03T09:00:00Z"))).toBe(false); // End is exclusive
  expect(availableAt({ ...overnight, deal: { ...overnight.deal, startTime: null } }, now())).toBe(false);
  expect(availableAt({ ...overnight, deal: { ...overnight.deal, startDate: "2026-10-10" } }, now())).toBe(false);
});
it("filters distance and availableNow, with no fake walking time", async () => {
  const result = await searchDeals({ query: "拉面", origin: { latitude: place.latitude, longitude: place.longitude }, maxDistanceKm: 1,
    availableNow: true }, { records, now: () => new Date("2026-10-07T01:00:00Z") }); // Tue 18:00
  expect(result.recommendations).toHaveLength(1); expect(result.recommendations[0].pitch).not.toContain("分钟");
  const closed = await searchDeals({ query: "拉面", availableNow: true }, { records, now }); // Saturday
  expect(closed.recommendations).toEqual([]);
});
it("avoids excluded cuisines and prompts on unverifiable hard requirements", async () => {
  expect(basicIntent(searchInputSchema.parse({ query: "不要拉面，披萨优惠" })).excludeKeywords).toEqual(["ramen"]);
  const result = await searchDeals({ query: "不要拉面，披萨优惠" }, { records, now });
  expect(result.recommendations.map(r => r.dealId)).toEqual(["pizza-1"]);
  const allergy = await searchDeals({ query: "拉面，花生过敏安全" }, { records, now });
  expect(allergy.recommendations).toEqual([]); expect(allergy.message).toContain("确认");
});
it("falls back clearly when AI fails and preserves all offer conditions", async () => {
  const result = await searchDeals({ query: "ramen", language: "en" }, { records, now, understand: async () => { throw new Error("secret key"); } });
  expect(result.mode).toBe("basic"); expect(result.warnings).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("secret key"); expect(result.recommendations[0].caveats).toContain("Dine-in only");
});
it("honors explicit currency and city filters and uses a bounded nearby radius", async () => {
  const result = await searchDeals({ query: "拉面", city: "列治文", currency: "USD" }, { records, now });
  expect(result.recommendations).toEqual([]);
  const near = await searchDeals({ query: "附近拉面", origin: { latitude: 0, longitude: 0 } }, { records, now });
  expect(near.intent.maxDistanceKm).toBe(5); expect(near.recommendations).toEqual([]);
});
it("keeps explicit cheapest sorting when AI tries to select a pricier option", async () => {
  const result = await searchDeals({ query: "最便宜的优惠", currency: "CAD", limit: 1 }, { records, now,
    understand: async () => ({ ...aiIntent, keywords: [], city: null, maxPrice: null, maxDistanceKm: null, requiresOrigin: false, sortBy: "price" }),
    recommend: async () => ({ selections: [{ dealId: "ramen-1", hookFactId: "price", supportFactIds: [], angle: "value" }] }) });
  expect(result.recommendations[0].dealId).toBe("pizza-1"); expect(result.warnings).toHaveLength(1);
});
it("adapts recommendations to the existing map component with stable IDs and verified coordinates", async () => {
  const result = await searchDeals({ query: "ramen" }, { records, now });
  const [mapped] = toMapDeals(result.recommendations);
  expect(mapped.id).toBe("ramen-1"); expect(mapped.latitude).toBe(place.latitude);
  expect(mapped.longitude).toBe(place.longitude); expect(mapped.price).toBe(12);
  expect(mapped).not.toHaveProperty("pitch");
});

it("uses Vancouver permanent-UTC7 for November availability and overnight days", () => {
  const timed = { ...records[0], deal: { ...records[0].deal, startDate: null, endDate: null, days: ["Monday" as const], startTime: "00:00", endTime: "01:00" } };
  const instant = new Date("2026-11-02T07:30:00Z");
  expect(availableAt(timed, instant)).toBe(true); // Monday00:30 Vancouver
  expect(availableAt({ ...timed, timezone: "America/Los_Angeles" }, instant)).toBe(false); // Sunday23:30 LosAngeles
  expect(availableAt(timed, new Date("2026-11-02T08:00:00Z"))).toBe(false);
  const overnight = { ...timed, deal: { ...timed.deal, days: ["Sunday" as const], startTime: "22:00", endTime: "01:00" } };
  expect(availableAt(overnight, instant)).toBe(true);
  expect(availableAt(overnight, new Date("2026-11-02T08:00:00Z"))).toBe(false);
});
