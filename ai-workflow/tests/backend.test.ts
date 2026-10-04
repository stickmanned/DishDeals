import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { input, deal, place, modelResponse, geoResponse } from "./fixtures";

const modules = import.meta.glob("../convex/**/*.*s");
const token = "test-integration-token-at-least-32-characters";
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T20:00:00Z"));
  vi.stubEnv("GEMINI_API_KEY", "test-gemini"); vi.stubEnv("GEOAPIFY_API_KEY", "test-geo"); vi.stubEnv("WORKFLOW_API_TOKEN", token);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mockProviders(overrides = {}) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ deals: [{ ...deal, ...overrides }], rejectionReason: null }))
    .mockResolvedValueOnce(geoResponse([{ place_id: "city-id", country_code: "ca" }]))
    .mockResolvedValueOnce(geoResponse([{ place_id: place.placeId, name: place.name, formatted: place.address,
      lat: place.latitude, lon: place.longitude, city: "Richmond", country_code: "ca", categories: place.categories }]));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
it("runs HTTP submission -> scheduled action -> atomic storage -> public map", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true }); const fetcher = mockProviders();
  const response = await t.fetch("/v1/jobs", { method: "POST", headers: auth, body: JSON.stringify(input) });
  expect(response.status).toBe(202); const { jobId } = await response.json();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobResponse = await t.fetch(`/v1/jobs?id=${jobId}`, { headers: auth });
  const job = await jobResponse.json();
  expect(job.status).toBe("completed"); expect(job.deals[0].status).toBe("published");
  expect(job).not.toHaveProperty("inputJson");
  const map = await (await t.fetch("/v1/deals")).json();
  expect(map.deals).toHaveLength(1); expect(map.deals[0].restaurant.latitude).toBe(place.latitude);
  const duplicate = await (await t.fetch("/v1/jobs", { method: "POST", headers: auth, body: JSON.stringify(input) })).json();
  expect(duplicate).toEqual({ jobId, duplicate: true }); expect(fetcher).toHaveBeenCalledTimes(3);
  await expect(t.mutation(internal.jobs.retryInternal, { owner: "integration", jobId })).rejects.toThrow("published");
});
it("fails closed without authentication and isolates job owners", async () => {
  const t = convexTest(schema, modules);
  expect((await t.fetch("/v1/jobs", { method: "POST", body: JSON.stringify(input) })).status).toBe(401);
  await expect(t.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) })).rejects.toThrow("Sign in");
  const alice = t.withIdentity({ tokenIdentifier: "alice" }), bob = t.withIdentity({ tokenIdentifier: "bob" });
  const { jobId } = await alice.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) });
  expect(await bob.query(api.jobs.get, { jobId })).toBeNull();
  await expect(bob.mutation(api.jobs.retryJob, { jobId })).rejects.toThrow("not found");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("keeps uncertain offers private until their owner approves a verified candidate", async () => {
  const t = convexTest(schema, modules), alice = t.withIdentity({ tokenIdentifier: "alice" }), bob = t.withIdentity({ tokenIdentifier: "bob" });
  mockProviders({ confidence: 0.6 });
  const { jobId } = await alice.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query(api.deals.listForMap, {})).toHaveLength(0);
  const job = await alice.query(api.jobs.get, { jobId }); const dealId = job!.deals[0].dealId;
  expect(job!.deals[0].status).toBe("needs_review");
  await expect(bob.mutation(api.deals.reviewDeal, { dealId, decision: "approve" })).rejects.toThrow("not found");
  await expect(alice.mutation(api.deals.reviewDeal, { dealId, decision: "approve", placeId: "invented-place" })).rejects.toThrow("verified");
  await alice.mutation(api.deals.reviewDeal, { dealId, decision: "approve", placeId: place.placeId });
  expect(await t.query(api.deals.listForMap, {})).toHaveLength(1);
  expect((await alice.query(api.jobs.get, { jobId }))!.deals[0].status).toBe("published");
});
it("records missing-key failure safely and can retry after configuration", async () => {
  const t = convexTest(schema, modules), alice = t.withIdentity({ tokenIdentifier: "alice" });
  vi.stubEnv("GEMINI_API_KEY", "");
  const { jobId } = await alice.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const failed = await alice.query(api.jobs.get, { jobId });
  expect(failed!.status).toBe("failed"); expect(failed!.error.code).toBe("MISSING_API_KEY");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini"); mockProviders();
  await alice.mutation(api.jobs.retryJob, { jobId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await alice.query(api.jobs.get, { jobId }))!.status).toBe("completed");
});
it("discards old workers and duplicate completions", async () => {
  const t = convexTest(schema, modules), alice = t.withIdentity({ tokenIdentifier: "alice" });
  const { jobId } = await alice.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) });
  const claim = await t.mutation(internal.ai.claim, { jobId });
  expect(await t.mutation(internal.ai.claim, { jobId })).toBeNull();
  await t.mutation(internal.ai.fail, { jobId, attempt: claim!.attempt - 1, errorJson: "{}" });
  expect((await alice.query(api.jobs.get, { jobId }))!.status).toBe("processing");
  await t.mutation(internal.ai.fail, { jobId, attempt: claim!.attempt, errorJson: JSON.stringify({ code: "TEST", message: "failed", retryable: true }) });
  expect((await alice.query(api.jobs.get, { jobId }))!.status).toBe("failed");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
it("expires published deals and limits new submissions per owner", async () => {
  const t = convexTest(schema, modules), alice = t.withIdentity({ tokenIdentifier: "alice" });
  mockProviders(); const { jobId } = await alice.mutation(api.jobs.submit, { inputJson: JSON.stringify(input) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.setSystemTime(new Date("2026-11-01T20:00:00Z"));
  expect(await t.query(api.deals.listForMap, {})).toHaveLength(0);
  expect(await t.mutation(internal.maintenance.expireDeals, {})).toEqual({ expired: 1 });
  expect((await alice.query(api.jobs.get, { jobId }))!.deals[0].status).toBe("rejected");
  await t.run(async ctx => { await ctx.db.insert("limits", { owner: "limited", count: 20, windowStart: Date.now() }); });
  await expect(t.withIdentity({ tokenIdentifier: "limited" }).mutation(api.jobs.submit, { inputJson: JSON.stringify(input) })).rejects.toThrow("20 per hour");
});
