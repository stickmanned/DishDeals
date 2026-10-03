import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resultSchema } from "../src/contracts";
import { liveDependencies, processDeal } from "../src/workflow";
import { safeError } from "../src/errors";

export const claim = internalMutation({ args: { jobId: v.id("jobs") }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "queued") return null;
  const attempt = job.attempt + 1;
  await ctx.db.patch(job._id, { status: "processing", attempt, updatedAt: Date.now() });
  return { inputJson: job.inputJson, attempt };
} });
export const finish = internalMutation({ args: { jobId: v.id("jobs"), attempt: v.number(), resultJson: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "processing" || job.attempt !== args.attempt) return;
  const result = resultSchema.parse(JSON.parse(args.resultJson));
  for (const outcome of result.outcomes) {
    let restaurantId;
    if (outcome.restaurant) {
      const place = outcome.restaurant;
      const existing = await ctx.db.query("restaurants").withIndex("by_place", q => q.eq("placeId", place.placeId)).unique();
      restaurantId = existing?._id ?? await ctx.db.insert("restaurants", { placeId: place.placeId, dataJson: JSON.stringify(place) });
    }
    await ctx.db.insert("deals", { jobId: job._id, restaurantId, dataJson: JSON.stringify(outcome),
      status: outcome.status === "ready" ? "published" : outcome.status,
      timezone: result.timezone, sourceUrl: result.source.url, createdAt: Date.now() });
  }
  // Transaction commits the output and all deals together, preventing partial publication.
  await ctx.db.patch(job._id, { status: "completed", resultJson: JSON.stringify(result), updatedAt: Date.now(), errorJson: undefined });
} });
export const fail = internalMutation({ args: { jobId: v.id("jobs"), attempt: v.number(), errorJson: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "processing" || job.attempt !== args.attempt) return;
  await ctx.db.patch(job._id, { status: "failed", errorJson: args.errorJson, updatedAt: Date.now() });
} });
export const run = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, args): Promise<void> => {
  const claimed = await ctx.runMutation(internal.ai.claim, args);
  if (!claimed) return;
  try {
    const result = await processDeal(JSON.parse(claimed.inputJson), liveDependencies(process.env));
    await ctx.runMutation(internal.ai.finish, { ...args, attempt: claimed.attempt, resultJson: JSON.stringify(result) });
  } catch (error) {
    await ctx.runMutation(internal.ai.fail, { ...args, attempt: claimed.attempt, errorJson: JSON.stringify(safeError(error)) });
  }
} });
