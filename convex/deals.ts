import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

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
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", deal.authorId))
      .first();

    const imageUrl = deal.imageId ? await ctx.storage.getUrl(deal.imageId) : null;

    // The viewer is always derived server-side; signed out means no vote.
    const viewerId = await getAuthUserId(ctx);
    const vote =
      viewerId === null
        ? null
        : await ctx.db
            .query("votes")
            .withIndex("by_deal_user", (q) => q.eq("dealId", dealId).eq("userId", viewerId))
            .first();

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
