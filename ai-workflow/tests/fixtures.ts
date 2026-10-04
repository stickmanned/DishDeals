import type { Deal, Place } from "../src/contracts";
export const deal: Deal = {
  restaurantName: "Example Ramen", title: "50% off ramen", description: "50% off selected ramen bowls every Tuesday.",
  price: null, currency: null, discountPercent: 50, days: ["Tuesday"], startTime: "17:00", endTime: "21:00",
  startDate: null, endDate: "2026-10-31", conditions: ["Dine-in only"], locationHint: "Richmond",
  addressHint: "123 Example Street", evidence: "50% off selected ramen bowls every Tuesday", confidence: 0.95, warnings: [],
};
export const input = { source: { type: "text" as const,
  text: "Example Ramen Richmond: 50% off selected ramen bowls every Tuesday. Dine-in only. At 123 Example Street. Valid through October 31, 2026.",
  publishedAt: "2026-10-03" } };
export const place: Place = { placeId: "geoapify-example", name: "Example Ramen", address: "123 Example Street, Richmond, BC, Canada",
  latitude: 49.1666, longitude: -123.1336, city: "Richmond", countryCode: "ca", categories: ["catering.restaurant"], matchScore: 1 };
export const now = () => new Date("2026-10-03T20:00:00Z");
export const modelResponse = (data: unknown) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }] });
export const geoResponse = (features: object[]) => Response.json({ features: features.map(properties => ({ properties })) });
