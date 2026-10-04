/// <reference types="vite/client" />
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { deal, place, modelResponse } from "./fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");
const token = "test-workflow-secret-at-least-32-characters";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const setup = () => convexTest({ schema, modules, transactionLimits: true });
async function seed(t: ReturnType<typeof setup>, name: string, status: "published" | "needs_review" = "published", expired = false) {
  return t.run(async ctx => {
    const jobId = await ctx.db.insert("workflowJobs", { owner: "other-user", fingerprint: `seed-${name}`, inputJson: "{}",
      status: "completed", createdAt: Date.now(), updatedAt: Date.now(), attempt: 1 });
    return ctx.db.insert("workflowDeals", { jobId, dataJson: JSON.stringify({ deal: { ...deal, restaurantName: name, price: name === "a" ? 12 : 18, currency: "CAD",
      endDate: expired ? "2026-10-02" : "2026-10-31" }, restaurant: { ...place, name, placeId: `place-${name}` }, candidates: [],
      status: status === "published" ? "ready" : "needs_review", reviewReasons: [] }),
      status, timezone: "America/Vancouver", sourceUrl: "https://example.com/deals", createdAt: Date.now() });
  });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T20:00:00Z")); vi.stubEnv("WORKFLOW_API_TOKEN", token); vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("WORKFLOW_PROVIDER_USAGE_AUTHORIZED", "true"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (t: ReturnType<typeof setup>, input: unknown) => t.fetch("/v1/deals/compare", { method: "POST", headers, body: JSON.stringify(input) });

it("compares exact published records through HTTP and rejects anonymous or malformed requests", async () => {
  const t = setup(), a = await seed(t, "a"), b = await seed(t, "b");
  const response = await request(t, { dealIds: [a, b], priority: "price" });
  expect(response.status).toBe(200); const result = await response.json();
  expect(result.recommendation.dealId).toBe(a); expect(result.mode).toBe("evidence_only");
  expect(result.restaurants.map((r: { dealId: string }) => r.dealId)).toEqual([a, b]);
  expect((await t.fetch("/v1/deals/compare", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await request(t, { dealIds: [a, a] })).status).toBe(400);
  expect((await request(t, { dealIds: [a, b], price: 1 })).status).toBe(400);
});

it("rejects unpublished, expired and invalid IDs without invoking Gemini", async () => {
  const t = setup(), a = await seed(t, "a"), review = await seed(t, "review", "needs_review"), expired = await seed(t, "old", "published", true);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const id of [review, expired, "not-a-convex-id"]) {
    const response = await request(t, { dealIds: [a, id] });
    expect(response.status).toBe(400); expect((await response.json()).error).toBe("INVALID_SELECTION");
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("uses authenticated Convex actions and the same per-owner search quota", async () => {
  const t = setup(), a = await seed(t, "a"), b = await seed(t, "b"), inputJson = JSON.stringify({ dealIds: [a, b] });
  await expect(t.action(api.workflow.compare.find, { inputJson })).rejects.toThrow("Sign in");
  const result = await t.withIdentity({ subject: "alice", tokenIdentifier: "alice" }).action(api.workflow.compare.find, { inputJson });
  expect(result.restaurants).toHaveLength(2);
  await t.run(async ctx => { await ctx.db.insert("workflowSearchLimits", { owner: "integration", count: 60, windowStart: Date.now() }); });
  expect((await request(t, { dealIds: [a, b] })).status).toBe(429);
});

it("makes taste-first Gemini calls with server-only credentials and cited reviews", async () => {
  const t = setup(), a = await seed(t, "a"), b = await seed(t, "b");
  vi.stubEnv("GEMINI_API_KEY", "fake-server-key"); vi.stubEnv("GEMINI_COMPARISON_MODEL", "test-comparison-model");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ suggestedDealId: b, citedFactIds: ["taste-0", "offer"] }));
  vi.stubGlobal("fetch", fetcher);
  const result = await (await request(t, { dealIds: [a, b], priority: "taste", tasteEvidence: [
    { dealId: a, quote: "The ramen broth was rather salty.", sourceUrl: "https://example.com/review-a" },
    { dealId: b, quote: "The broth was balanced and the noodles had excellent texture.", sourceUrl: "https://example.com/review-b" },
  ] })).json();
  expect(result.mode).toBe("gemini"); expect(result.recommendation.dealId).toBe(b);
  expect(fetcher.mock.calls[0][0]).toContain("test-comparison-model:generateContent");
  expect(JSON.stringify(result)).not.toContain("fake-server-key");
});

it("falls back to evidence-only comparison without any Gemini call when provider usage is not authorized (N-REMOTE-A guard)", async () => {
  const t = setup(), a = await seed(t, "a"), b = await seed(t, "b");
  vi.stubEnv("GEMINI_API_KEY", "fake-server-key"); vi.stubEnv("WORKFLOW_PROVIDER_USAGE_AUTHORIZED", "");
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  const result = await (await request(t, { dealIds: [a, b], priority: "taste", tasteEvidence: [
    { dealId: a, quote: "The ramen broth was rather salty.", sourceUrl: "https://example.com/review-a" },
    { dealId: b, quote: "The broth was balanced and the noodles had excellent texture.", sourceUrl: "https://example.com/review-b" },
  ] })).json();
  expect(result.mode).toBe("evidence_only");
  expect(fetcher).not.toHaveBeenCalled();
});
