import { v, ConvexError } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOwner } from "./auth";
import { outcomeSchema } from "../../lib/workflow/contracts";
import { searchInputSchema, type SearchRecord, type SearchResult } from "../../lib/workflow/search-contracts";
import { searchDeals } from "../../lib/workflow/search";
import { providerUsageAuthorized } from "../../lib/workflow/workflow";
import { geminiSearch } from "../../lib/workflow/search-gemini";
import { supplementEmptySearch } from "../../lib/workflow/web-discovery";

export const catalog = internalQuery({ args: { focusDealId: v.optional(v.string()) }, handler: async (ctx, args): Promise<SearchRecord[]> => {
  const id = args.focusDealId ? ctx.db.normalizeId("workflowDeals", args.focusDealId) : null;
  const focused = id ? await ctx.db.get(id) : null;
  const records = args.focusDealId ? focused?.status === "published" ? [focused] : [] :
    await ctx.db.query("workflowDeals").withIndex("by_status_and_createdAt", q => q.eq("status", "published")).order("desc").take(500);
  return records.flatMap(record => {
    const outcome = outcomeSchema.parse(JSON.parse(record.dataJson));
    return outcome.restaurant ? [{ dealId: record._id, deal: outcome.deal, restaurant: outcome.restaurant,
      sourceUrl: record.sourceUrl, timezone: record.timezone }] : [];
  });
} });
export const reserve = internalMutation({ args: { owner: v.string() }, handler: async (ctx, args) => {
  const now = Date.now();
  const limit = await ctx.db.query("workflowSearchLimits").withIndex("by_owner", q => q.eq("owner", args.owner)).unique();
  if (!limit) { await ctx.db.insert("workflowSearchLimits", { owner: args.owner, windowStart: now, count: 1 }); return; }
  if (now - limit.windowStart >= 3600000) { await ctx.db.patch(limit._id, { windowStart: now, count: 1 }); return; }
  if (limit.count >= 60) throw new ConvexError("Search limit reached (60 per hour). Try again later.");
  await ctx.db.patch(limit._id, { count: limit.count + 1 });
} });
export const run = internalAction({ args: { inputJson: v.string(), owner: v.string() }, handler: async (ctx, args): Promise<SearchResult> => {
  let raw: unknown;
  try { raw = JSON.parse(args.inputJson); } catch { throw new ConvexError("Invalid search JSON."); }
  const parsed = searchInputSchema.safeParse(raw);
  if (!parsed.success) throw new ConvexError("Invalid search query or filters.");
  await ctx.runMutation(internal.workflow.search.reserve, { owner: args.owner });
  const records = await ctx.runQuery(internal.workflow.search.catalog, { focusDealId: parsed.data.focusDealId });
  const now = new Date(), key = providerUsageAuthorized(process.env) ? process.env.GEMINI_API_KEY : undefined;
  const config = key?.trim() ? { apiKey: key, model: process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash",
    deadline: Date.now() + 90000 } : null;
  const ai = config ? geminiSearch(config, now) : {};
  const result = await searchDeals(parsed.data, { records, now: () => now, ...ai });
  return supplementEmptySearch(result, parsed.data, config ? { ...config,
    model: process.env.GEMINI_WEB_SEARCH_MODEL || config.model } : null, now);
} });
export const find = action({ args: { inputJson: v.string() }, handler: async (ctx, args): Promise<SearchResult> => {
  const owner = await requireOwner(ctx);
  return ctx.runAction(internal.workflow.search.run, { ...args, owner });
} });
