import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables, // includes the users table

  reelItems: defineTable({
    ownerId: v.id("users"), sourceUrl: v.string(),
    status: v.union(v.literal("queued"), v.literal("retrieving"), v.literal("extracting"), v.literal("ready"), v.literal("no_deal"), v.literal("failed")),
    generation: v.number(), attempts: v.number(), updatedAt: v.number(), expiresAt: v.number(),
    workflowId: v.optional(v.string()), videoId: v.optional(v.id("_storage")),
    caption: v.optional(v.string()), duration: v.optional(v.number()), publishedAt: v.optional(v.string()),
    extractionJson: v.optional(v.string()), draftJson: v.optional(v.string()),
    draftRevision: v.optional(v.number()), draftEdited: v.optional(v.boolean()), // legacy rows: 0 / false
    // User-supplied recording (absent on legacy and link-only rows). mediaMime is the type sent to the provider; duration is browser-supplied.
    sourceKind: v.optional(v.literal("supplied")), mediaMime: v.optional(v.union(v.literal("video/mp4"), v.literal("video/mov"))), mediaBytes: v.optional(v.number()),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
  }).index("by_owner_url", ["ownerId", "sourceUrl"]).index("by_owner", ["ownerId"]).index("by_expiry", ["expiresAt"]),
  reelLimits: defineTable({ ownerId: v.id("users"), windowStart: v.number(), count: v.number() }).index("by_owner", ["ownerId"]),

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
  }).index("by_author", ["authorId"]).index("by_image", ["imageId"]),

  // Private registry of uploads the server accepted for a user. Created only by the authenticated upload path
  // (a later slice), never by a public mutation. A deal may reference an image only if the caller owns its row here.
  dealUploads: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    expiresAt: v.number(),
    published: v.boolean(),
  }).index("by_storage", ["storageId"]).index("by_expiry", ["expiresAt"]).index("by_owner_pending", ["ownerId", "published", "expiresAt"]),

  votes: defineTable({
    dealId: v.id("deals"),
    userId: v.id("users"),
    value: v.union(v.literal("still_on"), v.literal("expired")),
  }).index("by_deal_user", ["dealId", "userId"]),
});
