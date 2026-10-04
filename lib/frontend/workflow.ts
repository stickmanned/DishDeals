import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { z } from "zod";

// These names and payloads were verified against the independent ai-workflow
// module at e3a39cc. They must never target main's canonical deployment.
export const workflowApi = {
  list: makeFunctionReference<"query", { limit: number; now: number }, unknown>(
    "workflow/deals:listForMap",
  ),
  submit: makeFunctionReference<
    "mutation",
    { inputJson: string },
    { jobId: GenericId<"workflowJobs">; duplicate: boolean }
  >("workflow/jobs:submit"),
  get: makeFunctionReference<"query", { jobId: GenericId<"workflowJobs"> }, unknown>(
    "workflow/jobs:get",
  ),
  retry: makeFunctionReference<
    "mutation",
    { jobId: GenericId<"workflowJobs"> },
    { jobId: GenericId<"workflowJobs"> }
  >("workflow/jobs:retryJob"),
  review: makeFunctionReference<
    "mutation",
    {
      dealId: GenericId<"workflowDeals">;
      decision: "approve" | "reject";
      placeId?: string;
    },
    { dealId: GenericId<"workflowDeals">; status: string }
  >("workflow/deals:reviewDeal"),
};

const place = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const offer = z.object({
  restaurantName: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  days: z.array(z.string()),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  conditions: z.array(z.string()),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});
export const jobSchema = z.object({
  jobId: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  result: z
    .object({
      rejectionReason: z.string().nullable(),
      source: z.object({ publishedAt: z.string().nullable() }).optional(),
    })
    .nullable(),
  error: z.unknown(),
  deals: z.array(
    z.object({
      dealId: z.string(),
      status: z.enum(["published", "needs_review", "rejected"]),
      deal: offer,
      restaurant: place.nullable(),
      candidates: z.array(place).max(5),
      reviewReasons: z.array(z.string()),
    }),
  ),
});
export type JobData = z.infer<typeof jobSchema>;
export type WorkflowSource =
  | { type: "text"; text: string; sourceUrl?: string; publishedAt?: string }
  | {
      type: "image";
      data: string;
      mimeType: "image/jpeg";
      caption?: string;
      sourceUrl?: string;
      publishedAt?: string;
    };

export function retryAllowed(job: JobData, now = Date.now()) {
  if (
    job.deals.some((d) => d.status === "published" || d.status === "rejected")
  )
    return false;
  return (
    job.status === "failed" ||
    job.status === "completed" ||
    (job.status === "processing" && now - job.updatedAt > 15 * 60_000)
  );
}

export function safeDestination(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u0020\u007f]/.test(value)
    ? value
    : "/profile";
}

export function safeSourceUrl(value: string | undefined) {
  if (!value || value.length > 2048) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hostname.includes(":") &&
      !u.hostname.startsWith("[") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) &&
      u.hostname.includes(".") &&
      !/\.(local|internal|localhost)$/.test(u.hostname)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
