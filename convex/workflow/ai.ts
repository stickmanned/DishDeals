import { v } from "convex/values";
import { env, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resultSchema } from "../../lib/workflow/contracts";
import { liveDependencies, processDeal } from "../../lib/workflow/workflow";
import { pickWorkflowEnv } from "../../lib/workflow/config";
import { safeError } from "../../lib/workflow/errors";

export const claim = internalMutation({ args: { jobId: v.id("workflowJobs") }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "queued") return null;
  const attempt = job.attempt + 1;
  await ctx.db.patch(job._id, { status: "processing", attempt, updatedAt: Date.now() });
  return { inputJson: job.inputJson, attempt };
} });
export const finish = internalMutation({ args: { jobId: v.id("workflowJobs"), attempt: v.number(), resultJson: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "processing" || job.attempt !== args.attempt) return;
  const result = resultSchema.parse(JSON.parse(args.resultJson));
  for (const outcome of result.outcomes) {
    let restaurantId;
    if (outcome.restaurant) {
      const place = outcome.restaurant;
      const existing = await ctx.db.query("workflowRestaurants").withIndex("by_placeId", q => q.eq("placeId", place.placeId)).unique();
      restaurantId = existing?._id ?? await ctx.db.insert("workflowRestaurants", { placeId: place.placeId, dataJson: JSON.stringify(place) });
    }
    await ctx.db.insert("workflowDeals", { jobId: job._id, restaurantId, dataJson: JSON.stringify(outcome),
      // N-REMOTE-B: model output never auto-publishes on global confidence or a Geoapify match. A "ready" outcome waits
      // for the owner's explicit review (`workflow.deals.reviewDeal`); the stored outcome JSON is left exactly as produced.
      status: outcome.status === "rejected" ? "rejected" : "needs_review",
      timezone: result.timezone, sourceUrl: result.source.url, createdAt: Date.now() });
  }
  // Transaction commits the output and all deals together, preventing partial publication.
  await ctx.db.patch(job._id, { status: "completed", resultJson: JSON.stringify(result), updatedAt: Date.now(), errorJson: undefined });
} });
export const fail = internalMutation({ args: { jobId: v.id("workflowJobs"), attempt: v.number(), errorJson: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== "processing" || job.attempt !== args.attempt) return;
  await ctx.db.patch(job._id, { status: "failed", errorJson: args.errorJson, updatedAt: Date.now() });
} });
export const run = internalAction({ args: { jobId: v.id("workflowJobs") }, handler: async (ctx, args): Promise<void> => {
  const claimed = await ctx.runMutation(internal.workflow.ai.claim, args);
  if (!claimed) return;
  try {
    const result = await processDeal(JSON.parse(claimed.inputJson), liveDependencies(pickWorkflowEnv(env)));
    await ctx.runMutation(internal.workflow.ai.finish, { ...args, attempt: claimed.attempt, resultJson: JSON.stringify(result) });
  } catch (error) {
    await ctx.runMutation(internal.workflow.ai.fail, { ...args, attempt: claimed.attempt, errorJson: JSON.stringify(safeError(error)) });
  }
} });
