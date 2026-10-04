import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { outcomeSchema } from "../src/contracts";
import { localDate } from "../src/workflow";
import { requireOwner } from "./auth";

async function list(ctx: QueryCtx, limit: number, bounds?: { west: number; east: number; south: number; north: number }) {
  // Bound the database scan. A larger deployment can add a geospatial component.
  const records = await ctx.db.query("deals").withIndex("by_status", q => q.eq("status", "published")).order("desc").take(500);
  const now = new Date();
  return records.flatMap(record => {
    const outcome = outcomeSchema.parse(JSON.parse(record.dataJson)), p = outcome.restaurant;
    if (!p || outcome.deal.endDate && outcome.deal.endDate < localDate(now, record.timezone)) return [];
    if (bounds && (p.longitude < bounds.west || p.longitude > bounds.east || p.latitude < bounds.south || p.latitude > bounds.north)) return [];
    return [{ dealId: record._id, restaurantId: record.restaurantId, ...outcome.deal,
      restaurant: p, sourceUrl: record.sourceUrl, timezone: record.timezone, createdAt: record.createdAt }];
  }).slice(0, Math.min(100, Math.max(1, Math.floor(limit))));
}
const listArgs = { limit: v.optional(v.number()), bounds: v.optional(v.object({ west: v.number(), east: v.number(), south: v.number(), north: v.number() })) };
export const listForMap = query({ args: listArgs, handler: (ctx, args) => list(ctx, args.limit ?? 100, args.bounds) });
export const listInternal = internalQuery({ args: listArgs, handler: (ctx, args) => list(ctx, args.limit ?? 100, args.bounds) });
async function review(ctx: MutationCtx, owner: string, args: { dealId: Id<"deals">; decision: "approve" | "reject"; placeId?: string }) {
  const record = await ctx.db.get(args.dealId), job = record ? await ctx.db.get(record.jobId) : null;
  if (!record || !job || job.owner !== owner) throw new ConvexError("Deal not found.");
  if (record.status !== "needs_review") throw new ConvexError("This deal is not awaiting review.");
  const outcome = outcomeSchema.parse(JSON.parse(record.dataJson));
  if (args.decision === "reject") {
    await ctx.db.patch(record._id, { status: "rejected", reviewedAt: Date.now(), reviewedBy: owner });
    return { dealId: record._id, status: "rejected" };
  }
  if (outcome.deal.endDate && outcome.deal.endDate < localDate(new Date(), record.timezone)) throw new ConvexError("Expired deals cannot be published.");
  const place = args.placeId ? outcome.candidates.find(p => p.placeId === args.placeId) : outcome.restaurant;
  if (!place) throw new ConvexError("Choose a verified restaurant candidate. If none exists, retry with a clearer branch or address.");
  const existing = await ctx.db.query("restaurants").withIndex("by_place", q => q.eq("placeId", place.placeId)).unique();
  const restaurantId = existing?._id ?? await ctx.db.insert("restaurants", { placeId: place.placeId, dataJson: JSON.stringify(place) });
  await ctx.db.patch(record._id, { status: "published", restaurantId,
    dataJson: JSON.stringify({ ...outcome, restaurant: place, status: "ready" }), reviewedAt: Date.now(), reviewedBy: owner });
  return { dealId: record._id, status: "published" };
}
const reviewArgs = { dealId: v.id("deals"), decision: v.union(v.literal("approve"), v.literal("reject")), placeId: v.optional(v.string()) };
export const reviewDeal = mutation({ args: reviewArgs, handler: async (ctx, args) => review(ctx, await requireOwner(ctx), args) });
export const reviewInternal = internalMutation({ args: { ...reviewArgs, owner: v.string() }, handler: (ctx, args) => review(ctx, args.owner, args) });
export const getJobInternal = internalQuery({ args: { jobId: v.id("jobs"), owner: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.owner !== args.owner) return null;
  const records = await ctx.db.query("deals").withIndex("by_job", q => q.eq("jobId", args.jobId)).collect();
  return { jobId: job._id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
    result: job.resultJson ? JSON.parse(job.resultJson) : null, error: job.errorJson ? JSON.parse(job.errorJson) : null,
    deals: records.map(d => ({ ...JSON.parse(d.dataJson), dealId: d._id, status: d.status })) };
} });
