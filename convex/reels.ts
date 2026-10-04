import { getAuthUserId } from "@convex-dev/auth/server";
import { v, ConvexError } from "convex/values";
import type { WorkflowId } from "@convex-dev/workflow";
import { mutation, query, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import schema from "./schema";
import { reelWorkflow } from "./reelWorkflow";
import { normalizeInstagramUrl, reelDraft, reelExtraction } from "../lib/reels/contract";
import { SAVE_ERRORS, bump, checkSave, planFinish, withinDraftLimit } from "../lib/reels/draftRevision";
const day = 86400000;
async function owner(ctx: QueryCtx | MutationCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("Not signed in");
  return id;
}
async function owned(ctx: QueryCtx | MutationCtx, itemId: Id<"reelItems">) {
  const id = await owner(ctx), item = await ctx.db.get(itemId);
  if (!item || item.ownerId !== id || item.expiresAt <= Date.now()) throw new ConvexError("Item not found");
  return item;
}
async function rateLimit(ctx: MutationCtx, ownerId: Id<"users">) {
  const row = await ctx.db.query("reelLimits").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
  const now = Date.now();
  if (!row) return ctx.db.insert("reelLimits", { ownerId, windowStart: now, count: 1 });
  if (now - row.windowStart >= 3600000) return ctx.db.patch(row._id, { windowStart: now, count: 1 });
  if (row.count >= 10) throw new ConvexError("Up to 10 Reel submissions or retries per hour. Try later.");
  await ctx.db.patch(row._id, { count: row.count + 1 });
}
async function enqueue(ctx: MutationCtx, itemId: Id<"reelItems">, generation: number) {
  const workflowId = await reelWorkflow.start(ctx, internal.reelWorkflow.process, { itemId, generation });
  await ctx.db.patch(itemId, { workflowId });
}
// Only an in-progress workflow can be cancelled. A completed, failed or already-canceled workflow (a
// failed item's workflow has finished), or one already cleaned up, is a normal state and is skipped.
// Any other failure (a bad id, a cancel error on a running workflow) is NOT swallowed.
async function stopWorkflow(ctx: MutationCtx, workflowId: string | undefined) {
  if (!workflowId) return;
  let running: boolean;
  try {
    running = (await reelWorkflow.status(ctx, workflowId as WorkflowId)).type === "inProgress";
  } catch (error) {
    if (!/^Workflow not found:/.test(error instanceof Error ? error.message : "")) throw error;
    running = false;
  }
  if (running) await reelWorkflow.cancel(ctx, workflowId as WorkflowId);
  // Cancellation prevents future steps. Running actions still use generation/existence guards.
  await ctx.scheduler.runAfter(60000, internal.reels.cleanupWorkflow, { workflowId });
}
async function erase(ctx: MutationCtx, item: NonNullable<Awaited<ReturnType<typeof owned>>>) {
  await stopWorkflow(ctx, item.workflowId);
  if (item.videoId) await ctx.storage.delete(item.videoId);
  await ctx.db.delete(item._id);
}
export const submit = mutation({ args: { text: v.string(), retentionDays: v.optional(v.number()) },
  returns: v.object({ itemId: v.id("reelItems"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerId = await owner(ctx); const sourceUrl = normalizeInstagramUrl(args.text);
    const retentionDays = args.retentionDays ?? 7;
    if (![1, 7, 30].includes(retentionDays)) throw new ConvexError("Choose 1, 7, or 30 days.");
    const existing = await ctx.db.query("reelItems").withIndex("by_owner_url", q => q.eq("ownerId", ownerId).eq("sourceUrl", sourceUrl)).unique();
    if (existing && existing.expiresAt > Date.now()) return { itemId: existing._id, duplicate: true };
    if (existing) await erase(ctx, existing);
    await rateLimit(ctx, ownerId);
    const now = Date.now(), expiresAt = now + retentionDays * day;
    const itemId = await ctx.db.insert("reelItems", { ownerId, sourceUrl, status: "queued", generation: 1, attempts: 1, updatedAt: now, expiresAt });
    // Link-only: nothing is enqueued. The user attaches their own recording (POST /reel-source); the legacy resolver is never started here.
    await ctx.scheduler.runAt(expiresAt, internal.reels.expire, { itemId, expiresAt });
    return { itemId, duplicate: false };
  } });
export const get = query({ args: { itemId: v.id("reelItems") }, returns: schema.doc("reelItems"), handler: (ctx, args) => owned(ctx, args.itemId) });
export const list = query({ args: {}, returns: v.array(schema.doc("reelItems")), handler: async ctx => {
  const ownerId = await owner(ctx);
  const items = await ctx.db.query("reelItems").withIndex("by_owner", q => q.eq("ownerId", ownerId)).order("desc").take(50);
  return items.filter(item => item.expiresAt > Date.now());
} });
export const retry = mutation({ args: { itemId: v.id("reelItems") }, returns: v.null(), handler: async (ctx, { itemId }) => {
  const item = await owned(ctx, itemId);
  if (item.status !== "failed") throw new ConvexError("Only failed items can be retried.");
  if (item.attempts >= 5) throw new ConvexError("Retry limit reached. Delete and share again after reviewing the error.");
  const generation = bump(item.generation), attempts = bump(item.attempts);
  if (generation === null || attempts === null) throw new ConvexError("This item cannot be retried again.");
  await rateLimit(ctx, item.ownerId);
  await stopWorkflow(ctx, item.workflowId);
  // A supplied recording is the user's own source and is kept for the retry; resolver-fetched media is dropped.
  if (item.videoId && item.sourceKind !== "supplied") await ctx.storage.delete(item.videoId);
  // The private draft, its revision/edited flags and the previous extraction
  // (provenance) are kept until a new extraction arrives. Only the media is dropped.
  await ctx.db.patch(itemId, { generation, attempts, status: "queued", updatedAt: Date.now(), error: undefined, ...(item.sourceKind === "supplied" ? {} : { videoId: undefined }) });
  await enqueue(ctx, itemId, generation);
  return null;
} });
export const remove = mutation({ args: { itemId: v.id("reelItems") }, returns: v.null(), handler: async (ctx, { itemId }) => { await erase(ctx, await owned(ctx, itemId)); return null; } });
export const setRetention = mutation({ args: { itemId: v.id("reelItems"), days: v.number() }, returns: v.null(), handler: async (ctx, { itemId, days }) => {
  await owned(ctx, itemId); if (![1, 7, 30].includes(days)) throw new ConvexError("Choose 1, 7, or 30 days.");
  const expiresAt = Date.now() + days * day;
  await ctx.db.patch(itemId, { expiresAt }); await ctx.scheduler.runAt(expiresAt, internal.reels.expire, { itemId, expiresAt }); return null;
} });
export const saveDraft = mutation({ args: { itemId: v.id("reelItems"), draftJson: v.string(), expectedGeneration: v.number(), expectedRevision: v.number() }, returns: v.null(),
  handler: async (ctx, { itemId, draftJson, expectedGeneration, expectedRevision }) => {
  const item = await owned(ctx, itemId);
  const check = checkSave(item, { generation: expectedGeneration, revision: expectedRevision });
  if (!check.ok) throw new ConvexError(SAVE_ERRORS[check.reason]);
  // A manual draft may be created when none exists yet. Any existing stored draft must still be
  // strict 1..10 ReelDrafts within the size limit, otherwise it fails safely as corrupt. The only
  // exception is the system's own untouched empty "[]" placeholder for a no_deal result.
  if (item.draftJson !== undefined && !(item.draftJson === "[]" && !item.draftEdited)) {
    if (!withinDraftLimit(item.draftJson)) throw new ConvexError("This draft is corrupt.");
    try { reelDraft.array().min(1).max(10).parse(JSON.parse(item.draftJson)); } catch { throw new ConvexError("This draft is corrupt."); }
  }
  if (!withinDraftLimit(draftJson)) throw new ConvexError("Draft is too large.");
  const drafts = reelDraft.array().min(1).max(10).parse(JSON.parse(draftJson));
  await ctx.db.patch(itemId, { draftJson: JSON.stringify(drafts), draftRevision: check.nextRevision, draftEdited: true, updatedAt: Date.now() }); return null;
} });
const jobArgs = { itemId: v.id("reelItems"), generation: v.number() };
export const workItem = internalQuery({ args: jobArgs, returns: v.union(schema.doc("reelItems"), v.null()), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); return item && item.generation === args.generation && item.expiresAt > Date.now() ? item : null;
} });
export const markRetrieving = internalMutation({ args: jobArgs, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); if (item?.generation === args.generation && item.expiresAt > Date.now()) await ctx.db.patch(item._id, { status: "retrieving", updatedAt: Date.now() }); return null;
} });
export const attachMedia = internalMutation({ args: { ...jobArgs, videoId: v.id("_storage"), caption: v.string(), duration: v.number(), publishedAt: v.union(v.string(), v.null()) }, returns: v.boolean(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); if (!item || item.generation !== args.generation || item.expiresAt <= Date.now()) { await ctx.storage.delete(args.videoId); return false; }
  await ctx.db.patch(item._id, { videoId: args.videoId, caption: args.caption, duration: args.duration, publishedAt: args.publishedAt ?? undefined, status: "extracting", updatedAt: Date.now() }); return true;
} });
export const finish = internalMutation({ args: { ...jobArgs, extractionJson: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); if (!item || item.generation !== args.generation || item.expiresAt <= Date.now()) return null;
  const extraction = reelExtraction.parse(JSON.parse(args.extractionJson));
  const plan = planFinish(item, JSON.stringify(extraction.drafts));
  if (!plan.ok) throw new ConvexError(SAVE_ERRORS[plan.reason]);
  if (item.videoId) await ctx.storage.delete(item.videoId);
  // The model extraction is stored separately. An edited draft is retained as-is.
  await ctx.db.patch(item._id, { videoId: undefined, extractionJson: JSON.stringify(extraction), draftJson: plan.draftJson,
    draftRevision: plan.draftRevision, draftEdited: plan.draftEdited, status: extraction.isDeal ? "ready" : "no_deal", updatedAt: Date.now() }); return null;
} });
export const fail = internalMutation({ args: { ...jobArgs, code: v.string(), message: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); if (!item || item.generation !== args.generation || item.expiresAt <= Date.now()) return null;
  // Supplied media is retained for retries until success, no-deal, deletion, expiry or replacement.
  const keep = item.sourceKind === "supplied";
  if (item.videoId && !keep) await ctx.storage.delete(item.videoId);
  await ctx.db.patch(item._id, { ...(keep ? {} : { videoId: undefined }), status: "failed", error: { code: args.code, message: args.message }, updatedAt: Date.now() }); return null;
} });
export const expire = internalMutation({ args: { itemId: v.id("reelItems"), expiresAt: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const item = await ctx.db.get(args.itemId); if (item && item.expiresAt === args.expiresAt && item.expiresAt <= Date.now()) await erase(ctx, item); return null;
} });
export const cleanupWorkflow = internalMutation({ args: { workflowId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const done = await reelWorkflow.cleanup(ctx, args.workflowId as WorkflowId);
  if (!done) await ctx.scheduler.runAfter(60000, internal.reels.cleanupWorkflow, args); return null;
} });

// Atomic association of a server-stored recording to the CURRENT, owned,
// unexpired item generation. The ownerId is passed only by the authenticated
// HTTP route (internal function), never by a client. On any rejection the
// caller deletes the orphaned upload.
export const attachSupplied = internalMutation({
  args: { itemId: v.id("reelItems"), ownerId: v.id("users"), expectedGeneration: v.number(), videoId: v.id("_storage"),
    mediaMime: v.union(v.literal("video/mp4"), v.literal("video/mov")), mediaBytes: v.number(), duration: v.number(),
    caption: v.union(v.string(), v.null()), publishedAt: v.union(v.string(), v.null()) },
  returns: v.union(v.object({ attached: v.literal(true), generation: v.number() }), v.object({ attached: v.literal(false), reason: v.string() })),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.ownerId !== args.ownerId || item.expiresAt <= Date.now()) return { attached: false as const, reason: "not_found" };
    if (item.generation !== args.expectedGeneration) return { attached: false as const, reason: "stale" };
    const generation = bump(item.generation);
    if (generation === null) return { attached: false as const, reason: "corrupt" };
    try { await rateLimit(ctx, item.ownerId); } catch { return { attached: false as const, reason: "rate_limited" }; }
    // Stop the old workflow and invalidate its late results by advancing the generation.
    await stopWorkflow(ctx, item.workflowId);
    if (item.videoId && item.videoId !== args.videoId) await ctx.storage.delete(item.videoId); // superseded owned media
    await ctx.db.patch(item._id, { generation, status: "queued", updatedAt: Date.now(), error: undefined, sourceKind: "supplied", videoId: args.videoId,
      mediaMime: args.mediaMime, mediaBytes: args.mediaBytes, duration: args.duration, caption: args.caption ?? undefined, publishedAt: args.publishedAt ?? undefined });
    await enqueue(ctx, item._id, generation);
    return { attached: true as const, generation };
  } });
export const sourceTarget = internalQuery({ args: { itemId: v.id("reelItems"), ownerId: v.id("users") }, returns: v.union(v.object({ generation: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    return item && item.ownerId === args.ownerId && item.expiresAt > Date.now() ? { generation: item.generation } : null;
  } });
