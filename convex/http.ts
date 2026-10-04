import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { inputSchema } from "../lib/workflow/contracts";
import { z } from "zod";
import { searchInputSchema } from "../lib/workflow/search-contracts";
import { comparisonInputSchema } from "../lib/workflow/compare-contracts";
import { ConvexError } from "convex/values";

import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
function authorized(request: Request) {
  const token = process.env.WORKFLOW_API_TOKEN;
  return !!token && token.length >= 32 && request.headers.get("Authorization") === `Bearer ${token}`;
}
async function readBody(request: Request): Promise<unknown> {
  // Enforce a real streaming bound; Content-Length alone is not trustworthy.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 600000) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}
http.route({ path: "/v1/jobs", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  let input;
  try { input = inputSchema.parse(await readBody(request)); } catch { return reply({ error: "INVALID_INPUT", message: "Check the source format and size limits in README." }, 400); }
  try { return reply(await ctx.runMutation(internal.workflow.jobs.submitInternal, { owner: "integration", inputJson: JSON.stringify(input) }), 202); }
  catch (error) {
    const limited = error instanceof Error && error.message.includes("Submission limit reached");
    return reply({ error: limited ? "RATE_LIMITED" : "SUBMISSION_FAILED",
      message: limited ? "Hourly submission limit reached." : "Submission failed. Try again later." }, limited ? 429 : 500);
  }
}) });
http.route({ path: "/v1/jobs", method: "GET", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  const jobId = new URL(request.url).searchParams.get("id");
  if (!jobId) return reply({ error: "MISSING_JOB_ID" }, 400);
  try {
    const result = await ctx.runQuery(internal.workflow.deals.getJobInternal, { owner: "integration", jobId: jobId as Id<"workflowJobs"> });
    return result ? reply(result) : reply({ error: "NOT_FOUND" }, 404);
  } catch { return reply({ error: "INVALID_JOB_ID" }, 400); }
}) });
http.route({ path: "/v1/jobs/retry", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  try {
    const args = z.object({ jobId: z.string().min(1) }).strict().parse(await readBody(request));
    return reply(await ctx.runMutation(internal.workflow.jobs.retryInternal, { owner: "integration", jobId: args.jobId as Id<"workflowJobs"> }), 202);
  } catch { return reply({ error: "RETRY_FAILED", message: "Check job ID and state; reviewed or published jobs cannot be retried." }, 400); }
}) });
http.route({ path: "/v1/deals/review", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  try {
    const args = z.object({ dealId: z.string().min(1), decision: z.enum(["approve", "reject"]), placeId: z.string().optional() }).strict().parse(await readBody(request));
    return reply(await ctx.runMutation(internal.workflow.deals.reviewInternal, { ...args, owner: "integration", dealId: args.dealId as Id<"workflowDeals"> }));
  } catch { return reply({ error: "REVIEW_FAILED", message: "Check ownership, review state, expiry and verified restaurant candidate." }, 400); }
}) });
http.route({ path: "/v1/deals", method: "GET", handler: httpAction(async (ctx, request) => {
  const raw = new URL(request.url).searchParams.get("limit") ?? "100", limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return reply({ error: "INVALID_LIMIT" }, 400);
  return reply({ deals: await ctx.runQuery(internal.workflow.deals.listInternal, { limit, now: Date.now() }) });
}) });
http.route({ path: "/v1/search", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  let input;
  try { input = searchInputSchema.parse(await readBody(request)); } catch { return reply({ error: "INVALID_INPUT", message: "Check the search query, location and filters." }, 400); }
  try { return reply(await ctx.runAction(internal.workflow.search.run, { owner: "integration", inputJson: JSON.stringify(input) })); }
  catch (error) {
    const limited = error instanceof Error && error.message.includes("Search limit reached");
    return reply({ error: limited ? "RATE_LIMITED" : "SEARCH_FAILED", message: limited ? "Hourly search limit reached." : "Search failed. Try again later." }, limited ? 429 : 500);
  }
}) });
http.route({ path: "/v1/deals/pitch", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  let input;
  try { input = searchInputSchema.extend({ focusDealId: z.string().min(1).max(128), limit: z.literal(1).default(1) }).parse(await readBody(request)); }
  catch { return reply({ error: "INVALID_INPUT", message: "Provide focusDealId, the user's query and optional preferences." }, 400); }
  try { return reply(await ctx.runAction(internal.workflow.search.run, { owner: "integration", inputJson: JSON.stringify(input) })); }
  catch (error) {
    const limited = error instanceof Error && error.message.includes("Search limit reached");
    return reply({ error: limited ? "RATE_LIMITED" : "SEARCH_FAILED" }, limited ? 429 : 500);
  }
}) });
http.route({ path: "/v1/deals/compare", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!authorized(request)) return reply({ error: "UNAUTHORIZED" }, 401);
  let input;
  try { input = comparisonInputSchema.parse(await readBody(request)); }
  catch { return reply({ error: "INVALID_INPUT", message: "Select two to five distinct deals, with value, price, or taste priority." }, 400); }
  try { return reply(await ctx.runAction(internal.workflow.compare.run, { owner: "integration", inputJson: JSON.stringify(input) })); }
  catch (error) {
    const limited = error instanceof Error && error.message.includes("Search limit reached");
    const data = error instanceof ConvexError && typeof error.data === "object" && error.data !== null ? error.data : null;
    const invalid = data && "code" in data && (data.code === "INVALID_INPUT" || data.code === "INVALID_SELECTION");
    return reply({ error: limited ? "RATE_LIMITED" : invalid ? "INVALID_SELECTION" : "COMPARISON_FAILED",
      message: limited ? "Hourly search and comparison limit reached." : invalid ? "A selected deal is unavailable, expired, or from the same restaurant. Refresh your selection." : "Comparison failed. Try again later." }, limited ? 429 : invalid ? 400 : 500);
  }
}) });
export default http;
