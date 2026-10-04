import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { MAX_IMAGE_BYTES, isAllowedImageType } from "../lib/dealWrite";
import { CLEANUP_BATCH, PUBLISHED_EXPIRY, REGISTRY_TTL_MS } from "../lib/dealImageUpload";

// The private upload registry. Rows are created only by the authenticated HTTP upload (convex/dealImage.ts)
// through the internal `register` below: there is no public way to claim a storage id.

/**
 * The one registry row the caller owns for this storage id, after checking it is unexpired or already
 * published and that the stored file is 1 byte to 5 MiB with an allowed content type when one is recorded.
 * Throws a ConvexError for anything else (unregistered, someone else's, duplicate rows, expired, missing).
 */
export async function requireOwnedImage(ctx: QueryCtx, userId: Id<"users">, storageId: Id<"_storage">) {
  const rows = await ctx.db.query("dealUploads").withIndex("by_storage", q => q.eq("storageId", storageId)).take(2);
  const row = rows[0];
  if (rows.length !== 1 || row.ownerId !== userId || (!row.published && row.expiresAt <= Date.now())) throw new ConvexError("That image is not available to you.");
  const meta = await ctx.db.system.get("_storage", storageId);
  const unavailable = () => new ConvexError("That image is missing, too large, or not a supported image.");
  if (!meta || meta.size <= 0 || meta.size > MAX_IMAGE_BYTES) throw unavailable();
  // A mutation/query cannot read file bytes; the upload path validated the real format before storing.
  if (meta.contentType !== undefined && !isAllowedImageType(meta.contentType)) throw unavailable();
  return row;
}

export const register = internalMutation({
  args: { ownerId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { ownerId, storageId }) => {
    const existing = await ctx.db.query("dealUploads").withIndex("by_storage", q => q.eq("storageId", storageId)).take(1);
    if (existing.length > 0) throw new ConvexError("Upload already registered.");
    await ctx.db.insert("dealUploads", { ownerId, storageId, expiresAt: Date.now() + REGISTRY_TTL_MS, published: false });
    return null;
  },
});

// Owner check for extraction. Errors are ConvexErrors carrying only a fixed message.
export const checkOwned = internalQuery({
  args: { ownerId: v.id("users"), storageIds: v.array(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, { ownerId, storageIds }) => {
    for (const id of storageIds) await requireOwnedImage(ctx, ownerId, id);
    return null;
  },
});

/**
 * Hourly bounded cleanup. Examines at most CLEANUP_BATCH expired registry rows, oldest first:
 * - published rows (and rows a saved deal references) are never deleted; they are marked published with a
 *   non-expiring `expiresAt` so they leave the scan and the batch always makes progress;
 * - unpublished expired rows with no canonical reference are deleted, and their file too unless another
 *   registry row for the same file is published or a deal references it.
 * A full batch schedules one immediate continuation.
 */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ examined: v.number(), deletedFiles: v.number(), kept: v.number() }),
  handler: async (ctx): Promise<{ examined: number; deletedFiles: number; kept: number }> => {
    const now = Date.now();
    const rows = await ctx.db.query("dealUploads").withIndex("by_expiry", q => q.lt("expiresAt", now)).take(CLEANUP_BATCH);
    let deletedFiles = 0, kept = 0;
    for (const row of rows) {
      const referenced = (await ctx.db.query("deals").withIndex("by_image", q => q.eq("imageId", row.storageId)).take(1)).length > 0;
      if (row.published || referenced) {
        await ctx.db.patch(row._id, { published: true, expiresAt: PUBLISHED_EXPIRY });
        kept++;
        continue;
      }
      const siblings = await ctx.db.query("dealUploads").withIndex("by_storage", q => q.eq("storageId", row.storageId)).take(3);
      const sharedElsewhere = siblings.some(s => s._id !== row._id && s.published);
      await ctx.db.delete(row._id);
      if (sharedElsewhere) { kept++; continue; }
      if (await ctx.db.system.get("_storage", row.storageId)) { await ctx.storage.delete(row.storageId); deletedFiles++; }
    }
    if (rows.length === CLEANUP_BATCH) await ctx.scheduler.runAfter(0, internal.dealUploads.cleanupExpired, {});
    return { examined: rows.length, deletedFiles, kept };
  },
});
