import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

const counterField = {
  still_on: "stillOnCount",
  expired: "expiredCount",
} as const;

const validCounter = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

// One vote per user per deal. The user id is always derived from the auth
// identity. Everything is validated before the first write, and a mutation is
// one transaction, so a rejected cast leaves no partial counter change.
export const cast = mutation({
  args: {
    dealId: v.id("deals"),
    value: v.union(v.literal("still_on"), v.literal("expired")),
  },
  returns: v.null(),
  handler: async (ctx, { dealId, value }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const deal = await ctx.db.get("deals", dealId);
    if (deal === null) throw new Error("Deal not found");
    // Corrupt counters are rejected, never repaired or guessed.
    if (!validCounter(deal.stillOnCount) || !validCounter(deal.expiredCount)) {
      throw new Error("Deal vote counts are corrupt");
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_deal_user", (q) => q.eq("dealId", dealId).eq("userId", userId))
      .unique(); // throws if duplicate rows already exist

    // An existing vote must be backed by a positive counter even when the
    // cast is a repeat; a zero counter is corruption, not something to accept.
    if (existing !== null && deal[counterField[existing.value]] < 1) {
      throw new Error("Deal vote counts are inconsistent with the existing vote");
    }
    if (existing !== null && existing.value === value) return null; // idempotent

    const next: Record<"stillOnCount" | "expiredCount", number> = {
      stillOnCount: deal.stillOnCount,
      expiredCount: deal.expiredCount,
    };
    if (existing !== null) next[counterField[existing.value]] -= 1;
    next[counterField[value]] += 1;
    // Never write a counter that is no longer a safe integer.
    if (!validCounter(next.stillOnCount) || !validCounter(next.expiredCount)) {
      throw new Error("Deal vote count would exceed the safe integer range");
    }

    if (existing === null) {
      await ctx.db.insert("votes", { dealId, userId, value });
    } else {
      await ctx.db.patch("votes", existing._id, { value });
    }
    await ctx.db.patch("deals", dealId, next);
    return null;
  },
});
