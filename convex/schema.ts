import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { workflowTables } from "./workflowTables";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...workflowTables,
  ...authTables, // includes the users table

  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(), // 2 to 24 characters
    walletAddress: v.optional(v.string()), // Solana address, devnet
  }).index("by_user", ["userId"]),

  deals: defineTable({
    authorId: v.id("users"),
    restaurant: v.string(),
    address: v.optional(v.string()),
    dealText: v.string(),
    priceCad: v.optional(v.number()), // missing = price varies
    validDays: v.array(v.string()), // "mon".."sun"; empty = every day
    validStart: v.optional(v.string()), // "HH:MM"; missing = all day
    validEnd: v.optional(v.string()), // "HH:MM"; earlier than start = past midnight
    expiresOn: v.optional(v.string()), // "YYYY-MM-DD"
    conditions: v.array(v.string()),
    lat: v.number(),
    lng: v.number(),
    imageId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    stillOnCount: v.number(),
    expiredCount: v.number(),
  }).index("by_author", ["authorId"]),

  votes: defineTable({
    dealId: v.id("deals"),
    userId: v.id("users"),
    value: v.union(v.literal("still_on"), v.literal("expired")),
  }).index("by_deal_user", ["dealId", "userId"]),
});
