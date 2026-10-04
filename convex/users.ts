import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { meCore, upsertProfileCore, type ProfileDb } from "../lib/profile";

function profileDb(ctx: QueryCtx): Pick<ProfileDb, "getProfileByUser"> {
  return {
    getProfileByUser: (id) =>
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .unique(),
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => meCore(profileDb(ctx), await getAuthUserId(ctx)),
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
