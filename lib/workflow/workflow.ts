import { inputSchema, resultSchema, extractionSchema, type WorkflowInput, type Extraction, type Deal, type Place, type Outcome, type WorkflowResult } from "./contracts";
import { WorkflowError } from "./errors";
import { extractWithGemini } from "./gemini";
import { findRestaurant } from "./geoapify";
import type { Fetch } from "./network";

export type Dependencies = {
  extract: (input: WorkflowInput) => Promise<Extraction>;
  locate: (deal: Deal, input: WorkflowInput) => Promise<Place[]>;
  now?: () => Date;
};
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function assess(deal: Deal, candidates: Place[], input: WorkflowInput, now: Date): Outcome {
  const today = localDate(now, input.context.timezone);
  const reviewReasons = [...deal.warnings];
  const expired = !!deal.endDate && deal.endDate < today;
  if (expired) reviewReasons.push("The offer has expired.");
  if (deal.confidence < 0.88) reviewReasons.push("Extraction confidence is below 0.88.");
  if (deal.price !== null && deal.currency === null) reviewReasons.push("Price currency is not specified.");
  if (!deal.endDate && !deal.days.length) reviewReasons.push("Offer validity or recurring days are unknown.");
  if (!input.source.publishedAt) reviewReasons.push("Source publication date is unknown; confirm the offer is still valid.");
  else {
    const age = (Date.parse(today) - Date.parse(input.source.publishedAt)) / 86400000;
    if (age > 90 || age < 0) reviewReasons.push("Source is old or has a future publication date.");
  }
  if (!deal.addressHint && !deal.locationHint) reviewReasons.push("The source does not identify the restaurant branch or city.");
  const best = candidates[0];
  const ambiguous = candidates.length > 1 && best.matchScore - candidates[1].matchScore < 0.12;
  const restaurant = best && best.matchScore >= 0.85 && !ambiguous ? best : null;
  if (deal.addressHint && best && best.matchScore < 0.99) reviewReasons.push("The source address does not match the verified restaurant address.");
  if (!best) reviewReasons.push("No real restaurant was found in Geoapify.");
  else if (!restaurant) reviewReasons.push("Restaurant match is weak or multiple branches match.");
  return { deal, restaurant, candidates, reviewReasons: [...new Set(reviewReasons)],
    status: expired ? "rejected" : reviewReasons.length ? "needs_review" : "ready" };
}
export async function processDeal(raw: unknown, dependencies: Dependencies): Promise<WorkflowResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new WorkflowError("INVALID_INPUT", "Invalid source or location context. Check the API contract.");
  const input = parsed.data, now = dependencies.now?.() ?? new Date();
  const extracted = extractionSchema.parse(await dependencies.extract(input));
  const outcomes: Outcome[] = [];
  const cache = new Map<string, Place[]>();
  for (const deal of extracted.deals) {
    const key = JSON.stringify([deal.restaurantName, deal.locationHint, deal.addressHint]);
    let candidates = cache.get(key), locationWarning: string | undefined;
    if (!candidates) {
      try { candidates = await dependencies.locate(deal, input); cache.set(key, candidates); }
      catch (error) {
        if (!(error instanceof WorkflowError)) throw error;
        candidates = []; locationWarning = `Location provider failed: ${error.message} Retry to resolve the restaurant.`;
      }
    }
    const outcome = assess(deal, candidates, input, now);
    if (locationWarning) outcome.reviewReasons.push(locationWarning);
    outcomes.push(outcome);
  }
  return resultSchema.parse({ version: 1, source: { type: input.source.type,
    url: input.source.type === "url" ? input.source.url : input.source.sourceUrl ?? null,
    publishedAt: input.source.publishedAt ?? null, contentHash: await fingerprint(input), processedAt: now.toISOString() },
    timezone: input.context.timezone, outcomes, rejectionReason: extracted.rejectionReason });
}
// GUARD (N-REMOTE-A correction): live Gemini/Geoapify calls need an explicit, separate usage authorization.
export const providerUsageAuthorized = (env: Record<string, string | undefined>) => env.WORKFLOW_PROVIDER_USAGE_AUTHORIZED === "true";
export function liveDependencies(env: Record<string, string | undefined>, fetcher?: Fetch): Dependencies {
  if (!env.GEMINI_API_KEY?.trim()) throw new WorkflowError("MISSING_API_KEY", "Set GEMINI_API_KEY in the backend environment.");
  if (!env.GEOAPIFY_API_KEY?.trim()) throw new WorkflowError("MISSING_API_KEY", "Set GEOAPIFY_API_KEY in the backend environment.");
  if (!providerUsageAuthorized(env)) throw new WorkflowError("CONFIGURATION", "Provider usage is not authorized for this deployment (WORKFLOW_PROVIDER_USAGE_AUTHORIZED).");
  const deadline = Date.now() + 240000;
  return {
    extract: input => extractWithGemini(input, { apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL || "gemini-3.8-flash",
      fallbackModel: env.GEMINI_FALLBACK_MODEL, fetcher, deadline }),
    locate: (deal, input) => findRestaurant(deal, input, { apiKey: env.GEOAPIFY_API_KEY!, fetcher, deadline }),
  };
}
