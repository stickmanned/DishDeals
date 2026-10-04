/// <reference types="vite/client" />
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { deal, place, modelResponse } from "./fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");
const token = "test-workflow-secret-at-least-32-characters";
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const setup = () => convexTest({ schema, modules, transactionLimits: true });
async function seed(t: ReturnType<typeof setup>, status: "published" | "needs_review" = "published", expired = false) {
  return t.run(async ctx => {
    const jobId = await ctx.db.insert("workflowJobs", { owner: "other-user", fingerprint: `seed-${status}-${expired}`, inputJson: "{}",
      status: "completed", createdAt: Date.now(), updatedAt: Date.now(), attempt: 1 });
    return ctx.db.insert("workflowDeals", { jobId, dataJson: JSON.stringify({ deal: { ...deal, price: 12, currency: "CAD", endDate: expired ? "2026-10-02" : "2026-10-31" },
      restaurant: place, candidates: [place], status: status === "published" ? "ready" : "needs_review", reviewReasons: [] }),
      status, timezone: "America/Vancouver", sourceUrl: "https://example.com/deals", createdAt: Date.now() });
  });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T20:00:00Z")); vi.stubEnv("WORKFLOW_API_TOKEN", token); vi.stubEnv("GEMINI_API_KEY", ""); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("serves authenticated search without a key and excludes review/expired data", async () => {
  const t = setup(); const published = await seed(t); await seed(t, "needs_review"); await seed(t, "published", true);
  const response = await t.fetch("/v1/search", { method: "POST", headers: auth, body: JSON.stringify({ query: "拉面优惠", maxPrice: 15, currency: "CAD" }) });
  expect(response.status).toBe(200); const result = await response.json();
  expect(result.mode).toBe("basic"); expect(result.scope).toBe("published_deals");
  expect(result.recommendations.map((r: { dealId: string }) => r.dealId)).toEqual([published]);
  expect(result.recommendations[0].pitch).toContain("CAD 12");
  expect((await t.fetch("/v1/search", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await t.fetch("/v1/search", { method: "POST", headers: auth, body: JSON.stringify({ query: "x", origin: { latitude: 100, longitude: 0 } }) })).status).toBe(400);
});
it("produces persuasion for a selected deal through HTTP", async () => {
  const t = setup(); const id = await seed(t);
  const response = await t.fetch("/v1/deals/pitch", { method: "POST", headers: auth, body: JSON.stringify({ focusDealId: id, query: "为什么值得去？" }) });
  expect(response.status).toBe(200); const result = await response.json();
  expect(result.recommendations).toHaveLength(1); expect(result.recommendations[0].dealId).toBe(id);
  expect(result.recommendations[0].caveats).toContain("Dine-in only");
  expect((await t.fetch("/v1/deals/pitch", { method: "POST", headers: auth, body: JSON.stringify({ query: "why" }) })).status).toBe(400);
});
it("allows direct authenticated Convex search and guards anonymous actions", async () => {
  const t = setup(); await seed(t);
  await expect(t.action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "ramen" }) })).rejects.toThrow("Sign in");
  const result = await t.withIdentity({ subject: "alice", tokenIdentifier: "alice" }).action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "ramen" }) });
  expect(result.recommendations).toHaveLength(1);
});
it("uses the Gemini intent and evidence plan from server-only configuration", async () => {
  const t = setup(); const id = await seed(t); vi.stubEnv("GEMINI_API_KEY", "fake-secret");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ keywords: ["ramen"], excludeKeywords: [], city: null,
    maxPrice: 15, currency: "CAD", maxDistanceKm: null, requiresOrigin: false, availableNow: false, sortBy: "price", unsupportedNeeds: [] }))
    .mockResolvedValueOnce(modelResponse({ selections: [{ dealId: id, hookFactId: "price", supportFactIds: ["discount"], angle: "value" }] }));
  vi.stubGlobal("fetch", fetcher);
  const result = await (await t.fetch("/v1/search", { method: "POST", headers: auth, body: JSON.stringify({ query: "CAD 15以内的拉面" }) })).json();
  expect(result.mode).toBe("gemini"); expect(result.recommendations[0].pitch).toContain("划算");
  expect(JSON.stringify(result)).not.toContain("fake-secret"); expect(fetcher).toHaveBeenCalledTimes(2);
});
it("enforces search limits independently from ingestion limits", async () => {
  const t = setup(); await seed(t);
  await t.run(async ctx => { await ctx.db.insert("workflowSearchLimits", { owner: "integration", count: 60, windowStart: Date.now() }); });
  const response = await t.fetch("/v1/search", { method: "POST", headers: auth, body: JSON.stringify({ query: "ramen" }) });
  expect(response.status).toBe(429);
  expect((await response.json()).error).toBe("RATE_LIMITED");
});
it("automatically searches the web for an empty authenticated query without adding offers to the database", async () => {
  const t = setup(); vi.stubEnv("GEMINI_API_KEY", "fake-secret");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ keywords: ["Haidilao"], excludeKeywords: [], city: null,
    maxPrice: null, currency: null, maxDistanceKm: null, requiresOrigin: false, availableNow: false, sortBy: "relevance", unsupportedNeeds: [] }))
    .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "No verified offer. Visit the official Haidilao website." }] },
      groundingMetadata: { webSearchQueries: ["Haidilao Vancouver"], groundingChunks: [{ web: { uri: "https://www.haidilao.com/", title: "Haidilao official" } }],
        groundingSupports: [{ groundingChunkIndices: [0] }], searchEntryPoint: { renderedContent: '<a href="https://www.google.com/search?q=haidilao">Haidilao</a>' } } }] }));
  vi.stubGlobal("fetch", fetcher);
  const result = await t.withIdentity({ subject: "alice" }).action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "海底捞", language: "en" }) });
  expect(result.recommendations).toEqual([]);
  expect(result.webDiscovery?.sources[0].title).toBe("Haidilao official");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(await t.run(ctx => ctx.db.query("workflowDeals").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("workflowJobs").collect())).toEqual([]);
});
