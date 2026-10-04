import { z } from "zod";
import { dealSchema, placeSchema, publicUrl } from "./contracts";
export const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(1000), language: z.enum(["zh", "en"]).default("zh"),
  origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  maxPrice: z.number().min(0).max(100000).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  maxDistanceKm: z.number().gt(0).max(200).optional(), availableNow: z.boolean().optional(),
  focusDealId: z.string().min(1).max(128).optional(), limit: z.number().int().min(1).max(5).default(3),
}).strict();
export const intentSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(80)).max(8),
  excludeKeywords: z.array(z.string().trim().min(1).max(80)).max(8),
  city: z.string().trim().min(1).max(100).nullable(), maxPrice: z.number().min(0).max(100000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(), maxDistanceKm: z.number().gt(0).max(200).nullable(),
  requiresOrigin: z.boolean(), availableNow: z.boolean(),
  sortBy: z.enum(["relevance", "distance", "price", "discount"]),
  unsupportedNeeds: z.array(z.string().max(200)).max(5),
}).strict();
export const searchRecordSchema = z.object({
  dealId: z.string(), deal: dealSchema, restaurant: placeSchema,
  sourceUrl: z.string().nullable(), timezone: z.string(),
});
export const recommendationPlanSchema = z.object({ selections: z.array(z.object({
  dealId: z.string().max(128), hookFactId: z.string().max(80),
  supportFactIds: z.array(z.string().max(80)).max(3),
  angle: z.enum(["value", "nearby", "craving", "discover"]),
})).max(5) }).strict();
export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchIntent = z.infer<typeof intentSchema>;
export type SearchRecord = z.infer<typeof searchRecordSchema>;
export type RecommendationPlan = z.infer<typeof recommendationPlanSchema>;
export type Fact = { id: string; text: string; kind: "offer" | "price" | "discount" | "distance" | "match" | "time" };
export type SearchCandidate = SearchRecord & { distanceKm: number | null; score: number; facts: Fact[]; caveats: string[] };
export type Recommendation = SearchCandidate & { pitch: string; whyGo: string[]; citedFactIds: string[];
  cta: { label: string; url: string } };
export const discoveredRestaurantSchema = z.object({
  id: z.string(), name: z.string().min(1).max(300), address: z.string().min(1).max(1000).nullable(),
  city: z.string().max(100).nullable(), evidence: z.string().min(1).max(1500),
  sourceIds: z.array(z.string()).min(1).max(10), place: placeSchema.nullable(),
  distanceKm: z.number().min(0).nullable(), caveats: z.array(z.string()),
  cta: z.object({ label: z.string(), url: publicUrl }),
});
export const discoverySchema = z.object({
  status: z.enum(["found", "empty", "unavailable", "failed"]),
  provider: z.literal("gemini_google_search"), summary: z.string().max(30000),
  restaurants: z.array(discoveredRestaurantSchema).max(5),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: publicUrl })).max(100),
  citations: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) })).max(100),
  searchSuggestionsHtml: z.string().max(200000).nullable(), warnings: z.array(z.string()),
});
export type RestaurantDiscovery = z.infer<typeof discoverySchema>;
export type DiscoveredRestaurant = z.infer<typeof discoveredRestaurantSchema>;
export const emptyDiscovery = (status: "unavailable" | "failed"): RestaurantDiscovery => ({
  status, provider: "gemini_google_search", summary: "", restaurants: [], sources: [], citations: [],
  searchSuggestionsHtml: null, warnings: [status === "unavailable" ?
    "Web restaurant search is unavailable until a server-side Gemini API key is configured." :
    "Web restaurant search is temporarily unavailable. Try again later."],
});
export type SearchResult = {
  mode: "gemini" | "basic"; scope: "published_deals" | "web_restaurants"; intent: SearchIntent;
  recommendations: Recommendation[]; message: string; warnings: string[]; totalMatches: number;
  discovery?: RestaurantDiscovery;
};
