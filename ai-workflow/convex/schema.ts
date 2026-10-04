import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  jobs: defineTable({ owner: v.string(), fingerprint: v.string(), inputJson: v.string(),
    status: v.union(v.literal("queued"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    createdAt: v.number(), updatedAt: v.number(), attempt: v.number(),
    resultJson: v.optional(v.string()), errorJson: v.optional(v.string()),
  }).index("by_owner_hash", ["owner", "fingerprint"]).index("by_owner", ["owner", "createdAt"]),
  restaurants: defineTable({ placeId: v.string(), dataJson: v.string() }).index("by_place", ["placeId"]),
  deals: defineTable({ jobId: v.id("jobs"), restaurantId: v.optional(v.id("restaurants")),
    dataJson: v.string(), status: v.union(v.literal("published"), v.literal("needs_review"), v.literal("rejected")),
    timezone: v.string(), sourceUrl: v.union(v.string(), v.null()), createdAt: v.number(),
    reviewedAt: v.optional(v.number()), reviewedBy: v.optional(v.string()),
  }).index("by_job", ["jobId"]).index("by_status", ["status", "createdAt"]),
  limits: defineTable({ owner: v.string(), windowStart: v.number(), count: v.number() }).index("by_owner", ["owner"]),
  searchLimits: defineTable({ owner: v.string(), windowStart: v.number(), count: v.number() }).index("by_owner", ["owner"]),
});
