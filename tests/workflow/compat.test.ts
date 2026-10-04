/// <reference types="vite/client" />
// N-REMOTE-B local compatibility tests for the preserved published workflow. Provider traffic is a SYNTHETIC mocked
// fetch and the backend is the in-memory convex-test one: none of this is live provider, deployment, auth or phone evidence.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { comparisonProvider, pickWorkflowEnv, searchProviders, WORKFLOW_ENV_NAMES } from "../../lib/workflow/config";
import { extractWithGemini } from "../../lib/workflow/gemini";
import { liveDependencies } from "../../lib/workflow/workflow";
import { inputSchema, outcomeSchema } from "../../lib/workflow/contracts";
import { deal, geoResponse, input, modelResponse, place } from "./fixtures";

const modules = import.meta.glob("../../convex/**/*.*s");
const sources = import.meta.glob(["../../convex/workflow/*.ts", "../../convex/trial.ts", "../../lib/workflow/*.ts", "!../../lib/workflow/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const token = "test-integration-token-at-least-32-characters";
const keys = { GEMINI_API_KEY: "fake-key", GEOAPIFY_API_KEY: "fake-geo", WORKFLOW_PROVIDER_USAGE_AUTHORIZED: "true" };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T20:00:00Z")); vi.stubEnv("WORKFLOW_API_TOKEN", token); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function stubExtraction(overrides = {}) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ deals: [{ ...deal, ...overrides }], rejectionReason: null }))
    .mockResolvedValueOnce(geoResponse([{ place_id: "city-id", country_code: "ca" }]))
    .mockResolvedValueOnce(geoResponse([{ place_id: place.placeId, name: place.name, formatted: place.address,
      lat: place.latitude, lon: place.longitude, city: "Richmond", country_code: "ca", categories: place.categories }]));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
function configure(extra: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...keys, GEMINI_MODEL: "synthetic-model", ...extra })) vi.stubEnv(name, value);
}
const alice = (t: ReturnType<typeof convexTest>) => t.withIdentity({ subject: "alice|session" });

describe("new workflow outputs never auto-publish", () => {
  it("holds a high-confidence, fully matched offer for owner review and keeps the stored output intact", async () => {
    configure(); const fetcher = stubExtraction({ confidence: 0.99 });
    const t = convexTest(schema, modules), owner = alice(t);
    const { jobId } = await owner.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify(input) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const job = await owner.query(api.workflow.jobs.get, { jobId });
    expect(job).toMatchObject({ status: "completed", deals: [{ status: "needs_review" }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [row] = await t.run(ctx => ctx.db.query("workflowDeals").collect());
    expect(row.status).toBe("needs_review");
    // Original outcome kept as produced: genuine global confidence, evidence and matched restaurant; no four-score conversion.
    const outcome = outcomeSchema.parse(JSON.parse(row.dataJson));
    expect(outcome).toMatchObject({ status: "ready", reviewReasons: [], restaurant: { placeId: place.placeId } });
    expect(outcome.deal.confidence).toBe(0.99);
    expect(outcome.deal.evidence).toBe(deal.evidence);
    expect(row.dataJson).not.toMatch(/priceCad|"restaurant":0/);
    // Not on the map, not in search, not via HTTP; canonical tables untouched.
    expect(await t.query(api.workflow.deals.listForMap, { now: Date.now() })).toEqual([]);
    expect((await (await t.fetch("/v1/deals")).json()).deals).toEqual([]);
    expect(await t.query(internal.workflow.search.catalog, {})).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
  });

  it("publishes only after the owner's explicit approval; other users and signed-out callers cannot", async () => {
    configure(); stubExtraction();
    const t = convexTest(schema, modules), owner = alice(t), other = t.withIdentity({ subject: "bob|session" });
    const { jobId } = await owner.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify(input) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const dealId = (await owner.query(api.workflow.jobs.get, { jobId }))!.deals[0].dealId;
    await expect(other.mutation(api.workflow.deals.reviewDeal, { dealId, decision: "approve" })).rejects.toThrow("not found");
    await expect(t.mutation(api.workflow.deals.reviewDeal, { dealId, decision: "approve" })).rejects.toThrow("Sign in");
    expect((await t.fetch("/v1/deals/review", { method: "POST", body: JSON.stringify({ dealId, decision: "approve" }) })).status).toBe(401);
    expect(await t.query(api.workflow.deals.listForMap, { now: Date.now() })).toEqual([]);
    await expect(owner.mutation(api.workflow.deals.reviewDeal, { dealId, decision: "approve", placeId: "invented" })).rejects.toThrow("verified");
    await owner.mutation(api.workflow.deals.reviewDeal, { dealId, decision: "approve" });
    expect(await t.query(api.workflow.deals.listForMap, { now: Date.now() })).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]); // still not a canonical deal
  });

  it("leaves existing published workflow records and an expired new offer's rejection unchanged", async () => {
    configure(); stubExtraction({ endDate: "2026-10-02" });
    const t = convexTest(schema, modules), owner = alice(t);
    const seeded = await t.run(async ctx => {
      const jobId = await ctx.db.insert("workflowJobs", { owner: "legacy", fingerprint: "legacy", inputJson: "{}", status: "completed", createdAt: 1, updatedAt: 1, attempt: 1 });
      const id = await ctx.db.insert("workflowDeals", { jobId, dataJson: JSON.stringify({ deal: { ...deal, confidence: 0.5 }, restaurant: place, candidates: [place], status: "ready", reviewReasons: [] }),
        status: "published", timezone: "America/Vancouver", sourceUrl: null, createdAt: 1 });
      return { id, row: await ctx.db.get(id) };
    });
    await owner.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify(input) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(ctx => ctx.db.get(seeded.id))).toEqual(seeded.row);
    const rows = await t.run(ctx => ctx.db.query("workflowDeals").collect());
    expect(rows.map(r => r.status).sort()).toEqual(["published", "rejected"]); // expired stays rejected, not needs_review
    expect(await t.query(api.workflow.deals.listForMap, { now: Date.now() })).toHaveLength(1);
  });
});

describe("explicit models and typed env (no implicit model name, no provider request without them)", () => {
  it("copies only the workflow names from the typed env", () => {
    const picked = pickWorkflowEnv({ ...keys, GEMINI_MODEL: "m", REEL_PROVIDER_USAGE_AUTHORIZED: "true", SCRAPECREATORS_API_KEY: "secret", GEMINI_IMAGE_MODEL: "x" });
    expect(Object.keys(picked).sort()).toEqual([...WORKFLOW_ENV_NAMES].sort());
    expect(JSON.stringify(picked)).not.toContain("secret");
  });

  it("needs the separate gate, a key and an explicit model per feature; other gates never enable workflow spend", () => {
    const base = { GEMINI_API_KEY: "k", GEMINI_SEARCH_MODEL: "s", GEMINI_WEB_SEARCH_MODEL: "w", GEMINI_COMPARISON_MODEL: "c", GEMINI_MODEL: "p" };
    expect(searchProviders(base)).toEqual({ understand: null, web: null });
    expect(comparisonProvider(base)).toBeNull();
    const otherGates = { ...base, REEL_PROVIDER_USAGE_AUTHORIZED: "true", REEL_MEDIA_USAGE_AUTHORIZED: "true", IMAGE_PROVIDER_USAGE_AUTHORIZED: "true", GEOCODE_USAGE_AUTHORIZED: "true" };
    expect(searchProviders(pickWorkflowEnv(otherGates))).toEqual({ understand: null, web: null });
    const on = { ...base, WORKFLOW_PROVIDER_USAGE_AUTHORIZED: "true" };
    expect(searchProviders(on)).toEqual({ understand: { apiKey: "k", model: "s" }, web: { apiKey: "k", model: "w" } });
    expect(comparisonProvider(on)).toEqual({ apiKey: "k", model: "c" });
    expect(searchProviders({ ...on, GEMINI_SEARCH_MODEL: "  " }).understand).toBeNull();
    expect(searchProviders({ ...on, GEMINI_WEB_SEARCH_MODEL: undefined })).toEqual({ understand: { apiKey: "k", model: "s" }, web: null });
    expect(comparisonProvider({ ...on, GEMINI_COMPARISON_MODEL: undefined })).toBeNull(); // GEMINI_MODEL is not a silent substitute
    expect(comparisonProvider({ ...on, GEMINI_API_KEY: " " })).toBeNull();
  });

  it("refuses extraction without GEMINI_MODEL before any request, and treats a fallback as optional", async () => {
    expect(() => liveDependencies({ ...keys })).toThrow(expect.objectContaining({ code: "CONFIGURATION", message: expect.stringContaining("GEMINI_MODEL") }));
    expect(() => liveDependencies({ ...keys, GEMINI_MODEL: "   " })).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ deals: [deal], rejectionReason: null }));
    const deps = liveDependencies({ ...keys, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODEL: " " }, fetcher);
    await deps.extract(inputSchema.parse(input));
    expect(String(fetcher.mock.calls[0][0])).toContain("/primary-model:generateContent");
    const withFallback = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ wrong: true })).mockResolvedValueOnce(modelResponse({ deals: [deal], rejectionReason: null }));
    await liveDependencies({ ...keys, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODEL: "fallback-model" }, withFallback).extract(inputSchema.parse(input));
    expect(String(withFallback.mock.calls[1][0])).toContain("/fallback-model:generateContent");
  });

  it("a queued job with keys and the gate but no model fails closed with no provider request", async () => {
    configure(); vi.stubEnv("GEMINI_MODEL", "");
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    const t = convexTest(schema, modules), owner = alice(t);
    const { jobId } = await owner.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify(input) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await owner.query(api.workflow.jobs.get, { jobId })).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("search and comparison make no request when only GEMINI_MODEL (or no explicit model) is configured", async () => {
    configure();
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    const t = convexTest(schema, modules), owner = alice(t);
    expect((await owner.action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "ramen" }) })).recommendations).toEqual([]);
    const ids = await t.run(async ctx => {
      const jobId = await ctx.db.insert("workflowJobs", { owner: "x", fingerprint: "f", inputJson: "{}", status: "completed", createdAt: 1, updatedAt: 1, attempt: 1 });
      return Promise.all(["a", "b"].map(name => ctx.db.insert("workflowDeals", { jobId, status: "published", timezone: "America/Vancouver", sourceUrl: null, createdAt: 1,
        dataJson: JSON.stringify({ deal: { ...deal, restaurantName: name, endDate: "2026-10-31" }, restaurant: { ...place, name, placeId: `p-${name}` }, candidates: [], status: "ready", reviewReasons: [] }) })));
    });
    const result = await owner.action(api.workflow.compare.find, { inputJson: JSON.stringify({ dealIds: ids, priority: "taste", tasteEvidence: [
      { dealId: ids[0], quote: "The broth was balanced and excellent.", sourceUrl: "https://example.com/a" }, { dealId: ids[1], quote: "The broth was rather salty.", sourceUrl: "https://example.com/b" }] }) });
    expect(result.mode).toBe("evidence_only");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses exactly the configured search, web-search and comparison models", async () => {
    configure({ GEMINI_SEARCH_MODEL: "model-search", GEMINI_WEB_SEARCH_MODEL: "model-web", GEMINI_COMPARISON_MODEL: "model-compare" });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes("model-search")
      ? modelResponse({ keywords: ["nothing"], excludeKeywords: [], city: null, maxPrice: null, currency: null, maxDistanceKm: null, requiresOrigin: false, availableNow: false, sortBy: "relevance", unsupportedNeeds: [] })
      : Response.json({ candidates: [{ finishReason: "STOP" }] }));
    vi.stubGlobal("fetch", fetcher);
    const t = convexTest(schema, modules);
    await alice(t).action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "ramen" }) });
    const urls = fetcher.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain("/model-search:generateContent");
    expect(urls[1]).toContain("/model-web:generateContent");
    expect(urls.some(url => url.includes("gemini-3") || url.includes("gemini-2"))).toBe(false);
  });

  it("scans the preserved runtime sources: typed env only, no implicit model names, no client keys", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThanOrEqual(25);
    for (const [path, text] of files) {
      expect(text, `${path} reads process.env`).not.toMatch(/process\.env/);
      expect(text, `${path} hardcodes a Gemini model name`).not.toMatch(/["'`]gemini-[0-9]/);
      expect(text, `${path} references a public client variable`).not.toMatch(/NEXT_PUBLIC_/);
    }
  });
});

describe("Instagram/Meta retrieval stays prohibited and supplied text/image provenance is retained", () => {
  it("never asks the provider to read an Instagram or Meta CDN URL, and keeps text/image/caption/provenance sources", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ deals: [deal], rejectionReason: null }));
    for (const url of ["https://www.instagram.com/reel/AbCdEf123/", "https://scontent.cdninstagram.com/v/x.mp4", "https://video.fbcdn.net/x.mp4"])
      expect(inputSchema.safeParse({ source: { type: "url", url } }).success, url).toBe(false);
    const source = { type: "text" as const, text: input.source.text, sourceUrl: "https://www.instagram.com/reel/AbCdEf123/", publishedAt: "2026-10-01" };
    await extractWithGemini(inputSchema.parse({ source }), { apiKey: "k", model: "m", fetcher });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.tools).toBeUndefined();
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ sourceText: input.source.text, publishedAt: "2026-10-01" });
    expect(inputSchema.parse({ source }).source).toMatchObject({ sourceUrl: "https://www.instagram.com/reel/AbCdEf123/" });
  });
});
