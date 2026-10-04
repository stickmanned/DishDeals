import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { inputSchema } from "../src/contracts";
import { fingerprint } from "../src/workflow";
import { requireOwner } from "./auth";

async function rateLimit(ctx: MutationCtx, owner: string) {
  const now = Date.now();
  const limit = await ctx.db.query("limits").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  if (!limit) { await ctx.db.insert("limits", { owner, count: 1, windowStart: now }); return; }
  if (now - limit.windowStart >= 3600000) { await ctx.db.patch(limit._id, { count: 1, windowStart: now }); return; }
  if (limit.count >= 20) throw new ConvexError("Submission limit reached (20 per hour). Try again later.");
  await ctx.db.patch(limit._id, { count: limit.count + 1 });
}
async function enqueue(ctx: MutationCtx, owner: string, inputJson: string) {
  let raw: unknown;
  try { raw = JSON.parse(inputJson); } catch { throw new ConvexError("Invalid input JSON."); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new ConvexError("Invalid source or context. Check README input examples.");
  const canonical = JSON.stringify(parsed.data);
  const hash = await fingerprint(parsed.data);
  const existing = await ctx.db.query("jobs").withIndex("by_owner_hash", q => q.eq("owner", owner).eq("fingerprint", hash)).unique();
  if (existing) return { jobId: existing._id, duplicate: true };
  await rateLimit(ctx, owner);
  const now = Date.now();
  const jobId = await ctx.db.insert("jobs", { owner, fingerprint: hash, inputJson: canonical,
    status: "queued", createdAt: now, updatedAt: now, attempt: 0 });
  await ctx.scheduler.runAfter(0, internal.ai.run, { jobId });
  return { jobId, duplicate: false };
}
export const submit = mutation({ args: { inputJson: v.string() }, handler: async (ctx, args) => enqueue(ctx, await requireOwner(ctx), args.inputJson) });
export const submitInternal = internalMutation({ args: { owner: v.string(), inputJson: v.string() }, handler: async (ctx, args) => enqueue(ctx, args.owner, args.inputJson) });
export const get = query({ args: { jobId: v.id("jobs") }, handler: async (ctx, args) => {
  const owner = await requireOwner(ctx), job = await ctx.db.get(args.jobId);
  if (!job || job.owner !== owner) return null;
  const deals = await ctx.db.query("deals").withIndex("by_job", q => q.eq("jobId", job._id)).collect();
  return { jobId: job._id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
    result: job.resultJson ? JSON.parse(job.resultJson) : null, error: job.errorJson ? JSON.parse(job.errorJson) : null,
    deals: deals.map(d => ({ ...JSON.parse(d.dataJson), dealId: d._id, status: d.status })) };
} });
async function retry(ctx: MutationCtx, owner: string, jobId: import("./_generated/dataModel").Id<"jobs">) {
  const job = await ctx.db.get(jobId);
  if (!job || job.owner !== owner) throw new ConvexError("Job not found.");
  const stale = job.status === "processing" && Date.now() - job.updatedAt > 15 * 60000;
  if (job.status !== "failed" && !stale && job.status !== "completed") throw new ConvexError("Job is already running.");
  const deals = await ctx.db.query("deals").withIndex("by_job", q => q.eq("jobId", jobId)).collect();
  if (deals.some(d => d.status === "published" || d.reviewedAt)) throw new ConvexError("Reviewed or published jobs cannot be reprocessed. Submit updated source text instead.");
  await rateLimit(ctx, owner);
  for (const deal of deals) await ctx.db.delete(deal._id);
  await ctx.db.patch(jobId, { status: "queued", resultJson: undefined, errorJson: undefined, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.ai.run, { jobId });
  return { jobId };
}
export const retryJob = mutation({ args: { jobId: v.id("jobs") }, handler: async (ctx, args) => retry(ctx, await requireOwner(ctx), args.jobId) });
export const retryInternal = internalMutation({ args: { owner: v.string(), jobId: v.id("jobs") }, handler: async (ctx, args) => retry(ctx, args.owner, args.jobId) });
