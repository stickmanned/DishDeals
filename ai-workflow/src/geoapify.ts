import { z } from "zod";
import { placeSchema, type Deal, type Place, type WorkflowInput } from "./contracts";
import { fetchJson, type Fetch } from "./network";
import { WorkflowError } from "./errors";

const featureSchema = z.object({ properties: z.object({
  place_id: z.string(), name: z.string().optional(), formatted: z.string().optional(),
  address_line1: z.string().optional(), address_line2: z.string().optional(),
  city: z.string().optional(), country_code: z.string().optional(),
  lat: z.number().optional(), lon: z.number().optional(), categories: z.array(z.string()).optional(),
}) });
const collectionSchema = z.object({ features: z.array(featureSchema) });
export const normalizeName = (s: string) => s.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function similarity(a: string, b: string) {
  const left = normalizeName(a), right = normalizeName(b);
  if (left === right) return 1;
  const aWords = new Set(left.split(" ")), bWords = new Set(right.split(" "));
  const common = [...aWords].filter(w => bWords.has(w)).length;
  return common / Math.max(aWords.size, bWords.size);
}
function addressMatches(hint: string | null, address: string) {
  if (!hint) return false;
  const words = normalizeName(hint).split(" ");
  const actual = new Set(normalizeName(address).split(" "));
  // An address needs a street number and enough street tokens; a city name alone proves no branch.
  return words.some(w => /^\d+[a-z]?$/.test(w)) && words.length >= 3 && words.every(w => actual.has(w));
}
export async function findRestaurant(deal: Pick<Deal, "restaurantName" | "locationHint" | "addressHint">, input: Pick<WorkflowInput, "context">,
  config: { apiKey: string; fetcher?: Fetch; deadline?: number }): Promise<Place[]> {
  const area = deal.locationHint ?? input.context.city;
  const geo = new URL("https://api.geoapify.com/v1/geocode/search");
  geo.search = new URLSearchParams({ text: `${area}, ${input.context.region}`, type: "city",
    filter: `countrycode:${input.context.countryCode}`, limit: "1", apiKey: config.apiKey }).toString();
  const geoParsed = collectionSchema.safeParse(await fetchJson(geo.toString(), {}, "Geoapify", config.fetcher, { deadline: config.deadline, timeoutMs: 15000 }));
  if (!geoParsed.success) throw new WorkflowError("INVALID_PROVIDER_RESPONSE", "Geoapify returned invalid location data.");
  const boundary = geoParsed.data.features[0]?.properties;
  if (!boundary || boundary.country_code !== input.context.countryCode) return [];
  const places = new URL("https://api.geoapify.com/v2/places");
  places.search = new URLSearchParams({ categories: "catering", name: deal.restaurantName,
    filter: `place:${boundary.place_id}`, limit: "20", apiKey: config.apiKey }).toString();
  const parsed = collectionSchema.safeParse(await fetchJson(places.toString(), {}, "Geoapify", config.fetcher, { deadline: config.deadline, timeoutMs: 15000 }));
  if (!parsed.success) throw new WorkflowError("INVALID_PROVIDER_RESPONSE", "Geoapify returned invalid restaurant data.");
  const candidates = new Map<string, Place>();
  for (const feature of parsed.data.features) {
    const p = feature.properties;
    if (p.country_code !== input.context.countryCode || !p.name || !p.categories?.some(c => c.startsWith("catering"))) continue;
    const address = p.formatted ?? [p.address_line1, p.address_line2].filter(Boolean).join(", ");
    const nameScore = similarity(deal.restaurantName, p.name);
    const score = Math.min(1, nameScore * 0.85 + (addressMatches(deal.addressHint, address) ? 0.15 : 0));
    const place = placeSchema.safeParse({ placeId: p.place_id, name: p.name, address,
      latitude: p.lat, longitude: p.lon, city: p.city ?? null, countryCode: p.country_code ?? null,
      categories: p.categories, matchScore: score });
    if (place.success && nameScore >= 0.5) candidates.set(p.place_id, place.data);
  }
  return [...candidates.values()].sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
}
