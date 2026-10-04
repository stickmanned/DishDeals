import { getAuthUserId } from "@convex-dev/auth/server";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { v, ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";
import { requireOwnedImage } from "./dealUploads";
import { PUBLISHED_EXPIRY } from "../lib/dealImageUpload";
import {
  MAX_VOTES_PER_DELETE, NEARBY_FALLBACK_SCAN, NEARBY_LIMIT, WriteError, rankByDistance, validateNearbyArgs, validatePublishFields,
  type RawPublishFields,
} from "../lib/dealWrite";

// One geospatial point per published deal: key = the canonical deal id, no filter keys, sort key = creation time.
const geospatial = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);

// Explicit read enrichment around the canonical deals document. Canonical
// tables are unchanged; `viewerVote` is the plan's unnamed "viewer's vote".
// No distanceKm (no viewer location is known), no auth-private user fields.
export const get = query({
  args: { dealId: v.id("deals") },
  returns: v.union(
    schema.doc("deals").extend({
      authorName: v.optional(v.string()),
      authorWallet: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      viewerVote: v.union(v.literal("still_on"), v.literal("expired"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { dealId }) => {
    const deal = await ctx.db.get("deals", dealId);
    if (deal === null) return null;

    // Only the display name and wallet are read from the author's profile.
    // unique() throws on duplicate rows: a corrupt ownership invariant must
    // fail the read, never pick an arbitrary wallet/name or vote.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", deal.authorId))
      .unique();

    const imageUrl = deal.imageId ? await ctx.storage.getUrl(deal.imageId) : null;

    // The viewer is always derived server-side; signed out means no vote.
    const viewerId = await getAuthUserId(ctx);
    const vote =
      viewerId === null
        ? null
        : await ctx.db
            .query("votes")
            .withIndex("by_deal_user", (q) => q.eq("dealId", dealId).eq("userId", viewerId))
            .unique();

    return {
      ...deal,
      ...(profile ? { authorName: profile.displayName } : {}),
      ...(profile?.walletAddress !== undefined
        ? { authorWallet: profile.walletAddress }
        : {}),
      imageUrl,
      viewerVote: vote?.value ?? null,
    };
  },
});

// Denied-location fallback: only published canonical deals are queried here.
// Validity and price filtering remain in the shared client selection helper.
export const listRecent = query({
  args: { limit: v.number() },
  returns: v.array(schema.doc("deals").extend({
    authorName: v.optional(v.string()),
    imageUrl: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, { limit }) => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new ConvexError("Choose a whole-number limit from 1 to 50.");
    }
    const deals = await ctx.db.query("deals").order("desc").take(limit);
    return Promise.all(deals.map(async (deal) => {
      const profile = await ctx.db.query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", deal.authorId)).unique();
      return {
        ...deal,
        ...(profile ? { authorName: profile.displayName } : {}),
        imageUrl: deal.imageId ? await ctx.storage.getUrl(deal.imageId) : null,
      };
    }));
  },
});

// ------------------------------------------------------------------ writes

const publishArgs = {
  restaurant: v.string(), address: v.optional(v.string()), dealText: v.string(), priceCad: v.optional(v.number()),
  validDays: v.array(v.string()), validStart: v.optional(v.string()), validEnd: v.optional(v.string()), expiresOn: v.optional(v.string()),
  conditions: v.array(v.string()), lat: v.number(), lng: v.number(), imageId: v.optional(v.id("_storage")), sourceUrl: v.optional(v.string()),
};

// Signed in plus exactly one profile. A duplicate profile throws (unique()) instead of picking one.
async function authorWithProfile(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("Not signed in");
  const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
  if (!profile) throw new ConvexError("Create your profile before publishing.");
  return userId;
}

function clean(args: { imageId?: Id<"_storage"> } & RawPublishFields) {
  try { return validatePublishFields(args); }
  catch (error) { throw new ConvexError(error instanceof WriteError ? error.message : "Invalid deal."); }
}

// An image may be attached only if the caller owns exactly one registry row for it (created by the
// authenticated /deal-image upload, never by a public mutation), it is unexpired or already published, and
// the stored file passes the shared size/type check. Publishing marks the row published and non-expiring.
async function claimImage(ctx: MutationCtx, userId: Id<"users">, storageId: Id<"_storage">) {
  const row = await requireOwnedImage(ctx, userId, storageId);
  if (!row.published) await ctx.db.patch(row._id, { published: true, expiresAt: PUBLISHED_EXPIRY });
}

// Delete a storage file (and its registry row) only when no saved deal still references it.
async function releaseImage(ctx: MutationCtx, storageId: Id<"_storage"> | undefined) {
  if (!storageId) return;
  const stillUsed = await ctx.db.query("deals").withIndex("by_image", q => q.eq("imageId", storageId)).take(1);
  if (stillUsed.length > 0) return;
  for (const row of await ctx.db.query("dealUploads").withIndex("by_storage", q => q.eq("storageId", storageId)).take(2)) await ctx.db.delete(row._id);
  await ctx.storage.delete(storageId);
}

// Returns the authenticated HTTP upload URL; POST the image bytes there with the Bearer token and the
// website origin. This is not a storage upload URL: the server validates, stores and registers the file.
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    if ((await getAuthUserId(ctx)) === null) throw new ConvexError("Not signed in");
    if (!env.CONVEX_SITE_URL) throw new ConvexError("Image upload is not configured.");
    return `${env.CONVEX_SITE_URL.replace(/\/+$/, "")}/deal-image`;
  },
});

const toPoint = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });

export const create = mutation({
  args: publishArgs,
  returns: v.id("deals"),
  handler: async (ctx, args) => {
    const authorId = await authorWithProfile(ctx);
    const fields = clean(args);
    if (args.imageId) await claimImage(ctx, authorId, args.imageId);
    const dealId = await ctx.db.insert("deals", { ...fields, ...(args.imageId ? { imageId: args.imageId } : {}), authorId, stillOnCount: 0, expiredCount: 0 });
    const created = (await ctx.db.get("deals", dealId))!;
    // Same transaction as the canonical insert: if the index write fails, the publish rolls back.
    await geospatial.insert(ctx, dealId, toPoint(fields.lat, fields.lng), {}, created._creationTime);
    return dealId;
  },
});

// Full replacement of the canonical fields; omitted optional fields are deliberately cleared.
export const update = mutation({
  args: { dealId: v.id("deals"), ...publishArgs },
  returns: v.null(),
  handler: async (ctx, { dealId, ...args }) => {
    const userId = await authorWithProfile(ctx);
    const deal = await ctx.db.get("deals", dealId);
    if (!deal) throw new ConvexError("Deal not found");
    if (deal.authorId !== userId) throw new ConvexError("Only the author can edit this deal.");
    const fields = clean(args);
    if (args.imageId && args.imageId !== deal.imageId) await claimImage(ctx, userId, args.imageId);
    await ctx.db.patch(dealId, {
      restaurant: fields.restaurant, dealText: fields.dealText, validDays: fields.validDays, conditions: fields.conditions, lat: fields.lat, lng: fields.lng,
      address: fields.address, priceCad: fields.priceCad, validStart: fields.validStart, validEnd: fields.validEnd, expiresOn: fields.expiresOn,
      sourceUrl: fields.sourceUrl, imageId: args.imageId,
    });
    await geospatial.insert(ctx, dealId, toPoint(fields.lat, fields.lng), {}, deal._creationTime); // replaces the key's point
    if (deal.imageId && deal.imageId !== args.imageId) await releaseImage(ctx, deal.imageId);
    return null;
  },
});

export const remove = mutation({
  args: { dealId: v.id("deals") },
  returns: v.null(),
  handler: async (ctx, { dealId }) => {
    const userId = await authorWithProfile(ctx);
    const deal = await ctx.db.get("deals", dealId);
    if (!deal) throw new ConvexError("Deal not found");
    if (deal.authorId !== userId) throw new ConvexError("Only the author can delete this deal.");
    // Votes are deleted in this transaction. A deal with more votes than a single transaction can
    // truthfully delete is refused (nothing changes) rather than leaving orphan votes behind.
    const votes = await ctx.db.query("votes").withIndex("by_deal_user", q => q.eq("dealId", dealId)).take(MAX_VOTES_PER_DELETE + 1);
    if (votes.length > MAX_VOTES_PER_DELETE) throw new ConvexError("This deal has too many votes to delete in one step.");
    for (const vote of votes) await ctx.db.delete(vote._id);
    await geospatial.remove(ctx, dealId);
    await ctx.db.delete(dealId);
    await releaseImage(ctx, deal.imageId);
    return null;
  },
});

// ------------------------------------------------------------------- nearby

const nearbyDeal = schema.doc("deals").extend({
  authorName: v.optional(v.string()),
  imageUrl: v.union(v.string(), v.null()),
  distanceKm: v.number(),
});

async function enrich(ctx: QueryCtx, deal: Doc<"deals"> & { distanceKm: number }) {
  const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", deal.authorId)).unique();
  return { ...deal, ...(profile ? { authorName: profile.displayName } : {}), imageUrl: deal.imageId ? await ctx.storage.getUrl(deal.imageId) : null };
}

// Published canonical deals near the viewer, nearest first. distanceKm is computed from the viewer's
// coordinates and the stored lat/lng with the shared haversine helper. Validity stays client-side.
export const listNearby = query({
  args: { lat: v.number(), lng: v.number(), maxKm: v.number() },
  returns: v.array(nearbyDeal),
  handler: async (ctx, args) => {
    let center: { lat: number; lng: number; maxKm: number };
    try { center = validateNearbyArgs(args.lat, args.lng, args.maxKm); }
    catch (error) { throw new ConvexError(error instanceof WriteError ? error.message : "Invalid location."); }

    let candidates: Doc<"deals">[];
    try {
      // maxDistance is in meters.
      const hits = await geospatial.nearest(ctx, { point: toPoint(center.lat, center.lng), limit: NEARBY_LIMIT, maxDistance: center.maxKm * 1000 });
      candidates = [];
      for (const hit of hits) {
        const deal = await ctx.db.get("deals", hit.key);
        if (deal) candidates.push(deal); // a stale index key with no canonical deal is skipped
      }
    } catch {
      // The component failed: fall back to the newest canonical records, filtered and ranked by true distance.
      candidates = await ctx.db.query("deals").order("desc").take(NEARBY_FALLBACK_SCAN);
    }
    const ranked = rankByDistance(candidates, center, center.maxKm, NEARBY_LIMIT);
    return Promise.all(ranked.map(deal => enrich(ctx, deal)));
  },
});
