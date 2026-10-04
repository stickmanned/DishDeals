import { compareRestaurants } from "../src/compare";
import { geminiComparison } from "../src/compare-gemini";
import type { SearchRecord } from "../src/search-contracts";
const base = { restaurantName: "Example Noodle A", title: "Noodle lunch special", description: "One noodle bowl lunch special.",
  price: 12, currency: "CAD", discountPercent: null, days: [], startTime: null, endTime: null, startDate: null, endDate: "2099-12-31",
  conditions: ["Dine-in only"], locationHint: null, addressHint: null, evidence: "Noodle lunch special", confidence: 1, warnings: [] };
const records: SearchRecord[] = ["a", "b"].map((id, index) => ({ dealId: `demo-${id}`, deal: { ...base, restaurantName: `Example Noodle ${id.toUpperCase()}`, price: index ? 15 : 12 },
  restaurant: { placeId: `demo-place-${id}`, name: `Example Noodle ${id.toUpperCase()}`, address: "Fictional demo address", latitude: 49.2, longitude: -123.1,
    city: "Vancouver", countryCode: "ca", categories: ["catering.restaurant"], matchScore: 1 }, sourceUrl: "https://example.com/demo-offer", timezone: "America/Vancouver" }));
const tasteEvidence = [
  { dealId: "demo-a", quote: "Fictional demo review: the broth was too salty.", sourceUrl: "https://example.com/demo-review-a" },
  { dealId: "demo-b", quote: "Fictional demo review: the broth was balanced and the noodles were springy.", sourceUrl: "https://example.com/demo-review-b" },
];
const fetcher: typeof fetch = async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ suggestedDealId: "demo-b", citedFactIds: ["taste-0"] }) }] } }] });
for (const priority of ["price", "value", "taste"] as const) {
  const result = await compareRestaurants({ dealIds: records.map(r => r.dealId), priority, ...(priority === "taste" ? { tasteEvidence } : {}) }, {
    records, ...(priority === "taste" ? geminiComparison({ apiKey: "mock-key-no-network", model: "mock-gemini", fetcher }) : {}),
  });
  console.log(JSON.stringify({ demo: true, provider: "mocked; no network calls", priority, mode: result.mode,
    recommendation: result.recommendation, message: result.message }, null, 2));
}
