import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { upsertProfileCore } from "../lib/profile";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      userId,
      email: user?.email,
      profile: profile
        ? {
            displayName: profile.displayName,
            walletAddress: profile.walletAddress,
          }
        : null,
    };
  },
});

export const upsertProfile = mutation({
  args: {
    displayName: v.string(),
    walletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    return upsertProfileCore(
      {
        getProfileByUser: (id) =>
          ctx.db
            .query("profiles")
            .withIndex("by_user", (q) => q.eq("userId", id))
            .unique(),
        insertProfile: (row) => ctx.db.insert("profiles", row),
        patchProfile: (id, fields) => ctx.db.patch(id, fields),
      },
      userId,
      args,
    );
  },
});
