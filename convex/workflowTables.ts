import { defineTable } from "convex/server";
import { v } from "convex/values";
export const workflowTables = {
  workflowJobs: defineTable({ owner: v.string(), fingerprint: v.string(), inputJson: v.string(),
    status: v.union(v.literal("queued"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    createdAt: v.number(), updatedAt: v.number(), attempt: v.number(),
    resultJson: v.optional(v.string()), errorJson: v.optional(v.string()),
  }).index("by_owner_and_fingerprint", ["owner", "fingerprint"]).index("by_owner_and_createdAt", ["owner", "createdAt"]),
  workflowRestaurants: defineTable({ placeId: v.string(), dataJson: v.string() }).index("by_placeId", ["placeId"]),
  workflowDeals: defineTable({ jobId: v.id("workflowJobs"), restaurantId: v.optional(v.id("workflowRestaurants")),
    dataJson: v.string(), status: v.union(v.literal("published"), v.literal("needs_review"), v.literal("rejected")),
    timezone: v.string(), sourceUrl: v.union(v.string(), v.null()), createdAt: v.number(),
    reviewedAt: v.optional(v.number()), reviewedBy: v.optional(v.string()),
  }).index("by_jobId", ["jobId"]).index("by_status_and_createdAt", ["status", "createdAt"]),
  workflowLimits: defineTable({ owner: v.string(), windowStart: v.number(), count: v.number() }).index("by_owner", ["owner"]),
  workflowSearchLimits: defineTable({ owner: v.string(), windowStart: v.number(), count: v.number() }).index("by_owner", ["owner"]),
};
