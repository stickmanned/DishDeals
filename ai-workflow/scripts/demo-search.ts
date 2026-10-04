import { mkdir, writeFile } from "node:fs/promises";
import { searchDeals } from "../src/search";
import { deal, place } from "../tests/fixtures";
import type { SearchRecord } from "../src/search-contracts";
const records: SearchRecord[] = [
  { dealId: "demo-ramen", deal: { ...deal, price: 12, currency: "CAD" }, restaurant: place, sourceUrl: null, timezone: "America/Vancouver" },
  { dealId: "demo-pizza", deal: { ...deal, restaurantName: "Example Pizza", title: "Pizza for CAD 8", description: "Pizza for CAD 8",
      price: 8, currency: "CAD", discountPercent: null }, restaurant: { ...place, name: "Example Pizza", placeId: "pizza", latitude: 49.18 }, sourceUrl: null, timezone: "America/Vancouver" },
];
const query = process.argv[2] ?? "附近拉面，预算 CAD 15";
const result = await searchDeals({ query, origin: { latitude: 49.17, longitude: -123.13 } }, {
  records, now: () => new Date("2026-10-03T20:00:00Z"),
});
await mkdir("output", { recursive: true });
await writeFile("output/demo-search.json", JSON.stringify(result, null, 2));
console.log("OFFLINE SEARCH DEMO — fictional stored offers, basic search, no API calls.");
console.log(result.message);
for (const recommendation of result.recommendations) {
  console.log(`\n${recommendation.restaurant.name}\n${recommendation.pitch}\n条件：${recommendation.caveats.join(" ")}\n${recommendation.cta.label}：${recommendation.cta.url}`);
}
console.log("\nSaved output/demo-search.json");
