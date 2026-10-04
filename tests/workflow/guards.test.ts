/// <reference types="vite/client" />
// N-REMOTE-A review corrections: no Instagram/Meta source retrieval and no live provider call without a separate
// usage authorization. Provider traffic is a SYNTHETIC mocked fetch; nothing here touches a real provider.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { inputSchema, isBlockedSourceHost } from "../../lib/workflow/contracts";
import { extractWithGemini } from "../../lib/workflow/gemini";
import { liveDependencies, processDeal } from "../../lib/workflow/workflow";
import { input } from "./fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T20:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("blocks Instagram and Meta CDN hosts exactly, not look-alike hosts", () => {
  for (const host of ["instagram.com", "www.instagram.com", "m.instagram.com", "scontent.cdninstagram.com", "video.fbcdn.net", "instagr.am", "ig.me", "INSTAGRAM.COM"])
    expect(isBlockedSourceHost(host), host).toBe(true);
  for (const host of ["myinstagram.com", "instagram.com.example.org", "example.com", "notfbcdn.net", "restaurant.ca"])
    expect(isBlockedSourceHost(host), host).toBe(false);
});
it("rejects Instagram/Meta URL sources but keeps other public links, text attribution and images", () => {
  for (const url of ["https://www.instagram.com/reel/AbCdEf123/", "https://instagram.com/p/x", "https://scontent.cdninstagram.com/v/x.mp4", "https://instagr.am/p/x"])
    expect(inputSchema.safeParse({ source: { type: "url", url, caption: "Pasted caption with an offer" } }).success, url).toBe(false);
  expect(inputSchema.safeParse({ source: { type: "url", url: "https://example.com/menu" } }).success).toBe(true);
  expect(inputSchema.safeParse({ source: { type: "text", text: "Pasted caption with an offer", sourceUrl: "https://www.instagram.com/reel/AbCdEf123/" } }).success).toBe(true);
});
it("never reaches a provider for an Instagram URL, even if the schema is bypassed", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(processDeal({ source: { type: "url", url: "https://www.instagram.com/p/x" } }, { extract: input => extractWithGemini(input, { apiKey: "k", model: "m", fetcher }), locate: async () => [] }))
    .rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("live providers need the separate usage authorization after the keys", () => {
  const keys = { GEMINI_API_KEY: "fake", GEOAPIFY_API_KEY: "fake" };
  expect(() => liveDependencies(keys)).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
  expect(() => liveDependencies({ ...keys, WORKFLOW_PROVIDER_USAGE_AUTHORIZED: "yes" })).toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
  expect(() => liveDependencies({})).toThrow("GEMINI_API_KEY");
  expect(() => liveDependencies({ ...keys, WORKFLOW_PROVIDER_USAGE_AUTHORIZED: "true" })).not.toThrow();
});
it("a queued job fails closed with no provider traffic when usage is not authorized", async () => {
  vi.stubEnv("GEMINI_API_KEY", "fake-gemini"); vi.stubEnv("GEOAPIFY_API_KEY", "fake-geo"); vi.stubEnv("WORKFLOW_PROVIDER_USAGE_AUTHORIZED", "");
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  const t = convexTest(schema, modules), alice = t.withIdentity({ subject: "alice|session" });
  const { jobId } = await alice.mutation(api.workflow.jobs.submit, { inputJson: JSON.stringify(input) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = await alice.query(api.workflow.jobs.get, { jobId });
  expect(job).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
  expect(fetcher).not.toHaveBeenCalled();
});
it("search and comparison do not call Gemini without authorization", async () => {
  vi.stubEnv("GEMINI_API_KEY", "fake-gemini"); vi.stubEnv("WORKFLOW_PROVIDER_USAGE_AUTHORIZED", "");
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  const t = convexTest(schema, modules), alice = t.withIdentity({ subject: "alice|session" });
  const result = await alice.action(api.workflow.search.find, { inputJson: JSON.stringify({ query: "ramen" }) });
  expect(result.recommendations).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
