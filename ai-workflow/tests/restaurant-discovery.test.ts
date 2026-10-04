import { it, expect, vi } from "vitest";
import { geminiRestaurantDiscovery } from "../src/restaurant-discovery";
import { searchDeals, basicIntent } from "../src/search";
import { searchInputSchema, type RestaurantDiscovery } from "../src/search-contracts";
import { searchResultToMapDeals } from "../src/search-map";
import { deal, place, now, modelResponse, geoResponse } from "./fixtures";

const text = "Example Bistro is a restaurant at 123 Example Street, Richmond, Canada.";
const restaurant = { name: "Example Bistro", address: "123 Example Street, Richmond, Canada", city: "Richmond", countryCode: "ca",
  evidence: text, sourceIds: ["source-0"] };
const input = searchInputSchema.parse({ query: "Example Bistro", city: "Richmond", language: "en" });
const intent = basicIntent(input);
const groundedResponse = (extra: object = {}) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] },
  groundingMetadata: { webSearchQueries: ["Example Bistro Richmond"],
    groundingChunks: [{ web: { uri: "https://example.com/bistro", title: "Bistro website" } }],
    groundingSupports: [{ segment: { text }, groundingChunkIndices: [0] }],
    searchEntryPoint: { renderedContent: "<div>Google search suggestions</div>" }, ...extra } }] });
const config = (fetcher: typeof fetch) => ({ apiKey: "fake-private-key", model: "gemini-2.5-flash", fetcher });
const stored = [{ dealId: "offer-1", deal, restaurant: place, sourceUrl: null, timezone: "America/Vancouver" }];
const discovery: RestaurantDiscovery = { status: "found", provider: "gemini_google_search", summary: text,
  restaurants: [], sources: [{ id: "source-0", title: "Website", url: "https://example.com/bistro" }],
  citations: [{ text, sourceIds: ["source-0"] }], searchSuggestionsHtml: null, warnings: [] };

it("tries Gemini only after a stored search has no matches and uses a whole name phrase", async () => {
  const discover = vi.fn(async () => discovery);
  const match = await searchDeals({ query: "ramen", language: "en" }, { records: stored, now, discover });
  expect(match.recommendations).toHaveLength(1); expect(discover).not.toHaveBeenCalled();
  // Sharing the word Example must not cause an unrelated restaurant to count as a match.
  const miss = await searchDeals(input, { records: stored, now, discover });
  expect(discover).toHaveBeenCalledTimes(1); expect(miss.scope).toBe("web_restaurants");
  expect(miss.mode).toBe("gemini"); expect(miss.totalMatches).toBe(0); expect(miss.recommendations).toEqual([]);
});
it("does not discover unrelated places for a focused pitch or incomplete hard filters", async () => {
  const discover = vi.fn(async () => discovery);
  await searchDeals({ query: "Example Bistro", focusDealId: "missing" }, { records: [], now, discover });
  await searchDeals({ query: "nearby ramen" }, { records: [], now, discover });
  await searchDeals({ query: "ramen under $5" }, { records: [], now, discover });
  await searchDeals({ query: "ramen peanut allergy" }, { records: [], now, discover });
  expect(discover).not.toHaveBeenCalled();
});
it("handles no key, provider failures and invalid discovery data without exposing secrets", async () => {
  const noKey = await searchDeals(input, { records: [], now });
  expect(noKey.discovery?.status).toBe("unavailable"); expect(noKey.message).toContain("server-side Gemini");
  for (const discover of [async () => { throw new Error("fake-private-key"); }, async () => ({ ...discovery, sources: [{ id: "source-0", title: "Bad", url: "javascript:alert(1)" }] })]) {
    const result = await searchDeals(input, { records: [], now, discover });
    expect(result.discovery?.status).toBe("failed"); expect(JSON.stringify(result)).not.toContain("fake-private-key");
    expect(result.recommendations).toEqual([]);
  }
});
it("enables actual Google Search grounding, preserves sources and suggestions, and keeps unverified places off the map", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [restaurant] }));
  const result = await geminiRestaurantDiscovery(config(fetcher))(input, intent);
  expect(result.status).toBe("found"); expect(result.restaurants[0].place).toBeNull();
  expect(result.sources[0].url).toBe("https://example.com/bistro"); expect(result.citations[0].sourceIds).toEqual(["source-0"]);
  expect(result.searchSuggestionsHtml).toContain("Google search suggestions");
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.tools).toEqual([{ googleSearch: {} }]); expect(body.generationConfig.responseMimeType).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("fake-private-key");
  expect(result.restaurants[0].cta.url).toContain("maps/search/");
  expect(searchResultToMapDeals({ mode: "gemini", scope: "web_restaurants", intent, totalMatches: 0, recommendations: [], message: "", warnings: [], discovery: result })).toEqual([]);
});
it("rejects answers from memory, unusable URLs and fabricated citation spans", async () => {
  for (const extra of [
    { webSearchQueries: [] }, { groundingSupports: [] },
    { groundingChunks: [{ web: { uri: "javascript:alert(1)" } }] },
    { groundingSupports: [{ segment: { text: "An invented restaurant" }, groundingChunkIndices: [0] }] },
  ]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse(extra));
    const result = await geminiRestaurantDiscovery(config(fetcher))(input, intent);
    expect(result.status).toBe("failed"); expect(result.restaurants).toEqual([]); expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("drops invented restaurant identities, addresses, sources and mismatching cities", async () => {
  for (const edited of [
    { ...restaurant, name: "Invented Bistro" }, { ...restaurant, address: "999 Wrong Street" },
    { ...restaurant, sourceIds: ["invented"] }, { ...restaurant, evidence: "Fabricated evidence" },
  ]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [edited] }));
    expect((await geminiRestaurantDiscovery(config(fetcher))(input, intent)).restaurants).toEqual([]);
  }
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [restaurant] }));
  expect((await geminiRestaurantDiscovery(config(fetcher))(input, { ...intent, city: "Vancouver" })).restaurants).toEqual([]);
});
it("verifies branch coordinates independently and adapts a discovered restaurant without inventing an offer", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [restaurant, restaurant] }))
    .mockResolvedValueOnce(geoResponse([{ place_id: "richmond", country_code: "ca" }]))
    .mockResolvedValueOnce(geoResponse([{ place_id: "bistro-branch", name: "Example Bistro", formatted: restaurant.address,
      city: "Richmond", country_code: "ca", lat: 49.1666, lon: -123.1336, categories: ["catering.restaurant"] }]));
  const result = await geminiRestaurantDiscovery(config(fetcher), { geoapifyApiKey: "fake-geo-key" })(input, intent);
  expect(result.restaurants).toHaveLength(1); expect(result.restaurants[0].place?.placeId).toBe("bistro-branch");
  const mapped = searchResultToMapDeals({ mode: "gemini", scope: "web_restaurants", intent, totalMatches: 0, recommendations: [], message: "", warnings: [], discovery: result });
  expect(mapped).toHaveLength(1); expect(mapped[0].latitude).toBe(49.1666); expect(mapped[0].title).toContain("No confirmed offer");
  expect(mapped[0]).not.toHaveProperty("price"); expect(mapped[0]).not.toHaveProperty("discountPercent");
});
it("does not add ambiguous branches or branches outside a requested distance to the map", async () => {
  const branch = { place_id: "bistro-branch", name: "Example Bistro", formatted: restaurant.address,
    city: "Richmond", country_code: "ca", lat: 49.1666, lon: -123.1336, categories: ["catering.restaurant"] };
  for (const ambiguous of [true, false]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [restaurant] }))
      .mockResolvedValueOnce(geoResponse([{ place_id: "richmond", country_code: "ca" }]))
      .mockResolvedValueOnce(geoResponse(ambiguous ? [branch, { ...branch, place_id: "second" }] : [branch]));
    const result = await geminiRestaurantDiscovery(config(fetcher), { geoapifyApiKey: "fake" })({ ...input, origin: { latitude: 0, longitude: 0 } }, { ...intent, maxDistanceKm: 1 });
    if (ambiguous) expect(result.restaurants[0].place).toBeNull();
    else expect(result.restaurants).toEqual([]);
  }
});
it("retains cited search information if JSON extraction fails and marks unknown budgets", async () => {
  const broken = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ unexpected: true }));
  const summary = await geminiRestaurantDiscovery(config(broken))(input, intent);
  expect(summary.summary).toBe(text); expect(summary.warnings.join(" ")).toContain("could not be extracted");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(groundedResponse()).mockResolvedValueOnce(modelResponse({ restaurants: [restaurant] }));
  const result = await geminiRestaurantDiscovery(config(fetcher))(input, { ...intent, maxPrice: 10, currency: "CAD", availableNow: true });
  expect(result.restaurants[0].caveats.join(" ")).toContain("price and currency are unverified");
  expect(result.restaurants[0].caveats.join(" ")).toContain("availability are unverified");
});
