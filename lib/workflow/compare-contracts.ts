import { z } from "zod";
import { publicUrl } from "./contracts";
import type { SearchRecord } from "./search-contracts";

export const comparisonInputSchema = z.object({
  dealIds: z.array(z.string().trim().min(1).max(128)).min(2).max(5),
  priority: z.enum(["value", "price", "taste"]).default("value"),
  // These excerpts are supplied by the integration, not fetched or verified by Gemini.
  tasteEvidence: z.array(z.object({
    dealId: z.string().min(1).max(128),
    quote: z.string().trim().min(10).max(500),
    sourceUrl: publicUrl,
    dish: z.string().trim().min(1).max(100).optional(),
  }).strict()).max(15).default([]),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.dealIds).size !== input.dealIds.length)
    ctx.addIssue({ code: "custom", message: "Choose distinct deals.", path: ["dealIds"] });
  for (const id of new Set(input.tasteEvidence.map(e => e.dealId))) {
    if (!input.dealIds.includes(id) || input.tasteEvidence.filter(e => e.dealId === id).length > 3)
      ctx.addIssue({ code: "custom", message: "Provide at most three excerpts per selected deal.", path: ["tasteEvidence"] });
  }
});

export const comparisonPlanSchema = z.object({
  suggestedDealId: z.string().max(128).nullable(),
  citedFactIds: z.array(z.string().max(80)).max(4),
}).strict();

export type ComparisonInput = z.infer<typeof comparisonInputSchema>;
export type ComparisonPlan = z.infer<typeof comparisonPlanSchema>;
export type ComparisonFact = {
  id: string; kind: "offer" | "price" | "discount" | "condition" | "taste";
  text: string; sourceUrl: string | null;
  provenance: "stored_offer" | "provided_review";
  dish?: string;
};
export type ComparisonRow = SearchRecord & {
  facts: ComparisonFact[]; caveats: string[];
  availability: "schedule_matches_now" | "outside_recorded_schedule" | "unknown";
};
export type ComparisonResult = {
  mode: "gemini" | "evidence_only"; priority: ComparisonInput["priority"];
  scope: "published_deals"; comparedAt: string;
  restaurants: ComparisonRow[];
  priceGroups: { currency: string; lowestListedPrice: number; dealIds: string[] }[];
  largestAdvertisedDiscount: { percent: number; dealIds: string[] } | null;
  recommendation: { dealId: string; label: string; reasons: ComparisonFact[]; caveats: string[] } | null;
  message: string; warnings: string[];
};
