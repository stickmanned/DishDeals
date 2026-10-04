import { afterEach, describe, expect, it, vi } from "vitest";
import { demoKey, loadDemoFixture, type DemoInput } from "../../lib/demoCache";
import { extractOutcomeToDrafts } from "../../lib/extractionDraft";
const bytes = (s: string) => new TextEncoder().encode(s);
const input: DemoInput = { original: bytes("abc"), images: [{ bytes: bytes("actual-model-image"), mimeType: "image/png" }], caption: "CAD10", promptVersion: "test-prompt-v1" };
// Explicitly synthetic model output, confined to this test. Not a genuine fixture.
const outcome = { result: { isDeal: true, deals: [{ restaurant: "Synthetic", address: null, dealText: "Synthetic offer", priceCad: 10, validDays: [], validStart: null, validEnd: null, expiresOn: null, conditions: [], confidence: { restaurant: .7, priceCad: .6, hours: .2, expiresOn: .1 } }] }, manualReview: [{ dealIndex: 0, code: "FUTURE_START", blocking: true, detail: "Synthetic future-start blocker" }], requiresBlockingReview: true, model: "synthetic-model" };
async function fixture() {
 const key = await demoKey(input);
 return { version: 1, ...key, provenance: { kind: "live-provider-capture", capturedAt: "2026-10-04T07:00:00Z", evidenceReference: "synthetic-test-reference-not-real-evidence", model: outcome.model }, outcome: structuredClone(outcome) };
}
const fetchJson = (value: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
afterEach(() => vi.useRealTimers());
describe("demo cache exact-source and context matching (synthetic only)", () => {
 it("uses actual SHA256 and changes key for model bytes, MIME, caption, publication, order or prompt", async () => {
  const key = await demoKey(input);
  expect(key.sourceSha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const changed of [ { caption: "CAD11" }, { text: "new context" }, { publishedAt: "2026-10-05" }, { provenanceUrl: "https://instagram.com/reel/example" }, { promptVersion: "test-v2" }, { images: [{ bytes: bytes("different"), mimeType: "image/png" }] }, { images: [{ bytes: input.images[0].bytes, mimeType: "image/jpeg" }] } ]) {
   expect((await demoKey({ ...input, ...changed })).requestSha256).not.toBe(key.requestSha256);
  }
  const images = [...input.images, { bytes: bytes("second"), mimeType: "image/png" }];
  expect((await demoKey({ ...input, images })).requestSha256).not.toBe((await demoKey({ ...input, images: images.toReversed() })).requestSha256);
 });
 it("rejects oversized, empty, unsupported inputs", async () => {
  for (const altered of [ { original: new Uint8Array() }, { images: [] }, { images: [{ bytes: bytes("bad"), mimeType: "video/mp4" }] }, { promptVersion: " " }, { caption: "a".repeat(20001) }, { images: [{ bytes: new Uint8Array(5 * 1024 * 1024 + 1), mimeType: "image/png" }] } ]) await expect(demoKey({ ...input, ...altered })).rejects.toThrow();
 });
 it("returns an unchanged envelope with blocker and unreviewed draft", async () => {
  const key = await demoKey(input), f = await fixture(), fetch = fetchJson(f);
  const result = await loadDemoFixture(key, { fetch });
  expect(result.status).toBe("hit");
  expect(fetch.mock.calls[0][0]).toBe(`/fixtures/demo/${key.sourceSha256}.json`);
  if (result.status === "hit") {
   expect(result.outcome).toEqual(outcome);
   const drafts = extractOutcomeToDrafts(result.outcome);
   expect(drafts[0].fields.restaurant.isReviewed).toBe(false);
   expect(drafts[0].location).toBeNull();
   expect(drafts[0].reviewIssues[0].blocking).toBe(true);
  }
 });
 it.each(["sourceSha256", "requestSha256", "promptVersion"])("refuses stale %s", async field => {
  const key = await demoKey(input), f = await fixture();
  const changed = { ...f, [field]: field === "promptVersion" ? "other" : "a".repeat(64) };
  expect((await loadDemoFixture(key, { fetch: fetchJson(changed) })).status).toBe("miss");
 });
 it("rejects malformed envelope, invented confidence, bare result, missing/incorrect provenance and stripped sidecar", async () => {
  const key = await demoKey(input), f = await fixture();
  const badScore = structuredClone(f); badScore.outcome.result.deals[0].confidence.hours = 2;
  const invalids = [ { ...f, outcome: outcome.result }, { ...f, provenance: { ...f.provenance, model: "different" } }, { ...f, provenance: { ...f.provenance, kind: "synthetic" } }, { ...f, outcome: { ...outcome, requiresBlockingReview: false } }, { ...f, provenance: null }, badScore, { ...f, extra: "ignored?" } ];
  for (const invalid of invalids) expect((await loadDemoFixture(key, { fetch: fetchJson(invalid) })).status).toBe("miss");
 });
 it("reports missing, non-ok, malformed JSON and over-cap body safely", async () => {
  const key = await demoKey(input);
  expect(await loadDemoFixture(key, { fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })) })).toEqual({ status: "miss", reason: "missing" });
  for (const response of [new Response(null, { status: 503 }), new Response("{broken"), new Response("a".repeat(2*1024*1024+1)), new Response("{}", { headers: { "Content-Length": "99999999" } })]) expect((await loadDemoFixture(key, { fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).status).toBe("miss");
 });
 it("bounds stalled headers without depending on abort support", async () => {
  const key = await demoKey(input); vi.useFakeTimers();
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
  const pending = loadDemoFixture(key, { fetch, timeoutMs: 50 });
  await vi.advanceTimersByTimeAsync(51);
  expect(await pending).toEqual({ status: "miss", reason: "unavailable" });
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
 });
 it("bounds stalled body and cancels reader without waiting for stalled cancel", async () => {
  const key = await demoKey(input); vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const response = new Response(new ReadableStream({ pull: () => new Promise<void>(() => {}), cancel }));
  const pending = loadDemoFixture(key, { fetch: vi.fn<typeof fetch>().mockResolvedValue(response), timeoutMs: 50 });
  await vi.advanceTimersByTimeAsync(51);
  expect((await pending).status).toBe("miss"); expect(cancel).toHaveBeenCalledOnce();
 });
 it("honors explicit cancel and rejects invalid configuration before fetching", async () => {
  const key = await demoKey(input), abort = new AbortController(), fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
  const pending = loadDemoFixture(key, { fetch, signal: abort.signal }); abort.abort();
  expect(await pending).toEqual({ status: "miss", reason: "canceled" });
  fetch.mockClear();
  expect((await loadDemoFixture(key, { fetch, signal: abort.signal })).status).toBe("miss");
  expect((await loadDemoFixture({ ...key, sourceSha256: "../bad" }, { fetch })).status).toBe("miss");
  expect((await loadDemoFixture(key, { fetch, timeoutMs: Infinity })).status).toBe("miss"); expect(fetch).not.toHaveBeenCalled();
 });
});
