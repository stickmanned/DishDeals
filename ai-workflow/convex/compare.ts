import { v, ConvexError } from "convex/values";
import { action, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwner } from "./auth";
import { outcomeSchema } from "../src/contracts";
import { comparisonInputSchema, type ComparisonResult } from "../src/compare-contracts";
import { compareRestaurants } from "../src/compare";
import { geminiComparison } from "../src/compare-gemini";
import { WorkflowError } from "../src/errors";
import type { SearchRecord } from "../src/search-contracts";

export const selected = internalQuery({ args: { dealIds: v.array(v.string()) }, handler: async (ctx, args): Promise<SearchRecord[]> => {
  // Read exact records, including offers older than the map's recent-record window.
  if (args.dealIds.length > 5) throw new ConvexError("Invalid comparison selection.");
  const rows: SearchRecord[] = [];
  for (const rawId of args.dealIds) {
    const id = ctx.db.normalizeId("deals", rawId);
    const record = id ? await ctx.db.get(id) : null;
    if (!record || record.status !== "published") continue;
    const outcome = outcomeSchema.parse(JSON.parse(record.dataJson));
    if (outcome.restaurant) rows.push({ dealId: record._id, deal: outcome.deal, restaurant: outcome.restaurant,
      sourceUrl: record.sourceUrl, timezone: record.timezone });
  }
  return rows;
} });

export const run = internalAction({ args: { inputJson: v.string(), owner: v.string() }, handler: async (ctx, args): Promise<ComparisonResult> => {
  let input;
  try { input = comparisonInputSchema.parse(JSON.parse(args.inputJson)); }
  catch { throw new ConvexError({ code: "INVALID_INPUT", message: "Select two to five distinct deals and a comparison priority." }); }
  await ctx.runMutation(internal.search.reserve, { owner: args.owner });
  const records = await ctx.runQuery(internal.compare.selected, { dealIds: input.dealIds });
  const key = process.env.GEMINI_API_KEY;
  const ai = key?.trim() ? geminiComparison({ apiKey: key,
    model: process.env.GEMINI_COMPARISON_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash", deadline: Date.now() + 65000 }) : {};
  try { return await compareRestaurants(input, { records, ...ai }); }
  catch (error) {
    if (error instanceof WorkflowError) throw new ConvexError({ code: error.code, message: error.message });
    throw new ConvexError({ code: "COMPARISON_FAILED", message: "Comparison failed. Try again later." });
  }
} });

export const find = action({ args: { inputJson: v.string() }, handler: async (ctx, args): Promise<ComparisonResult> => {
  const owner = await requireOwner(ctx);
  return ctx.runAction(internal.compare.run, { ...args, owner });
} });
